import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { setTimeout as delay } from "node:timers/promises";
import type { DynamicTool } from "@get-bb/plugin-sdk/provider-bridge";
import type { SdkSessionOptions } from "./sdk-session.js";
import { buildBridgeMcpServer } from "./tool-proxy-mcp.js";
import { BB_BRIDGE_MCP_SERVER_NAME } from "../tool-classification.js";

async function* promptWithoutMessages(
  signal: AbortSignal,
): AsyncGenerator<SDKUserMessage> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/**
 * Some third-party Anthropic-compatible gateways answer the token-count API
 * slowly or not at all, and the default full breakdown issues one token-count
 * request per context category, so a gateway that cannot answer them turns a
 * single read into dozens of failing requests. When a full read is still
 * pending after this delay, read the summary alongside it instead.
 */
const FULL_CONTEXT_USAGE_FALLBACK_DELAY_MS = 3_000;

/** How the context meter reads a breakdown for this provider. */
export interface ClaudeContextUsagePolicy {
  /** `auto` tries the full breakdown and falls back to the summary; `summary` never sends token-count requests. */
  mode: "auto" | "summary";
  /** How long to keep reading only summaries after a full read was too slow. */
  retryMs: number;
  /** Stop trying the full breakdown after this many slow reads; 0 keeps trying. */
  maxAttempts: number;
}

export const DEFAULT_CLAUDE_CONTEXT_USAGE_POLICY: ClaudeContextUsagePolicy = {
  mode: "auto",
  retryMs: 10 * 60_000,
  maxAttempts: 0,
};

interface FullBreakdownState {
  attempts: number;
  retryAt: number;
  disabled: boolean;
  policyKey: string;
}

const fullBreakdownByModel = new Map<string, FullBreakdownState>();

function policyKey(policy: ClaudeContextUsagePolicy): string {
  return `${policy.retryMs}:${policy.maxAttempts}`;
}

/** Test seam: forget what earlier reads learned about each model. */
export function resetClaudeContextUsagePolicyState(): void {
  fullBreakdownByModel.clear();
}

function shouldSkipFullBreakdown(
  model: string | undefined,
  policy: ClaudeContextUsagePolicy,
): boolean {
  if (policy.mode === "summary") return true;
  if (model === undefined) return false;
  const state = fullBreakdownByModel.get(model);
  if (state === undefined) return false;
  if (state.policyKey !== policyKey(policy)) {
    fullBreakdownByModel.delete(model);
    return false;
  }
  if (state.disabled) return true;
  return Date.now() < state.retryAt;
}

function recordFullBreakdownFailure(
  model: string | undefined,
  policy: ClaudeContextUsagePolicy,
): void {
  if (model === undefined) return;
  const state = fullBreakdownByModel.get(model) ?? {
    attempts: 0,
    retryAt: 0,
    disabled: false,
    policyKey: policyKey(policy),
  };
  state.attempts += 1;
  state.retryAt = Date.now() + policy.retryMs;
  state.disabled =
    policy.maxAttempts > 0 && state.attempts >= policy.maxAttempts;
  fullBreakdownByModel.set(model, state);
}

function recordFullBreakdownSuccess(model: string | undefined): void {
  if (model === undefined) return;
  fullBreakdownByModel.delete(model);
}

type ContextUsageSession = {
  getContextUsage: (options?: {
    detail?: "summary" | "full";
  }) => Promise<unknown>;
};

function readSummary(session: ContextUsageSession): Promise<unknown> {
  return session.getContextUsage({ detail: "summary" });
}

export async function readClaudeContextUsageReport(
  session: ContextUsageSession,
  model: string | undefined,
  policy: ClaudeContextUsagePolicy = DEFAULT_CLAUDE_CONTEXT_USAGE_POLICY,
): Promise<unknown> {
  if (shouldSkipFullBreakdown(model, policy)) {
    return readSummary(session);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fallbackDue = (): void => {};
  const slowFullRead = new Promise<"slow">((resolve) => {
    fallbackDue = () => resolve("slow");
    timer = setTimeout(fallbackDue, FULL_CONTEXT_USAGE_FALLBACK_DELAY_MS);
    timer.unref();
  });
  const fullRead = session.getContextUsage();
  fullRead.catch(() => undefined);
  const settled = await Promise.race([
    fullRead.then(
      (value) => ({ answered: true as const, value }),
      () => ({ answered: false as const, value: undefined }),
    ),
    slowFullRead,
  ]).finally(() => {
    clearTimeout(timer);
    fallbackDue();
  });
  if (settled !== "slow" && settled.answered) {
    recordFullBreakdownSuccess(model);
    return settled.value;
  }
  recordFullBreakdownFailure(model, policy);
  const summaryRead = readSummary(session);
  summaryRead.catch(() => undefined);
  return settled === "slow"
    ? Promise.race([summaryRead, fullRead])
    : summaryRead;
}

export async function readIsolatedClaudeContextUsage(args: {
  sessionOptions: SdkSessionOptions;
  providerSessionId: string;
  dynamicTools: DynamicTool[];
  signal: AbortSignal;
  policy?: ClaudeContextUsagePolicy | undefined;
}): Promise<unknown> {
  args.signal.throwIfAborted();
  const options = args.sessionOptions;
  const end = new AbortController();
  const session = query({
    prompt: promptWithoutMessages(end.signal),
    options: {
      cwd: options.cwd,
      systemPrompt: options.systemPrompt,
      model: options.model,
      effort: options.effort,
      thinking: options.thinking,
      env: options.env,
      pathToClaudeCodeExecutable: options.pathToClaudeCodeExecutable,
      plugins: options.plugins,
      extraArgs: options.extraArgs,
      additionalDirectories: options.additionalDirectories
        ? [...options.additionalDirectories]
        : [],
      sandbox: options.sandbox,
      settingSources: ["user", "project", "local"],
      settings: {
        ...(typeof options.settings === "object" ? options.settings : {}),
        disableAllHooks: true,
      },
      resume: args.providerSessionId,
      forkSession: true,
      persistSession: false,
      canUseTool: async () => ({
        behavior: "deny",
        message: "Context reporting cannot execute tools.",
      }),
      ...(args.dynamicTools.length > 0
        ? {
            mcpServers: {
              [BB_BRIDGE_MCP_SERVER_NAME]: buildBridgeMcpServer(
                args.dynamicTools,
                async () => ({
                  content: "Context reporting cannot execute tools.",
                  isError: true,
                }),
              ),
            },
            allowedTools: options.allowedTools,
          }
        : {}),
    },
  });
  const close = (): void => {
    end.abort();
    session.close();
  };
  args.signal.addEventListener("abort", close, { once: true });
  try {
    args.signal.throwIfAborted();
    await session.initializationResult();
    while (args.dynamicTools.length > 0) {
      const server = (await session.mcpServerStatus()).find(
        (server) => server.name === BB_BRIDGE_MCP_SERVER_NAME,
      );
      if (server?.status === "connected") break;
      if (server && server.status !== "pending") return null;
      await delay(25, undefined, { signal: args.signal });
    }
    return await readClaudeContextUsageReport(
      session,
      options.model,
      args.policy ?? DEFAULT_CLAUDE_CONTEXT_USAGE_POLICY,
    );
  } finally {
    args.signal.removeEventListener("abort", close);
    close();
  }
}
