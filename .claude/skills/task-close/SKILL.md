---
name: task-close
description: Close a task session — verify commits, tests, dependencies, and file ownership against the CLAUDE.md rules and the TASKS.md wave plan, then write the session's ledger annotation. Use when the user says /task-close, "close this task", "wrap up the session", or when a task's work is finished and the ledger row needs its human columns filled in.
---

# task-close

Makes the second half of the `CLAUDE.md` session ritual executable. Checks the
rules a reviewer would otherwise check by hand — including the one that only
matters when agents run concurrently — then writes the four ledger cells no
transcript can report.

## Invoke

Run it first with no arguments. It runs the checks and prints the three
questions:

```bash
python3 .claude/skills/task-close/close.py
```

Ask the user those three questions — one line each, do not guess the answers,
and in particular do not infer `interventions` from the transcript — then run
it again with them:

```bash
python3 .claude/skills/task-close/close.py \
    --interventions 7/3/1 --tests-added 12 --qa-result pass \
    --notes "optimistic delete; rollback ordering was the hard part"
```

`interventions` is `accepted/edited/rejected` counted against **proposals the
agent made**, not messages exchanged. `docs/LEDGER.md` defines each. The ratio
is the number worth watching, so a guessed one is worse than none.

Finally, commit. The script stages `docs/LEDGER.md` and prints the subject
line to use — the row belongs with the work it measures.

## The checks

| # | Rule | Behaviour |
|---|---|---|
| 1 | rule 1 — no code without a task ID | Fails if nothing is claimed. |
| 2 | the repo's own gates | `npm run typecheck`, `lint`, `test`. Prints `no package.json — skipping` before the scaffold exists; fails on any non-zero exit after it. |
| 3 | rule 5 — a criterion is not met until a test names it | Greps the test files for each claimed ID and prints `met` with `file:line` or `part`. **Reports, does not fail** — `◐` implemented-but-untested is an honest state, and a check that forced it to be `☑` would only teach people to write a test that names an ID and asserts nothing. |
| 4 | rule 3 — every commit references a criterion | Every commit on the branch that touches application code must carry `[AC-...]` in its subject. `docs/`, `.github/`, `.claude/`, `scripts/`, and root-level config and markdown are not application code. |
| 5 | rule 4 — an ADR before any new dependency | Diffs `dependencies` (not `devDependencies`) against `main`. A new one requires a changed file under `docs/adr/` on the branch. |
| 6 | `TASKS.md` — one writer per path, per wave | Every changed file must match this task's `Writes` cell in the File ownership table. Spec, tooling, CI and test files are exempt: every task writes tests and appends a ledger row. |

Check 6 is the one that makes three concurrent pull requests merge, and it is
a harder constraint than the dependency graph. It separates two failures that
look alike and are not:

- a file in the task's **`Reads (never writes)`** cell — a frozen contract. An
  agent that edits one breaks every other agent in the wave, and the damage
  surfaces two waves later in someone else's tests. Stop; blocker.
- a file **no pattern covers** — either it belongs to another task, or the
  ownership table has a gap. Both are the Architect's to resolve.

Checks 2, 4, 5 and 6 fail the run. Nothing is written to the ledger when any
check fails — a row that records a passing close of a failing session is worse
than no row.

## What the failures mean

| Failure | What to do |
|---|---|
| `no task is claimed` | Run `/task-start <TASK-ID>`, or `scripts/task.sh <TASK-ID>` if the work is already done. An `untagged` row is accurate about tokens and useless as evidence. |
| `npm run … failed` | Fix it. The last 15 lines are printed. |
| `touch application code without an [AC-...] id` | Either the work was not asked for, or the criterion is missing from `ACCEPTANCE.md`. Both are findings. Amend the subject if it is the former; raise it with the Architect if it is the latter. |
| `added with no ADR touched on this branch` | Rule 4 — the ADR comes first, with its build-vs-buy section. Write it, or drop the dependency. |
| `the last row in docs/LEDGER.md is X, not Y` | `--annotate latest` writes to the last row, and it is not this task's. Let the `Stop` hook write this session's row and retry, or annotate by session id with `scripts/ledger.py --annotate <session-id>`. |
| `written outside this task's lane` | Do not widen the lane to make it pass. Either revert the file, or write a blocker — `TASKS.md` is explicit that a task needing to write a file it does not own has found a spec gap. |
| `no File ownership row` | The plan does not assign this task any files. Ask the Architect for a row before three branches collide. |
| `annotation is partial` | All three of `--interventions`, `--tests-added`, `--qa-result` are required together. A half-filled row invites a reader to assume the blanks are zeroes. |

## Under concurrency

Three agents in a wave produce three sessions and three ledger rows, and
attribution is unaffected — one session, one task, exactly as before. Two
things do change:

- **`docs/LEDGER.md` conflicts on every concurrent pull request.** Resolution
  is always *take both sides*, ordered by timestamp. Never drop a row to clear
  a conflict. This skill stages the ledger separately and prints its own commit
  subject so the conflict is isolated to one hunk, per `TASKS.md`.
- **The row `--annotate latest` targets may not be yours.** After a rebase
  brings another agent's row in, `latest` is theirs. The attribution guard
  below catches it; do not work around it.

The script refuses to touch a measured column — that is `ledger.py`'s rule, and
this skill goes through `ledger.py --annotate` rather than around it.
