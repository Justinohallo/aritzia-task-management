#!/usr/bin/env bash
# session-start.sh - SessionStart hook for Claude Code on the web.
#
# A cloud session clones only its own branch. Two things in this repo assume
# `main` is reachable and a task is claimed:
#   - .claude/skills/task-close/close.py diffs the branch against main/origin/main
#   - scripts/ledger.py attributes the session's row to .current-task
# Neither exists in a fresh container. This hook fetches main and, if no task
# is claimed, says so where the agent will read it. Anything it prints on
# stdout is added to the session's context.
#
# Runs only in cloud sessions ($CLAUDE_CODE_REMOTE); locally both already hold.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT" || exit 0

if git rev-parse --verify --quiet origin/main >/dev/null; then
  echo "session-start: origin/main already present."
elif git fetch --quiet origin main 2>/dev/null; then
  echo "session-start: fetched origin/main (task-close diffs against it)."
else
  echo "session-start: WARNING could not fetch origin/main; task-close will fail until it exists."
fi

if [ -f "$ROOT/.current-task" ]; then
  echo "session-start: current task is $(cat "$ROOT/.current-task")."
else
  echo "session-start: no task is claimed in this container. Run /task-start T-NN (or scripts/task.sh <ID>) before writing anything, or this session's ledger row is written as untagged (CLAUDE.md rule 1)."
fi

exit 0
