# Upstream maintenance runbook

This document is the operating procedure for an agent maintaining this fork. Follow it before checking, importing, or adapting changes from the official BB repository. Do not assume a clean tree, silently discard user changes, or merge upstream directly into a dirty checkout.

## Repository roles

- Fork being maintained: this plugin directory, `bb-plugin-provider-claude-code-variant`.
- Official upstream: `https://github.com/get-bb/bb.git`.
- Upstream reference checkout: create a fresh checkout in a new, empty sibling directory such as `../bb-upstream` when a suitable clean checkout is not already available. Verify its remote before use.
- Product identity: plugin ID `provider-claude-code-variant`, provider ID `claude-code-variant`. Do not change or replace the official `provider-claude-code` / `claude-code` identities.

The fork is a standalone plugin, not a Git clone of the upstream monorepo. Upstream changes must be reviewed in the monorepo and adapted into this plugin deliberately; do not copy whole upstream directories or overwrite this fork with an upstream provider.

## Safety requirements

1. Begin with read-only inspection: verify repository paths, remotes, branches, and `git status` in every checkout involved. Read applicable `AGENTS.md` / `CLAUDE.md` instructions.
2. Preserve all pre-existing edits and untracked files. Never use destructive cleanup (`reset --hard`, `clean`, forced checkout, or equivalent) to make a comparison or merge easier.
3. If the upstream checkout has uncommitted changes, do not pull, merge, rebase, stash, or modify it. First identify and record those changes with `git diff`, `git diff --cached`, and `git ls-files --others --exclude-standard`. Ask the user only if the requested task cannot proceed safely without deciding how to preserve or commit them.
4. Fetch upstream refs before comparing. Fetching updates remote-tracking refs only; it does not merge code into a working tree.
5. Review the upstream commit range and relevant file diffs before adapting anything. Do not assume upstream changes are compatible with this fork's SDK version or custom behavior.
6. Apply reviewed changes in the standalone fork, preserving its distinct identities and features. Do not modify the installed plugin or change BB settings as part of upstream review unless explicitly requested.
7. Run the standalone test, typecheck, and build commands listed below after code changes. Report commands and results, including failures and skipped checks.
8. Do not commit, push, install, or publish unless explicitly requested by the user.

## Upstream check procedure

### Prepare a safe upstream checkout

First inspect the fork checkout and the expected upstream paths read-only. If a candidate upstream checkout exists, inspect its remotes, branch, status, and applicable `AGENTS.md` / `CLAUDE.md` before doing anything else. Confirm that its fetch URL is exactly the official upstream `https://github.com/get-bb/bb.git` (SSH form `git@github.com:get-bb/bb.git` is also acceptable). Do not fetch from or modify an unexpected repository.

If no upstream checkout exists, create one in a new, empty directory outside the fork, preferably `../bb-upstream` (or another new sibling directory if that path already exists). Verify the destination does not exist and is not the fork or nested inside it before cloning. Clone the official repository there, then verify its `origin` URL, branch/status, and instructions. Never clone into or overwrite a pre-existing directory; if an intended destination already exists but is not a verified checkout, choose another new path or ask the user rather than deleting or reusing it. Do not use the plugin's own working directory for the upstream clone.

For example, from the parent directory of the plugin fork, after confirming `../bb-upstream` is absent:

```bash
git clone https://github.com/get-bb/bb.git ../bb-upstream
```

A fresh clone starts clean, but still verify the status before fetching or comparing. If network access or cloning is unavailable, report the blocker and do not claim the update check is complete. Do not run dependency installation, build, or other upstream project scripts just to inspect history/diffs.

### Choose a version-compatible upstream baseline

Before fetching or comparing upstream changes, determine the BB version the user is actually running in the target environment. Prefer the installed application's/CLI's reported version (for example, `bb --version` where that is the relevant installation); do not infer it from this plugin checkout's branch, package version, or the latest upstream commit. Also inspect this plugin's declared Plugin SDK/API dependency so compatibility-sensitive changes can be evaluated against the host contract.

Use the official upstream tag or release commit corresponding to that installed BB version as the comparison target. Release tags may include a product prefix (for example, `desktop-v0.48.1` for BB 0.48.1), so search tags for the exact version rather than assuming a `v<version>` naming scheme. Confirm the tag's commit and release metadata before treating it as the baseline; package/plugin version numbers are not necessarily the BB application version. Do not use `origin/main` by default: it may contain unreleased changes that the installed BB version cannot support. If the installed build identifies a commit rather than a release tag, use that exact commit when available. If no reliable version-to-tag/commit mapping can be established, stop before adapting code and report what is missing; ask the user to identify the intended installed version or explicitly authorize tracking unreleased upstream changes. Use `origin/main` only when the user explicitly wants unreleased work considered, and keep those changes clearly separated from the version-compatible baseline.

The plugin's declared `engines.bb` range is a compatibility range, not evidence of which BB version is installed. Record it separately from the user's runtime version. Also record the declared Plugin SDK/API dependency and assess changes against the host contract; do not assume that a matching BB release tag alone guarantees compatibility with every SDK version the plugin claims to support.

The chosen target must be recorded in the review summary (installed BB version, target tag/commit, and whether any additional unreleased commits were examined). Fetching remote refs is safe after the checkout checks below, but fetch does not establish that `origin/main` is the right target.

Run from the upstream monorepo checkout after verifying it is the intended official checkout:

```bash
git remote -v
git status --short --branch
```

If an existing upstream checkout is dirty, follow the dirty-checkout procedure below and do not fetch or modify it. It may be left untouched while you provision a fresh checkout in a different new, empty sibling directory as described above. Do not reuse or delete the dirty checkout. If no safe destination can be established, stop and report the blocker. If the checkout selected for comparison is clean, fetch refs and verify the selected version tag/commit exists:

```bash
git fetch origin
git tag --list
```

Set `<target>` to the verified version tag or commit selected above. If the working tree is clean, identify the current base and inspect commits through that target:

```bash
git merge-base HEAD <target>
git log --oneline --decorate HEAD..<target>
git diff --stat HEAD...<target>
git diff --name-status HEAD...<target>
```

Then inspect diffs relevant to the feature being maintained. For provider behavior, start with:

```bash
git diff HEAD...<target> -- plugins/provider-claude-code/
```

For picker/session-option behavior, inspect the relevant files under `apps/app/`, `packages/`, and `plugins/provider-claude-code/`, locating the current implementation rather than relying on old line numbers. Search both source and tests for the setting/option names involved.

If the checkout is dirty, record the delta without changing it:

```bash
git diff --stat
git diff --name-status
git diff
git diff --cached
git ls-files --others --exclude-standard
```

Do not use `HEAD...origin/main` as a complete explanation of dirty working-tree edits: inspect committed upstream history and local uncommitted changes separately. Never treat `git pull` as a comparison command.

## Adapting upstream changes

For each upstream change that may affect this fork:

1. State the upstream commit(s) and files reviewed.
2. Determine whether the fork's provider behavior, Plugin SDK contract, host bridge, settings, picker options, or tests depend on the changed code.
3. Port only the needed behavior into the standalone plugin; preserve the fork's plugin/provider IDs, Claude orange icon tint, default-off `autoApprovePlans`, and all other fork-specific features.
4. Update or add focused regression tests for changed behavior.
5. Run from this plugin directory:

```bash
npm test
npm run typecheck
bb plugin build .
```

6. Summarize the commits checked, changes adapted or intentionally skipped (with reasons), changed files, and verification results. Do not say the installed copy was updated unless installation was explicitly requested and succeeded.

## Feature: per-thread Plan approval picker option

The desired UX is a provider-picker option labeled **Automatically approve plans**, independently selectable alongside the Fast service tier. The current `autoApprovePlans` setting is plugin-wide and defaults to `false`; it is not currently exposed in the thread picker. Do not claim that the picker control exists until it is implemented and verified in the running BB app.

Do not encode plan approval as another `serviceTier` value. A service tier is a single-choice field, so doing so would make Fast and plan approval mutually exclusive and would misrepresent the meaning of service tiers.

The BB monorepo has a typed per-model session-option contract (`AvailableModel.sessionOptions`, including `type: "boolean"`) and picker/session-option UI paths. Before implementation, trace the current upstream path end to end: model catalog declaration, new-thread selection and persistence, existing-thread editing, create/update/tell request contracts, server resolution, runtime/provider bridge transport, and the provider's session/turn behavior. Confirm whether the current host/plugin SDK lets this fork declare and receive that option without a core contract change. The provider must map the selected thread value to the existing `autoApprovePlans` behavior and preserve the global setting only as a default/fallback if the contract supports that cleanly. Keep the option thread-scoped; do not change the global setting as a side effect.

Add regression tests proving: (1) a new thread can choose on/off, (2) the choice survives persistence/reload, (3) an existing thread can change it for a later turn, (4) it reaches the provider bridge/session behavior, (5) Fast can be selected at the same time, and (6) the default/global behavior remains backward-compatible. Verify the option is visible in the picker in the actual built BB app before reporting it complete. If the installed SDK/API cannot support this through plugin-only code, document the required core/SDK changes and do not fake the toggle by adding a tier or a global setting control.
