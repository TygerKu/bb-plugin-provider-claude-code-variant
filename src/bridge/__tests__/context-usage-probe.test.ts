import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readClaudeContextUsageReport,
  resetClaudeContextUsagePolicyState,
} from "../context-usage-probe.js";

const report = {
  totalTokens: 1_000,
  rawMaxTokens: 10_000,
  model: "claude-test",
  isAutoCompactEnabled: false,
  categories: [],
};

const DEFAULT_POLICY = {
  mode: "auto" as const,
  retryMs: 10 * 60_000,
  maxAttempts: 0,
};

afterEach(() => {
  vi.useRealTimers();
  resetClaudeContextUsagePolicyState();
});

function pendingFullReport(
  options?: { detail?: "summary" | "full" },
): Promise<unknown> {
  return options?.detail === "summary"
    ? Promise.resolve(report)
    : new Promise(() => {});
}



describe("claude context usage report", () => {
  it("uses the full breakdown when it answers before the fallback delay", async () => {
    const getContextUsage = vi.fn().mockResolvedValue(report);
    await expect(
      readClaudeContextUsageReport({ getContextUsage }, "claude-test"),
    ).resolves.toBe(report);
    expect(getContextUsage).toHaveBeenCalledOnce();
    expect(getContextUsage).toHaveBeenCalledWith();
  });

  it("falls back to the summary when the full breakdown is slow", async () => {
    vi.useFakeTimers();
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      pendingFullReport(options),
    );
    const pending = readClaudeContextUsageReport(
      { getContextUsage },
      "slow-model",
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(pending).resolves.toBe(report);
    expect(getContextUsage.mock.calls).toEqual([[], [{ detail: "summary" }]]);
  });

  it("prefers a full breakdown that answers while the summary is pending", async () => {
    vi.useFakeTimers();
    let resolveFull!: (value: unknown) => void;
    const full = new Promise((resolve) => {
      resolveFull = resolve;
    });
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      options?.detail === "summary" ? new Promise(() => {}) : full,
    );
    const pending = readClaudeContextUsageReport(
      { getContextUsage },
      "claude-test",
    );
    await vi.advanceTimersByTimeAsync(3_000);
    resolveFull(report);
    await expect(pending).resolves.toBe(report);
  });

  it("falls back to the summary when the full breakdown rejects early", async () => {
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      options?.detail === "summary"
        ? Promise.resolve(report)
        : Promise.reject(new Error("Unsupported request")),
    );
    await expect(
      readClaudeContextUsageReport({ getContextUsage }, "rejecting-model"),
    ).resolves.toBe(report);
    expect(getContextUsage.mock.calls).toEqual([[], [{ detail: "summary" }]]);
  });

  it("skips the full breakdown after it timed out for the same model", async () => {
    vi.useFakeTimers();
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      pendingFullReport(options),
    );
    const first = readClaudeContextUsageReport(
      { getContextUsage },
      "known-slow-model",
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(first).resolves.toBe(report);
    getContextUsage.mockClear();

    await expect(
      readClaudeContextUsageReport({ getContextUsage }, "known-slow-model"),
    ).resolves.toBe(report);
    expect(getContextUsage.mock.calls).toEqual([[{ detail: "summary" }]]);
  });

  it("probes the full breakdown again once the skip window expires", async () => {
    vi.useFakeTimers();
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      pendingFullReport(options),
    );
    const first = readClaudeContextUsageReport(
      { getContextUsage },
      "retried-model",
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(first).resolves.toBe(report);
    getContextUsage.mockClear();

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const second = readClaudeContextUsageReport(
      { getContextUsage },
      "retried-model",
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(second).resolves.toBe(report);
    expect(getContextUsage.mock.calls).toEqual([[], [{ detail: "summary" }]]);
  });

  it("rejects when neither read answers", async () => {
    vi.useFakeTimers();
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      options?.detail === "summary"
        ? Promise.reject(new Error("Unsupported request"))
        : new Promise(() => {}),
    );
    const pending = readClaudeContextUsageReport(
      { getContextUsage },
      "failing-model",
    );
    const assertion = expect(pending).rejects.toThrow("Unsupported request");
    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;
  });

  it("never sends token-count requests when the policy reads summaries only", async () => {
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      pendingFullReport(options),
    );
    await expect(
      readClaudeContextUsageReport({ getContextUsage }, "summary-only-model", {
        mode: "summary",
        retryMs: 600_000,
        maxAttempts: 0,
      }),
    ).resolves.toBe(report);
    expect(getContextUsage.mock.calls).toEqual([[{ detail: "summary" }]]);
  });

  it("honours a configured retry interval", async () => {
    vi.useFakeTimers();
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      pendingFullReport(options),
    );
    const policy = { mode: "auto" as const, retryMs: 30_000, maxAttempts: 0 };
    const first = readClaudeContextUsageReport(
      { getContextUsage },
      "short-retry-model",
      policy,
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(first).resolves.toBe(report);
    getContextUsage.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);
    const second = readClaudeContextUsageReport(
      { getContextUsage },
      "short-retry-model",
      policy,
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(second).resolves.toBe(report);
    expect(getContextUsage.mock.calls).toEqual([[], [{ detail: "summary" }]]);
  });

  it("stops probing the full breakdown after the configured attempt limit", async () => {
    vi.useFakeTimers();
    const getContextUsage = vi.fn((options?: { detail?: "summary" | "full" }) =>
      pendingFullReport(options),
    );
    const policy = { mode: "auto" as const, retryMs: 0, maxAttempts: 2 };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const pending = readClaudeContextUsageReport(
        { getContextUsage },
        "limited-model",
        policy,
      );
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(pending).resolves.toBe(report);
    }
    expect(
      getContextUsage.mock.calls.filter((call) => call.length === 0),
    ).toHaveLength(2);

    getContextUsage.mockClear();
    await expect(
      readClaudeContextUsageReport(
        { getContextUsage },
        "limited-model",
        policy,
      ),
    ).resolves.toBe(report);
    expect(getContextUsage.mock.calls).toEqual([[{ detail: "summary" }]]);
  });

  it("restores the full breakdown after a successful read", async () => {
    vi.useFakeTimers();
    const getContextUsage = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementation((options?: { detail?: "summary" | "full" }) =>
        options?.detail === "summary"
          ? Promise.resolve(report)
          : Promise.resolve(report),
      );
    const policy = { mode: "auto" as const, retryMs: 1, maxAttempts: 2 };
    const first = readClaudeContextUsageReport(
      { getContextUsage },
      "recovering-model",
      policy,
    );
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(first).resolves.toBe(report);

    await vi.advanceTimersByTimeAsync(1);
    await expect(
      readClaudeContextUsageReport(
        { getContextUsage },
        "recovering-model",
        policy,
      ),
    ).resolves.toBe(report);
    expect(getContextUsage.mock.calls.at(-1)).toEqual([]);
  });
});
