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
- `Automatically approve plans`: a plugin-wide option, off by default. Enable it with `bb plugin config provider-claude-code-variant set autoApprovePlans true`. It approves only Plan proposals; it does not change other tool permissions. This is not currently a per-thread picker control.

## Maintaining this fork

Agent instructions for reviewing and adapting official BB changes are in [UPSTREAM_MAINTENANCE.md](./UPSTREAM_MAINTENANCE.md). Follow that runbook before syncing or porting upstream code.

## Requirements

- Install the Claude Code CLI (`claude`) on the host machine. The plugin can run the installer for you.
- Sign in with `claude` on that machine. bb reads the sign-in state to show account and plan.
- `Claude in Chrome` needs the Chrome extension and a claude.ai login on the host.
