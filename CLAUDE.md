# CLAUDE.md

Operating rules for Claude Code sessions in this repository. These are
constraints, not suggestions. They exist so that the build's cost and quality
are measurable afterwards, and so that a reviewer can trace any line of
Aritzia's brief to the code that satisfies it.

## What this repository is

A technical case assessment: a Next.js/TypeScript task-management application
built spec-first by AI agents, with the process instrumented so its economics
can be presented as evidence.

**Read before doing anything:**

| Document | What it governs |
|---|---|
| [`docs/PROJECT.md`](docs/PROJECT.md) | Why we are here, scope, the NOT list, appetite, assumptions |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | 78 numbered criteria. The definition of done |
| [`docs/adr/`](docs/adr/) | Decisions already taken. Do not relitigate silently |
| [`docs/TASKS.md`](docs/TASKS.md) | The ordered build plan |
| [`docs/LEDGER.md`](docs/LEDGER.md) | One row per session, with cost |
| [`docs/BLOCKERS.md`](docs/BLOCKERS.md) | Where a Builder or QA session writes a blocker, and where the Architect records its resolution |

## Roles

**Architect** — owns the spec files: `PROJECT.md`, `ACCEPTANCE.md`, `adr/`,
`TASKS.md`. Makes product and architecture decisions. Writes no application
code.

**Builder** — implements tasks from `TASKS.md` against the criteria in
`ACCEPTANCE.md`. **The Builder never edits a spec file.** If a task cannot be
built as specified — the spec is ambiguous, contradictory, or wrong — the
Builder stops and writes a blocker in `docs/BLOCKERS.md` rather than
deciding. A Builder that edits the spec to match what it built has destroyed
the only independent measure of whether the build is correct.

**QA** — verifies the build against `ACCEPTANCE.md` independently. Marks
criteria met, and only with a named test.

One session holds one role. Do not switch roles mid-session.

## The rules

### 1. No code without a task ID

```bash
scripts/task.sh T-04              # set the current task
scripts/task.sh T-04 AC-ADD-1,AC-ADD-2   # …and the criteria it covers
scripts/task.sh                   # show
scripts/task.sh --clear           # clear
```

`CLAUDE_TASK_ID` works as an alternative. If neither is set the ledger row is
written as `untagged` — the token counts are still correct, but the row cannot
be attributed to anything, which makes it useless as evidence.

### 2. One session, or one `/clear`, per task

The attribution rule is **one session to one task**, so that session totals
*are* task totals. When moving to a different task, start a new session or
`/clear`, then re-run `scripts/task.sh`.

Two tasks sharing a session produce one row that belongs honestly to neither.
If it happens anyway, say so in the row's `notes` rather than splitting the
numbers by guess — a labelled compound row is honest, an invented split is not.

### 3. Every commit references an acceptance criterion ID

```
feat(tasks): optimistic delete with rollback [AC-DEL-1, AC-API-9]
test(api): bounded retry honours Retry-After [AC-API-6, AC-API-7]
```

Conventional Commits for the prefix; criterion IDs in brackets at the end. A
commit that touches application code and references no criterion is either
work nobody asked for, or a criterion missing from `ACCEPTANCE.md`. Both are
problems, and both are found by this rule.

`main` is squash-merged, so the only subject that survives there is the pull
request title. **The PR title carries the task ID and the criterion IDs** in
the same form — `feat(tasks): T-05 list, filter, complete, delete
[AC-LIST-1..4, …]` — or the traceability this rule exists for ends at the
branch.

Exempt: `chore:` commits for tooling, config, and the ledger; `docs:` commits
for the spec files themselves.

### 4. An ADR before any new dependency

Before adding a runtime dependency, write the ADR — or extend an existing one.
Not after. Every ADR carries a build-vs-buy section, because the recurring
judgment on this project is which line to be on, not how much can be
hand-rolled.

Dev dependencies that only serve an already-accepted ADR (a types package, a
Jest transform) do not need their own record.

### 5. A criterion is not met until a test names it

Test names carry the criterion ID:

```ts
it('AC-API-9: restores the task in place when delete ultimately fails', ...)
```

Nothing in `ACCEPTANCE.md` is marked `☑` without a test that can be pointed
at. `◐` — implemented but untested — is a valid and honest state. Marking a
criterion met because the code "obviously works" is how a suite ends up
proving nothing.

Seven criteria cannot have a Jest test, and `ACCEPTANCE.md`'s legend names
them. Those, and only those, are marked `◉` — verified manually — with the
procedure and the date written beside them. `◉` on any other criterion is a
rule-5 violation dressed up.

### 6. The spec is the source of truth, and it is allowed to be wrong

When the build reveals the spec is wrong, that is a finding, not an
inconvenience. It goes back to the Architect, who amends the spec in its own
commit. What must not happen is the code and the spec quietly diverging until
nobody can say which describes the system.

## The ledger

Every session produces one row in [`docs/LEDGER.md`](docs/LEDGER.md) with exact
token counts and API-equivalent cost, written automatically by
`scripts/ledger.py` (registered as `Stop` and `SessionEnd` hooks in
`.claude/settings.json`).

**At the end of a task**, fill in what the transcript cannot report:

```bash
python3 scripts/ledger.py --annotate latest \
  --criteria-ids "AC-ADD-1,AC-ADD-2" --interventions 7/3/1 \
  --tests-added 12 --qa-result pass
```

Measured columns are refused by `--annotate`. Token counts are not
hand-editable, or the table stops being evidence.

### Auditing the numbers

- Rates live in one constant, `PRICES_USD_PER_MTOK` in `scripts/ledger.py`.
- `python3 scripts/ledger.py --selfcheck` prints the cost arithmetic in full
  against a reference set of counts.
- `python3 scripts/ledger.py --transcript <path> --breakdown` re-derives a row
  by hand and prints per-model detail.
- The hook fails loudly: on any error it prints to stderr, exits non-zero, and
  writes nothing. A missing row is never a silently corrupted row.

### Committing the ledger

The row belongs with the work it measures, so **stage `docs/LEDGER.md` with the
task's final commit**.

A `Stop` hook in this environment also asks for a clean working tree after every
turn, which conflicts with that during a long session. When it does, commit the
row on its own as `chore: update <TASK-ID> ledger row` and carry on. The rule
that matters is attribution — that the row names the right task and the right
criteria — not which commit it rides in on.

`.current-task` and `.current-criteria` are gitignored: per-session local
state, not repository content.

## Working in this repo

`main` is protected. All work lands through a pull request from a branch. See
[`CONTRIBUTING.md`](CONTRIBUTING.md).

This is a **public** repository. Never commit secrets — see
[`SECURITY.md`](SECURITY.md). The API key this application uses is server-side
only and is asserted absent from the client bundle by a test (`AC-API-3`).
