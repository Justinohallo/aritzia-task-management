#!/usr/bin/env bash
# task.sh - set, show, or clear the current task id used for ledger attribution.
#
#   scripts/task.sh SETUP-02          set the current task
#   scripts/task.sh SETUP-02 AC-1,AC-2  set the task and its criteria ids
#   scripts/task.sh                   show the current task
#   scripts/task.sh --clear           clear it
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TASK_FILE="$ROOT/.current-task"
CRIT_FILE="$ROOT/.current-criteria"

case "${1:-}" in
  "")
    if [[ -f "$TASK_FILE" ]]; then
      printf 'task:     %s\n' "$(cat "$TASK_FILE")"
      if [[ -f "$CRIT_FILE" ]]; then
        printf 'criteria: %s\n' "$(cat "$CRIT_FILE")"
      fi
    else
      echo "no current task set. Run: scripts/task.sh <TASK-ID>" >&2
      exit 1
    fi
    ;;
  --clear)
    rm -f "$TASK_FILE" "$CRIT_FILE"
    echo "current task cleared"
    ;;
  -h|--help)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    printf '%s\n' "$1" > "$TASK_FILE"
    if [[ -n "${2:-}" ]]; then
      printf '%s\n' "$2" > "$CRIT_FILE"
      echo "current task set to $1 (criteria: $2)"
    else
      rm -f "$CRIT_FILE"
      echo "current task set to $1"
    fi
    ;;
esac
