# 15 · Process instrumentation

> **In one paragraph.** The application was built by AI agent sessions, one
> per task, and the process is instrumented so its cost and quality can be
> read afterwards. Three roles with hard boundaries (Architect writes spec,
> Builder writes code, QA marks criteria); a task id claimed before any code;
> a ledger row per session with exact token counts and list-price cost,
> written by a hook; commit subjects and PR titles that carry criterion IDs;
> a spec that lints itself; and a wave plan with a file-ownership map so
> three sessions can build concurrently without editing each other's files.
> This page explains the machinery; [`CLAUDE.md`](../../CLAUDE.md) states the rules.

## The concept: traceability in both directions

The claim `PROJECT.md` makes is that a requirement can be traced to the code
that satisfies it and the test that proves it, and that the *cost* of
producing that code is a number rather than an impression. Both need
attribution to survive contact with the tooling:

- **Requirement → criterion → test → commit.** Each link is a string that
  can be grepped: `AC-API-9` appears in `ACCEPTANCE.md`, in a test name, and
  in a commit subject. A reviewer runs one `git grep` and sees all three.
- **Session → task → cost.** Each session claims one task before writing
  anything; the hook writes one row with the task id and the token counts.
  Two tasks in one session produce one row that belongs to neither, which
  is why the rule is one session per task.

## The roles

| Role | Writes | Never writes |
|---|---|---|
| **Architect** | `docs/PROJECT.md`, `ACCEPTANCE.md`, `adr/`, `TASKS.md`; resolves blockers | Application code |
| **Builder** | Application code and tests for one task, within its file lane; a blocker row | Any spec file; a status mark |
| **QA** | Status marks in `ACCEPTANCE.md`, each naming a test; blocker rows | Application code; spec content |

The line that matters: **a Builder that edits the spec to match what it
built has destroyed the only independent measure of whether the build is
correct.** When the spec is wrong, the Builder stops and writes a blocker.
The Architect amends the spec in its own `docs:` commit. Twenty-four blocker
rows were raised during this build (`B-01..B-24` in
[`BLOCKERS.md`](../BLOCKERS.md)) and resolved across three Architect passes
(ARCH-03, ARCH-04, ARCH-05); each amendment is a recorded decision rather
than a silent divergence.

## The task claim

```bash
scripts/task.sh T-08 AC-API-1,AC-API-2,…   # writes .current-task and .current-criteria (gitignored)
```

Or `/task-start T-08`, the repo skill, which additionally:

- runs `spec-lint.py` first, and refuses to claim a task on a spec that fails it;
- refuses to open a wave-*N+1* task while any wave-*N* task is unclosed, or a
  same-wave dependency is unclosed, by reading the ledger on `main`;
- prints the task's criteria, its owned file paths, and the ADRs to read;
- warns about open blocker rows.

`.current-task` is per-container local state. The `SessionEnd` hook reads it
to attribute the row; without it the row is written as `untagged`, which is
an accurate token record that is useless as evidence.

## The ledger

`docs/LEDGER.md` has one row per session. `scripts/ledger.py` writes it as a
`SessionEnd` hook (`.claude/settings.json`), from the session transcript:

| Column group | Source | Hand-editable? |
|---|---|---|
| `input_tokens`, `output_tokens`, `cache_write_tokens`, `cache_read_tokens` | Per-response `usage` objects, deduplicated by `message.id` (Claude Code writes one line per content block and repeats the usage on each) | **No.** `--annotate` refuses them. |
| `api_cost_usd`, `models (% of cost)` | The counts priced at `PRICES_USD_PER_MTOK`, the one constant, with cache writes priced by their 5-minute or 1-hour TTL | No |
| `wall_clock_min`, `api_time_min`, `leverage_ratio` | Derived from timestamps; API time is the interval per request from trigger to final response | No |
| `task_id`, `criteria_ids` | `.current-task`, `.current-criteria` | Via the claim, not the row |
| `interventions (accepted/edited/rejected)`, `tests_added`, `qa_result`, `notes` | The human, via `--annotate` or `/task-close` | Yes; that is what they are for |

The pricing is deliberately legible: cache reads cost 0.1× base input
(0.025× on the current model) and dominate raw token counts by 10:1 or more,
so quoting a single "total tokens" would make a session look an order of
magnitude larger than its economics. The four columns are four different
things. `--selfcheck` prints the arithmetic against reference counts;
`--transcript <path> --breakdown` re-derives any row.

The script fails loudly: any error prints to stderr, exits non-zero and
writes nothing. A missing row is never a silently corrupted row. Backfilled
rows are labelled as such in `notes` and stay visibly unreconciled.

**Why `SessionEnd` and not `Stop`.** The platform's `Stop` hook asks for a
clean tree after every turn. A ledger row rewritten per turn forced a commit
and a push per turn; each push redeployed and re-ran CI; each of those woke
the session for another turn. The loop ran until the budget was gone, and
cost roughly $70 of T-01's $84.70 (ARCH-04). The row is now written once at
close, and a Builder session never subscribes to its own PR's activity.

`LEDGER.md` also states what it cannot measure: human review time, subagent
usage in separate transcripts, sessions where the hook never fired, and the
final response of a cloud session's closing turn.

## Commits and pull requests

```
feat(tasks): T-08 optimistic create and delete with reconcile and rollback [AC-API-1..2, AC-API-7..9, AC-API-11..12, AC-ADD-8, AC-DEL-2]
```

Conventional Commits prefix, task id, criterion IDs in brackets. A commit
that touches application code and references no criterion is either work
nobody asked for or a criterion missing from the spec, and the rule finds
both. `chore:` and `docs:` are exempt.

`main` is squash-merged, so only the PR title survives, so the PR title must
carry the union of the branch's criteria. Repo Guard enforces it
([page 14](14-ci-and-security.md)). The `git log` on `main` is therefore a
list of tasks with their criteria, which is the trace the presentation walks.

## `/task-close`

The second half of the ritual, executable. `close.py` checks:

1. A task is claimed.
2. The repo's own gates pass: typecheck, lint, test, **build, bundle test**, in order, so the `AC-API-3` search runs against a real build at every close.
3. Each claimed criterion is named in a test (reports, does not fail: `◐` is an honest state).
4. Every commit touching application code carries `[AC-…]`.
5. No new runtime dependency without an ADR that names it.
6. **Every changed file is in this task's `Writes` lane** in `TASKS.md`'s file-ownership table.

Then it asks for the three human answers (`interventions`, `tests_added`,
`qa_result`), annotates the row, stages `docs/LEDGER.md`, and prints the
commit subject.

Check 6 is the one that makes concurrent agents safe. It separates two
failures that look alike: writing a file in another task's lane (revert it,
or it is a blocker), and writing a *frozen contract* from T-01 (stop; every
other agent in the wave built against it).

## Waves and file ownership

`TASKS.md` orders 18 tasks into six waves of up to three concurrent
sessions, and the parallelism comes from one observation: most dependencies
are **contract dependencies, not code dependencies**. A task needs to know a
type or an HTTP shape, not to see its implementation. T-01 froze every
shared contract, and the chain collapsed from 17h15m sequential to 9h45m in
waves.

Each task has a `Writes` cell and a `Reads (never writes)` cell. Three
sessions in a wave write disjoint paths, so their PRs merge without
conflict except in `docs/LEDGER.md`, where the resolution is always "keep
both rows, ordered by timestamp". The wave gate is `main` green with every
PR of the wave merged, and `task-start` refuses to open the next wave until
the ledger says so.

## The spec lints itself

`scripts/spec-lint.py`, stdlib only, four checks ([page 14](14-ci-and-security.md)):
estimates sum, references resolve, ADR counts agree, every criterion is
assigned to exactly one task. It runs before every task claim and on every
PR. The pages in this deep dive are under `docs/`, so every `AC-` ID and
every relative link in them is checked too.

## Blockers

`docs/BLOCKERS.md` is the one file under `docs/` a Builder or QA session
appends to. One row per finding: what contradicts what, with the file and
the criterion. The Architect fills in the resolution and the commit. Nothing
is closed by the session that opened it. Before a wave opens, every `open`
row is resolved in an Architect session, because a wave that opens over an
open row builds on a spec someone has already said is wrong.

## The cloud sessions

Sessions run on Claude Code on the web, one per task, from `main`.
`docs/OPERATOR.md` is the human runbook: the Builder prompt, the close
message, the merge steps, and a table of where the cloud differs from a
terminal (no `/clear`; platform-named branches; a fresh container each
session; the `SessionStart` hook that fetches `origin/main` so `task-close`
can diff against it). The one human's job per task is four messages and
three clicks; the session does the rest and the ledger records what it cost.

## What to discuss

**"Isn't this a lot of process for a to-do app?"** The process is the
second deliverable. `PROJECT.md` §1: the app is the evidence, the
presentation is the argument, and "I work this way with AI" needs numbers.
The ledger, the criterion-carrying commits and the intervention column are
the counter-argument to "this is just AI slop".

**"What did the instrumentation actually catch?"** The $70 ledger loop
(ARCH-04). Two PR titles that lost criteria on `main` (now a Repo Guard
check). Fifteen spec contradictions in the critic pass before wave 0
(ARCH-03), most of which `spec-lint` would now fail in one line. Four
blockers that sat open through a wave because the "resolve before opening
the next" step did not yet exist. Each is in `BLOCKERS.md` or `TASKS.md`
with its fix.

**"What is the intervention column for?"** `accepted/edited/rejected`,
counted against proposals the session made. The ratio is the number that
says whether the spec was good enough for the model to work from. It has to
be counted by the human as they read the diff; the transcript cannot report
it and the skill refuses to guess.

## Where to look

- Rules: [`../../CLAUDE.md`](../../CLAUDE.md); runbook: [`../OPERATOR.md`](../OPERATOR.md)
- Claim and close: `scripts/task.sh`, `.claude/skills/task-start/`, `.claude/skills/task-close/`
- Ledger: `scripts/ledger.py`, [`../LEDGER.md`](../LEDGER.md), `.claude/settings.json`
- Hooks: `.claude/hooks/session-start.sh`
- Plan, ownership, waves: [`../TASKS.md`](../TASKS.md); blockers: [`../BLOCKERS.md`](../BLOCKERS.md)
- Spec lint and PR guard: `scripts/spec-lint.py`, `.claude/skills/task-close/pr_guard.py`
