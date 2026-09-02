---
name: task-start
description: Claim a task from docs/TASKS.md and load its spec context before any code is written. Use at the start of a Builder session, when the user says /task-start, "start T-04", "claim T-06", or asks to begin a task or a wave from the build plan. Enforces one session to one task, refuses to open a wave while an earlier wave is unclosed or a same-wave dependency is unclosed, runs scripts/spec-lint.py first, and prints the task's criteria, its owned file paths, and the ADRs to read. --dry-run <ID> rehearses a claim; --dry-run all rehearses the whole plan.
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

### Rehearse instead of claim

```bash
python3 .claude/skills/task-start/start.py --dry-run T-12    # one task
python3 .claude/skills/task-start/start.py --dry-run all     # the whole plan
```

`--dry-run <ID>` runs every check and prints the same summary, and writes
nothing. Use it to ask "could T-12 open now?" from any session without
claiming it — an Architect checking a wave, an operator deciding what to
start next.

`--dry-run all` walks every task in wave order against a **simulated ledger**
that starts empty and closes each task the moment it opens. It prints the
order the plan would run in, the lane each task owns, and fails on any task
that could never open: a dependency in a later wave (the pre-ARCH-03 T-14
deadlock, `B-03`), a dependency the Sequence table does not list, a cycle
inside a wave, a missing detail section, or a criterion or ADR that does not
resolve. The Architect runs it after every amendment to `TASKS.md`, before
the next wave opens. T-00 validated the gate by closing T-00 — the one task
that could not trip it; this is the input that can.

## Then

**Branch off the latest `main`, never off another agent's branch.** The
summary prints the branch name to use; a cloud session's platform-assigned
`claude/<slug>-<suffix>` is equally fine (`B-16`).

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

## The checks

In order. The first failure stops the run, and nothing is claimed.

| # | Check | Why |
|---|---|---|
| 0 | `scripts/spec-lint.py` passes on `docs/` | The spec is the definition of done. If it contradicts itself — estimates that do not sum, a criterion assigned to two tasks, a dangling `AC-` or ADR reference — nothing should be built against it until the Architect has resolved the finding. |
| 1 | no other task is claimed in this session | `CLAUDE.md` rule 2. Reported, not enforced, under `--dry-run`. |
| 2 | the task has a Sequence row *and* a detail section | Half a spec is not a spec. |
| 3 | every task in every earlier wave is closed, and so is every task in this task's own `Depends on` cell | `TASKS.md` rule 2, both halves: a wave does not open until the previous one is merged, and inside a wave the cell still holds — T-12 waits for T-11 (`B-14`). |
| 4 | every criterion the task names exists in `ACCEPTANCE.md` | `TASKS.md` and `ACCEPTANCE.md` must agree on the universe. |
| 5 | every ADR the detail references exists | The summary tells the agent to read them; they had better be there. |

After the checks pass, the script **prints every `BLOCKERS.md` row whose
Resolution is `open`**, with rows that name this task or a path in its
ownership row first. That is a warning, not a refusal — refusing would hold
every wave on the Architect's calendar (T-17).

A task is *closed* when `docs/LEDGER.md` has a row for it whose `qa_result`
is set — which is what `/task-close` writes.

## What the failures mean

The script validates everything before it claims anything, so a failed run
leaves the session exactly as it found it.

| Failure | What to do |
|---|---|
| `scripts/spec-lint.py failed on docs/` | The spec contradicts itself; the findings are printed. That is the Architect's to resolve in a `docs:` commit — do not pick whichever reading is convenient, and do not edit the spec from a Builder session. |
| `this session already holds T-NN` | `CLAUDE.md` rule 2. Two tasks in one session produce one ledger row that belongs honestly to neither. `/clear` first. |
| `not in the Sequence table` | The task does not exist yet. The Architect adds it; a Builder does not. |
| `no ### section under Task detail` | The spec is half-written. Stop and report it as a blocker. |
| `is in wave N, and … are not closed` | Every task in every earlier wave must be closed first. This is deliberately wider than the task's own `Depends on` cell: `TASKS.md` rule 2 for concurrent agents is that a wave does not open until the previous one is merged and `main` is green, and a per-task check would let an agent start against a half-built wave. |
| `depends on T-NN, in the same wave, and it is not closed` | The other half of rule 2. Wave 5 is a chain: T-11 → T-12 → T-13. Close the dependency first; it cannot be run alongside. |
| `depends on T-NN, in a later wave` | The plan deadlocks on this task (`B-03`). Only the Architect can move one of them. |
| `no File ownership row for T-NN` | Printed, not fatal: T-12, T-13 and T-15 have none because they write no application code. If this task does need to write some, ask the Architect for a row first — `/task-close` fails a lane-less task that wrote application code. |
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
no application code. `--root DIR` points it at another checkout, which is how
its own failure modes are tested against mutated copies of the plan.
