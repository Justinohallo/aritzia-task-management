# CLAUDE.md

Guidance for Claude Code sessions in this repository.

## Repository status

Scaffolding. Repository guardrails and the session ledger are in place; the
application stack has not been chosen yet. See `README.md` and
`docs/REPO-PROTECTIONS.md`.

## Session ledger — read this before starting work

Every session produces one row in [`docs/LEDGER.md`](docs/LEDGER.md) with exact
token counts and API-equivalent cost, attributed to a task. The row is written
automatically by `scripts/ledger.py`, registered as a `Stop` and `SessionEnd`
hook in `.claude/settings.json`. Three rules make the numbers mean something:

**1. Set the task before starting work.**

```bash
scripts/task.sh AZ-14              # sets .current-task
scripts/task.sh AZ-14 AC-1,AC-3    # optionally record criteria ids too
scripts/task.sh                    # show the current task
scripts/task.sh --clear            # clear it
```

`CLAUDE_TASK_ID` in the environment works as an alternative. If neither is set
the row is written as `untagged` and the hook prints a warning — the token
counts are still correct, but the row cannot be attributed.

**2. One session, or one `/clear`, per task.** The attribution rule is one
session to one task. When you move to a different task, start a new session or
`/clear` and re-run `scripts/task.sh`. Two tasks sharing a session produce one
row that belongs honestly to neither.

**3. The ledger row is committed with the task's final commit.** The hook
updates `docs/LEDGER.md` in the working tree; it does not commit. Stage the
ledger change alongside the code change that finishes the task, so the row and
the work land together.

`.current-task` and `.current-criteria` are gitignored — they are per-session
local state, not repository content.

### Auditing the numbers

- Rates live in one constant, `PRICES_USD_PER_MTOK` in `scripts/ledger.py`.
- `python3 scripts/ledger.py --selfcheck` prints the full cost arithmetic
  against a reference set of counts so the table can be checked line by line.
- `python3 scripts/ledger.py --transcript <path>` re-derives a row by hand.
- The hook fails loudly: on any error it prints to stderr, exits non-zero, and
  writes nothing. A missing row is never a silently corrupted row.

## Working in this repo

`main` is protected. All work lands through a pull request from a branch. See
`CONTRIBUTING.md`.

This is a **public** repository. Never commit secrets — see `SECURITY.md`.
