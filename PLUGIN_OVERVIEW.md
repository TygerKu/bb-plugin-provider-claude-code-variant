Start a thread, pick Claude Code, and let it work in your repository from bb. The plugin drives the Claude Code CLI on the host machine. It streams the agent's work into the bb timeline.

## What you get

- Permission modes `accept-edits`, `auto`, and `full`, plus a plan action in the composer.
- Reasoning levels from Low to Max, plus Ultracode, which turns on multi-agent workflow orchestration.
- Checkpoint forks, manual compaction, and native questions from the agent.
- Claude Code skills and provider-native CLAUDE.md or supported AGENTS.md files
  from your home directory and project.
- Health, usage, and install status for Claude Code on each host, with an install or update action.

## Settings

- `Claude Code memory`: let Claude Code read and write its auto-memory.
- `Disable provider subagents`: hide native Agent, Task, and ListAgents tools so the agent delegates through bb. Changes restart Claude before the next turn, preserving the conversation.
- `Disable Workflow tool`: hide the native Workflow tool.
- `Claude in Chrome`: start Claude Code with the browser tools.
- `Command descriptions`: title Bash command rows with Claude's short description instead of the raw command.
- `Automatically approve plans`: a per-thread option, off by default, selectable in the model picker alongside the Fast service tier. It approves only Plan proposals; it does not change other tool permissions. The global setting of the same name, changed with `bb plugin config provider-claude-code-variant set autoApprovePlans true`, applies only to threads without their own selection.

## Maintaining this fork

This repository carries the official provider's Git history on the `upstream/provider-claude-code` branch, so upstream sync is a merge rather than a hand-ported patch series. The procedure, conflict guidance, and the list of features to preserve are in [UPSTREAM_MAINTENANCE.md](./UPSTREAM_MAINTENANCE.md).

## Requirements

- Install the Claude Code CLI (`claude`) on the host machine. The plugin can run the installer for you.
- Sign in with `claude` on that machine. bb reads the sign-in state to show account and plan.
- `Claude in Chrome` needs the Chrome extension and a claude.ai login on the host.
