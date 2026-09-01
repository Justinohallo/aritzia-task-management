---
name: task-start
description: Claim a task from docs/TASKS.md and load its spec context before any code is written. Use at the start of a Builder session, when the user says /task-start, "start T-04", "claim T-06", or asks to begin a task or a wave from the build plan. Enforces one session to one task, refuses to open a wave while an earlier wave is unclosed, and prints the task's criteria, its owned file paths, and the ADRs to read.
---

# task-start

Makes the first half of the `CLAUDE.md` session ritual executable: claim the
task, and put its specification in front of the model before it writes
anything.

Under the wave plan in `TASKS.md` it does one more thing, and it is the more
important one — it tells an agent **which wave it is in, who else is running,
and which files it owns**. Three agents building at once cannot each be
trusted to re-read the ownership table.

## Invoke

```bash
python3 .claude/skills/task-start/start.py T-04
python3 .claude/skills/task-start/start.py T-04 AC-ADD-1,AC-ADD-2
```

The second argument narrows what this session is claiming credit for in the
ledger. Omit it to claim the task without pinning criteria; the script still
prints every criterion `docs/TASKS.md` assigns to the task.

## Then

**Branch off the latest `main`, never off another agent's branch.** The
summary prints the branch name to use.

**Write only the files the summary says this task owns.** A task that needs to
write a file it does not own has found a spec gap and writes a blocker — it
does not widen its own lane. `/task-close` fails the session if it did.

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
| `is in wave N, and … are not closed` | Every task in every earlier wave must be closed first. This is deliberately wider than the task's own `Depends on` cell: `TASKS.md` rule 2 for concurrent agents is that a wave does not open until the previous one is merged and `main` is green, and a per-task check would let an agent start against a half-built wave. |
| `no File ownership row for T-NN` | The plan does not say which files this task owns, so three concurrent branches will collide. Ask the Architect before writing. |
| `which ACCEPTANCE.md does not define` | `TASKS.md` and `ACCEPTANCE.md` contradict each other. That is a spec finding, and it goes back to the Architect. Do not pick whichever one is convenient. |

## A note on parsing

The script reads the Sequence and File ownership tables **by column header**,
never by position. That is not fussiness: the Sequence table gained a `Wave`
column between `Est.` and `Depends on`, and the earlier positional version read
the wave number as the dependency cell, found no `T-NN` in `**1**`, and
reported every task as having no dependencies. It failed **open** — three
wave-1 agents would each have been told they were clear to start against an
unbuilt T-01.

Everything the script needs is in `docs/`. It adds no dependency and touches
no application code.
