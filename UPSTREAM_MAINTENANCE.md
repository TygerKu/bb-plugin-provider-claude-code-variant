# Upstream maintenance runbook

This document is the operating procedure for an agent maintaining this fork. The fork now carries the official provider's Git history, so syncing upstream is a merge, not a hand-ported patch series.

## Repository roles

- Fork being maintained: this repository, `bb-plugin-provider-claude-code-variant`.
- Official upstream: `https://github.com/get-bb/bb.git`, path `plugins/provider-claude-code`.
- Upstream mirror branch in this repository: `upstream/provider-claude-code`. It is a `git subtree split` of the upstream plugin directory, so it contains only that directory's history at repository root.
- Baseline tag: `upstream-desktop-vX.Y.Z` marks the upstream release this fork is built on.
- Product identity: plugin ID `provider-claude-code-variant`, provider ID `claude-code-variant`. Never change them back to the official `provider-claude-code` / `claude-code`.

The fork keeps a thin feature layer on top of upstream. `git diff upstream/provider-claude-code..master` should stay small and readable; if it grows large, look for accidental upstream drift rather than new features.

## Safety requirements

1. Begin with read-only inspection: `git status`, `git log --oneline -5`, and `git remote -v`.
2. Preserve all pre-existing edits and untracked files. Never use destructive cleanup (`reset --hard`, `clean`, forced checkout) to make a merge easier.
3. Fetch upstream refs before comparing. Fetching does not change the working tree.
4. Review the upstream commit range before merging. Do not assume upstream changes are compatible with this fork's identity, SDK pin, or custom behavior.
5. Preserve the fork's identities, the Claude orange icon tint, and every fork feature listed below.
6. Run the test, typecheck, and build commands below after code changes. Report commands and results, including failures and skipped checks.
7. Do not commit, push, install, or publish unless explicitly requested by the user.

## Choosing the sync target

Determine the BB version actually installed (`bb --version`) before syncing. Use the matching upstream release tag (`desktop-v<version>`), not `origin/main`, unless the user explicitly wants unreleased work. Release tags may carry a product prefix, so search for the exact version rather than assuming a `v<version>` scheme.

Record the installed BB version and the upstream tag or commit used.

## Sync procedure

```bash
# 1. Update the upstream monorepo checkout (outside this repository)
cd ../bb-upstream
git remote -v                       # must be get-bb/bb
git status --short --branch         # must be clean; never sync from a dirty tree
git fetch origin --tags

# 2. Refresh the mirrored history at the chosen release
git branch -D provider-sync 2>/dev/null
git subtree split --prefix=plugins/provider-claude-code desktop-v0.49.0 -b provider-sync

# 3. Bring it into the fork
cd ../bb-plugin-provider-claude-code-variant
git fetch ../bb-upstream provider-sync:refs/heads/upstream/provider-claude-code
git tag -a upstream-desktop-v0.49.0 -m "Official provider-claude-code at bb desktop-v0.49.0" upstream/provider-claude-code

# 4. Merge upstream into the feature layer
git merge upstream/provider-claude-code
```

`git subtree split` is deterministic for the same upstream tree, so a re-split produces the same commits and the merge stays a fast-forward or a small three-way merge.

If the upstream checkout is dirty, do not pull, merge, rebase, stash, or modify it. Clone a fresh checkout in a new, empty sibling directory instead.

## Resolving merge conflicts

Expect conflicts where the fork and upstream add different fields in the same place: provider settings in `server.ts`, schemas in `src/session-params.ts` and `src/bridge/commands.ts`, and their tests.

Resolve by keeping both sides and re-checking structure. A common failure is keeping both blocks while losing a closing `},` or a `default:` line; run the typecheck immediately after resolving, before running tests.

Never resolve a conflict by dropping an upstream field. If an upstream change conflicts with a fork feature, keep the fork feature and adapt the upstream change around it, then note the deviation in the merge commit.

## Post-sync checks

Run from this repository:

```bash
npm install          # only when package.json dependencies changed
npm test
npm run typecheck
bb plugin build .
bb plugin types . --check
```

All four must pass. `bb plugin types --check` must report that the pinned `@get-bb/plugin-sdk` matches the host; a "legacy vendored SDK layout" warning means the `tsconfig.json` `paths` mapping was reintroduced and must be removed.

Report: installed BB version, upstream tag and commit merged, conflicts resolved and how, fork features verified, and each command's result.

## Fork features to preserve

- Per-thread `autoApprovePlans` session option, labeled "Automatically approve plans", selectable in the model picker independently of the Fast service tier.
- Global `autoApprovePlans` setting, off by default, used only as the fallback when a thread has no explicit selection.
- The bridge publishes the resolved option through extension state and approves `ExitPlanMode` without prompting when it is on, then restores the approved plan's permission mode.
- Context reporting works behind gateways that zero the assistant message's `usage` or cannot answer the token-count API:
  - `src/sdk-extraction.ts` (`extractClaudeStreamRequestContextTokens`) reads prompt tokens from streamed `message_delta` usage when the buffered assistant message reports none.
  - `src/bridge/context-usage-probe.ts` (`readClaudeContextUsageReport`) starts a `detail: "summary"` read when the default full breakdown is still pending after 3 seconds, so a gateway without a token-count endpoint still produces a snapshot.
  - That probe is policy-driven: the `contextUsageDetail` (`auto` or `summary`), `contextUsageRetryMinutes`, and `contextUsageMaxAttempts` settings decide whether the per-category breakdown is tried, how long to keep reading summaries after it timed out, and when to stop trying it for a model. Keep the settings wired through `server.ts` -> `src/session-params.ts` -> `src/bridge/commands.ts` -> `liveSettings.contextUsagePolicy`.
- Plugin and provider identities, display names, and the orange icon tint.

Do not encode plan approval as a `serviceTier` value: a service tier is single-choice, which would make Fast and plan approval mutually exclusive.

Regression tests that must keep passing:

1. A new thread can select the option on or off.
2. The selection survives persistence and reload.
3. An existing thread can change it for a later turn.
4. It reaches the provider bridge and changes plan approval behavior.
5. Fast can be selected at the same time.
6. The global default still applies when a thread has no selection.
7. Context usage is reported when the assistant message's `usage` is zeroed but streamed deltas carry real counts.
8. Context usage falls back to the SDK summary read when the full breakdown is slow, and the official-API stream shape (output tokens only in `message_delta`) never overrides assistant usage.
9. The context usage policy settings reach the probe: `summary` mode never sends token-count requests, a custom retry interval is honoured, and the attempt limit disables the full breakdown for that model.
