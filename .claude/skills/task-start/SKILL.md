---
name: task-start
description: Claim a task from docs/TASKS.md and load its spec context before any code is written. Use at the start of a Builder session, when the user says /task-start, "start T-04", "claim T-06", or asks to begin a task from the build plan. Enforces one session to one task, checks the dependency is closed in the ledger, and prints the task's acceptance criteria and the ADRs to read.
---

# task-start

Makes the first half of the `CLAUDE.md` session ritual executable: claim the
task, and put its specification in front of the model before it writes
anything.

## Invoke

```bash
python3 .claude/skills/task-start/start.py T-04
python3 .claude/skills/task-start/start.py T-04 AC-ADD-1,AC-ADD-2
```

The second argument narrows what this session is claiming credit for in the
ledger. Omit it to claim the task without pinning criteria; the script still
prints every criterion `docs/TASKS.md` assigns to the task.

## Then

**Read every ADR the summary lists, in full, before writing a line.** The
script prints their paths and stops there on purpose — it will not summarise a
decision record, because a summarised ADR is how a decision gets quietly
relitigated. Read the task detail and the Gherkin blocks it prints too; they
are the definition of done, not context.

Then build, with tests naming their criterion IDs, and close with
`/task-close`.

## What the failures mean

The script validates everything before it claims anything, so a failed run
leaves the session exactly as it found it.

| Failure | What to do |
|---|---|
| `this session already holds T-NN` | `CLAUDE.md` rule 2. Two tasks in one session produce one ledger row that belongs honestly to neither. `/clear` first. |
| `not in the Sequence table` | The task does not exist yet. The Architect adds it; a Builder does not. |
| `no ### section under Task detail` | The spec is half-written. Stop and report it as a blocker. |
| `depends on T-NN, which has no closed row` | The dependency has no ledger row with a `qa_result`. Finish it, or ask the Architect to change the order. `T-02`/`T-03` are exempt — `TASKS.md` says they may run in parallel. |
| `which ACCEPTANCE.md does not define` | `TASKS.md` and `ACCEPTANCE.md` contradict each other. That is a spec finding, and it goes back to the Architect. Do not pick whichever one is convenient. |

Everything the script needs is in `docs/`. It adds no dependency and touches
no application code.
