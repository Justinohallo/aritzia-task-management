# TASKS.md — the ordered build plan

> **No task has been started.** This document is the plan, not a record of
> progress.
>
> **Appetite:** P1 complete by 2026-09-02 17:00 PT (confirmed).
> **Estimated:** 23h35m of work across 22 tasks — 22h00m of build once the
> three tooling tasks are excluded. The Sequence table is the source; these
> totals are its sum. **14h30m of wall clock** when run as nine waves of
> concurrent agents. T-00 and T-16 add tooling work and no wall clock: they
> run inside wave 0, alongside the longer T-01. T-17 is charged to wave 1
> but runs after it; see its detail for why.
> See [Running in parallel](#running-in-parallel).
>
> **Amended 2026-09-01 (ARCH-03).** A fresh-session critic pass over the
> whole spec system found fifteen contradictions before wave 0 opened. Each
> amendment below is marked *ARCH-03* and the findings are recorded as
> `B-01..B-17` in [`BLOCKERS.md`](BLOCKERS.md). The pass repeats after any
> Architect amendment, before the next wave opens.
>
> **Amended 2026-09-02 (ARCH-04).** A review of the wave-0 and wave-1
> sessions found four workflow defects — a ledger-write loop that cost
> roughly $70 of T-01's $84.70, two squash-merge subjects that undercount
> their criteria, four blockers with no Architect session to resolve them,
> and an `interventions` column that has never been filled. The findings
> are the [ARCH-04](#arch-04--workflow-amendments-from-the-wave-1-review)
> entry below; the tooling they need is **T-17**.
>
> **Amended 2026-09-02 (ARCH-06).** The build is complete and verified
> (T-13). A principal-engineer review of the delivered code found nothing to
> cut from the shipped bundle and four things to cut from the repository:
> tests that assert on configuration files instead of behaviour, a criterion
> that mandates unused source files, dead reducer states, and process
> archaeology in source comments. The findings are the
> [ARCH-06](#arch-06--optimisation-phase-from-the-post-qa-review) entry; the
> work is **T-18..T-21**, waves 6 and 7, with the freeze (T-15) moved to
> wave 8 so that it still comes last. `B-25` and `B-26` in
> [`BLOCKERS.md`](BLOCKERS.md) record the two spec defects.

## How to run a task

```bash
scripts/task.sh T-04 AC-ADD-1,AC-ADD-2,AC-ADD-3   # 1. claim it
# 2. build it, tests naming their criterion IDs
# 3. commit: feat(tasks): add-task form [AC-ADD-1, AC-ADD-2, AC-ADD-3]
python3 scripts/ledger.py --annotate latest \
  --interventions 5/2/0 --tests-added 9 --qa-result pass   # 4. close it
```

One session per task, then `/clear`. See [`CLAUDE.md`](../CLAUDE.md).

---

## Sequence

The order is chosen so that **the app runs end to end after T-05**. Everything
after that improves something already demonstrable, which means the deadline
can arrive at any point past the first milestone and still find a working
submission. Depth is added last, on purpose — it is the part that can be cut.

Most of the dependencies below are **contract dependencies, not code
dependencies**: a task needs to know a type or an HTTP shape, not to see the
implementation of it. T-01 therefore freezes every shared contract before any
feature work starts, which collapses the chain into six waves that can be run
by concurrent agents. See [Running in parallel](#running-in-parallel) for the
wave table, the file-ownership map, and the merge rules that make it safe.

The `Wave` column is the schedule. The `Depends on` column is the *reason* —
it is the constraint that puts a task where it is, and if it turns out to be
wrong, the wave is wrong too.

| # | Task | Criteria | Est. | Wave | Depends on |
|---|---|---|---|---|---|
| **T-00** | Repo skills: `task-start`, `task-close` | — (tooling) | 45m | **0** | — |
| **T-16** | Spec lint and gate dry-run | — (tooling) | 30m | **0** | T-00 |
| **T-01** | Scaffold, contracts, and CI | `AC-QUAL-1..2` (build), `AC-CI-1` (build), `AC-CI-2` | 90m | **0** | — |
| **T-02** | Auth and routing | `AC-AUTH-1..9`, `AC-NAV-1..4` | 75m | **1** | T-01 |
| **T-03** | Task provider and persistence | `AC-STATE-1..6`, `AC-AUTH-10` | 75m | **1** | T-01 |
| **T-06** | API Route Handlers and the secret boundary | `AC-API-3..5`, `AC-API-10` (server), `AC-API-13` | 75m | **1** | T-01 (contract only) |
| **T-17** | Merge-boundary guards and blocker visibility | — (tooling) | 20m | **1** | T-16 |
| **T-04** | Add-task form | `AC-ADD-1..7` | 60m | **2** | T-03 |
| **T-05** | List, filter, complete, delete | `AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`, `AC-DEL-1`, `AC-DEL-3..4` | 90m | **2** | T-03 |
| **T-07** | Resilient API client | `AC-API-6`, `AC-API-7` (client), `AC-API-12` (client), `AC-API-10` (client) | 75m | **2** | T-06 |
| | 🏁 **Milestone: the application works** (end of wave 2) | | | | |
| **T-08** | Optimistic mutations | `AC-API-1..2`, `AC-API-7` (rollback), `AC-API-8..9`, `AC-API-11`, `AC-API-12` (message), `AC-ADD-8`, `AC-DEL-2` | 90m | **3** | T-04, T-05, T-07 |
| | 🏁 **Milestone: every brief requirement met** | | | | |
| **T-09** | Accessibility pass | `AC-A11Y-1..6` | 60m | **4** | T-08 |
| **T-10** | Responsive pass and component boundary | `AC-UI-1..4`, `AC-UI-5..6` (build) | 45m | **4** | T-08 |
| **T-11** | Test sweep | `AC-TEST-1`, `AC-TEST-2..4` (build) | 60m | **5** | T-09, T-10 |
| **T-12** | Promote and verify the deployment | `AC-DEP-1` | 30m | **5** | T-11 |
| **T-13** | QA pass | all — verification only | 45m | **5** | T-12 |
| **T-14** | Presentation | — | 120m | **5** | wave gate only — the specs, *not* the code |
| | 🏁 **Milestone: submitted** (end of wave 5; ARCH-06 opens the optimisation phase) | | | | |
| **T-18** | Tooling marks: lint boundaries replace the meta-tests | `AC-QUAL-1..2` (⚙ mark), `AC-CI-1` (⚙ mark), `AC-UI-5..6` (⚙ mark), `AC-TEST-2..4` (⚙ mark) | 75m | **6** | T-13 |
| **T-19** | Dead code and single sources of truth | — (refactor; commits cite the criteria they preserve) | 90m | **6** | T-18 |
| **T-20** | Comment diet and React out of `lib/` | — (refactor; commits cite the criteria they preserve) | 75m | **6** | T-19 |
| **T-21** | QA re-verification after the optimisation | all — verification only | 45m | **7** | T-20 |
| **T-15** | Freeze and dry run | — | 45m | **8** | T-21, T-14 |

Two dependencies in the original plan turned out not to exist, and both are
worth naming because they are where the parallelism comes from:

- **T-06 never depended on T-05.** The Route Handlers persist nothing and
  render nothing ([ADR-0004](adr/0004-api-simulation.md)). They need the task
  DTO shape and the key/limiter policy — both frozen at T-01 — and no UI at
  all. It was sequenced after T-05 because that is the order a person would
  build it in, not because anything blocked.
- **T-14 never depended on T-13.** The presentation argues from the specs,
  which are already written; the build supplies numbers for two of its six
  sections. It is the single longest task in the plan and it sat on the
  critical path for no reason. It now runs in wave 5, alongside the
  T-11 → T-12 → T-13 chain, and takes its ledger and QA figures in at the end.

  *ARCH-03:* it was placed at "wave 4–5", which deadlocked the wave gate —
  `task-start` refuses to open a wave-5 task while any wave-4 task is
  unclosed, and T-14 could not close until T-13 had. Wave 5 is 135m long and
  T-14 is 120m, so the move costs no wall clock.

---

## Running in parallel

Sequential, the plan is **17h15m** — the build tasks end to end, with the
tooling tasks alongside T-01. In waves it is **9h45m**, with a peak of three
concurrent agents and no more than three at any point. Roughly 11h once merge
and CI time at each boundary is counted.

| Wave | Agents | Tasks | Wall clock | Gate to open the next wave |
|---|---|---|---|---|
| **0** | 3 | T-00 ‖ T-16 ‖ T-01 | 90m | contracts exist and typecheck; CI required on `main` |
| **1** | 3 | T-02 ‖ T-03 ‖ T-06 (T-17 after, alone) | 75m | all three merged, `main` green; then T-17 merged and ARCH-04 closed |
| **2** | 3 | T-04 ‖ T-05 ‖ T-07 | 90m | all three merged, `main` green 🏁 *app works* |
| **3** | 1 | T-08 | 90m | merged, `main` green 🏁 *brief met* |
| **4** | 2 | T-09 ‖ T-10 | 60m | T-09 and T-10 merged |
| **5** | 2 | T-11 → T-12 → T-13 ‖ T-14 | 135m | QA pass recorded, T-14 drafted |
| **6** | 1 | T-18 → T-19 → T-20 | 240m | all three merged, `main` green, `npm test` under 12s |
| **7** | 1 | T-21 | 45m | QA re-marks recorded; open `B-` rows resolved |
| **8** | 1 | T-15 | 45m | — |

**Parallelism buys wall clock, not money.** Total token spend goes up slightly:
each concurrent agent reads the same spec independently, and every wave
boundary adds rebase and re-verification work. Sessions stay at one-per-task,
so ledger attribution is unaffected — which is the property that matters, since
the ledger is evidence in T-14. Say this out loud in the presentation rather
than letting someone infer that three agents made the build cheaper.

### File ownership

One writer per path, per wave. This is what makes three concurrent pull
requests merge without conflict, and it is a harder constraint than the
dependency graph — **a task that needs to write a file it does not own has
found a spec gap and writes a blocker.**

| Task | Writes | Reads (never writes) |
|---|---|---|
| **T-00** | `.claude/skills/**`, `scripts/task.sh` | — |
| **T-16** | `.claude/skills/**`, `scripts/spec-lint.py` | `docs/**` |
| **T-17** | `.github/workflows/repo-guard.yml`, `.claude/skills/**`, `scripts/spec-lint.py`; for one commit each, and nothing else in them: `app/(protected)/layout.tsx` (the `B-20` mount) and `test/api/handlers.test.ts` (the `B-21` rename) | `docs/**` |
| **T-01** | everything — config, CI, `package.json`, `components/ui/**`, all contract files | — |
| **T-02** | `app/login/**`, `app/page.tsx`, `app/(protected)/layout.tsx`, `lib/auth/**` | contracts, `components/ui/live-region.tsx` |
| **T-03** | `lib/tasks/provider.tsx`, `lib/tasks/reducer.ts`, `lib/tasks/storage.ts`, `lib/tasks/hooks.ts` | `lib/tasks/actions.ts`, `lib/tasks/schema.ts` |
| **T-06** | `app/api/**`, `lib/server/**` | `types/api.ts`, `lib/api/config.ts` |
| **T-04** | `components/tasks/task-form.tsx`, `lib/tasks/validation.ts` | provider hooks, actions |
| **T-05** | `components/tasks/task-list.tsx`, `task-item.tsx`, `task-filters.tsx` | provider hooks, actions, `components/ui/live-region.tsx` |
| **T-07** | `lib/api/client.ts`, `lib/api/retry.ts` | `types/api.ts`, `test/msw/handlers.ts` |
| **T-08** | `lib/tasks/reducer.ts`, `lib/tasks/mutations.ts` (new: the apply → call → reconcile/rollback orchestration), and the call sites in `components/tasks/**` | everything |
| **T-09** | `components/tasks/**` (semantics: labels, `aria-*`, live regions) | — |
| **T-10** | `app/(protected)/**` layout wrappers; `components/tasks/**` (layout classes only — T-09 merges first, T-10 rebases) | — |
| **T-11** | `**/*.test.*`, `jest.config` thresholds | — |
| **T-12** | for one commit, and nothing else in it: `app/login/login-form.tsx` and `lib/auth/session-bar.tsx` (the `B-22` touch-target classes) | everything |
| **T-14** | `docs/presentation/**` | all specs, `LEDGER.md` |
| **T-18** | `eslint.config.mjs`, `jest.config.mjs`, `package.json` (devDependencies only), `test/quality/**`, `test/msw/handlers.test.ts`, `scripts/task-close` rule-5 grep if it must learn the `⚙` mark | everything else |
| **T-19** | `lib/**`, `types/**`, `app/**`, `components/tasks/**`, `components/ui/**` (deletions only), `app/globals.css`, `package.json` (removals only), `test/**` | `docs/**` |
| **T-20** | `lib/**`, `components/**`, `app/**`, `test/**` (moves and comment edits; no behaviour change) | `docs/**` |
| **T-21** | `docs/ACCEPTANCE.md` status marks, `docs/BLOCKERS.md` | everything |

Three paths are contended and are handled by rule, not by hope:

- **`package.json` / `package-lock.json` / `components/ui/**`** — T-01 only, for
  the life of the project. Every dependency in all six ADRs and every shadcn
  primitive the plan needs is installed at T-01. Nothing after wave 0 runs
  `npm install` or `npx shadcn add`.
- **`app/(protected)/tasks/page.tsx`** — T-01 writes the shell with both slots
  filled by stub components. T-04 and T-05 each replace their own stub file and
  neither touches the page.
- **`docs/LEDGER.md`** — every session appends a row, so every concurrent pull
  request conflicts here. **Resolution is always "take both sides", ordered by
  timestamp.** Never drop a row to clear a conflict; a missing row is a missing
  measurement, and the table stops being evidence. Commit the ledger row as the
  last commit on the branch so the conflict is isolated to one hunk.

`components/tasks/**` is contended between T-09 and T-10 in wave 4. T-09 edits
attributes and semantics, T-10 edits layout classes — usually different lines,
occasionally the same element. **T-09 merges first; T-10 rebases before
pushing.** Both diffs are small enough that this costs minutes. *ARCH-03:*
the ownership table now says this too, because `/task-close` enforces the
table, not this paragraph — T-10 would have failed its own close.

The live region is the other shared surface. `AC-FILT-6` (T-05, wave 2),
`AC-DEL-2` and `AC-API-11` (T-08, wave 3) and `AC-A11Y-3` (T-09, wave 4) all
announce through one mechanism, so it is a T-01 primitive in
`components/ui/live-region.tsx`, mounted once by T-02 in the protected
layout, and consumed through its `useAnnounce()` hook by everyone else. No
task after wave 0 creates a live region of its own. *(ARCH-03)*

### Rules for concurrent agents

1. **One branch, one pull request, one task.** Branch off the latest `main` at
   the start of the wave, never off another agent's branch. `feat/t-05-list`
   from a terminal; a cloud session's platform-assigned `claude/<slug>-<suffix>`
   is equally fine — the branch name is not where attribution lives
   ([`OPERATOR.md`](OPERATOR.md) §7, `B-16`).
   **The pull request title is the squash-merge subject on `main`**
   ([`CONTRIBUTING.md`](../CONTRIBUTING.md)), so it carries the task ID and
   the criterion IDs: `feat(tasks): T-05 list, filter, complete, delete
   [AC-LIST-1..4, AC-FILT-1..6, AC-DONE-1..3, AC-DEL-1, AC-DEL-3..4]`. Branch
   commits carry IDs for the close check; the title carries them for the
   history a reviewer actually reads. *(ARCH-03)*
2. **Do not start a wave until the previous wave is merged and `main` is
   green.** The waves are the synchronisation points; there are only six of
   them, and skipping one is how two agents end up building against different
   versions of the same contract. Inside a wave the `Depends on` cell still
   holds — wave 5 is a chain, and T-12 does not start until T-11 is closed.
3. **Merge order within a wave is ascending task number.** Later pull requests
   rebase onto `main` and re-run CI before merging. Do not merge two pull
   requests from the same wave without re-running the second one's checks.
4. **Contract files are read-only after T-01.** An agent that believes a
   contract is wrong stops and writes a blocker in
   [`BLOCKERS.md`](BLOCKERS.md) for the Architect
   ([`CLAUDE.md`](../CLAUDE.md) §Roles). It does not edit the type and carry on
   — that silently breaks every other agent in the wave, and the failure shows
   up two waves later in someone else's tests.
5. **Each agent runs `scripts/task.sh <ID> <criteria>` first.** Attribution is
   per session, and concurrency does not change that. Three sessions in a wave
   produce three rows.
6. **`npm run typecheck && npm run lint && npm test` before every push.** With
   three branches open, a red push costs three agents' time, not one.

### What collapses this back to a queue

Be honest about the failure modes, because two of them are likely:

- **T-01 under-specifies a contract.** The cost lands in wave 2, when an agent
  discovers `TaskAction` has no case for what it needs. Mitigation: the T-08
  optimistic actions are declared at T-01 even though nothing uses them until
  wave 3. If a contract does have to change, it changes in its own commit on
  `main` and every open branch rebases before continuing.
- **Three pull requests land on one reviewer at once.** There is no second
  maintainer, so required approvals are `0`
  ([`REPO-PROTECTIONS.md`](REPO-PROTECTIONS.md)) and the review is the
  author's own read of three diffs in the same half hour. The risk is not a
  queue; it is rubber-stamping under wave pressure. Read each diff against
  its criteria before merging, and reduce concurrency to two if that is not
  happening. *(ARCH-03: an earlier version of this bullet assumed a review
  requirement that `CONTRIBUTING.md` stated and the ruleset does not have.)*
- **T-08 is the irreducible bottleneck** and no amount of concurrency helps it.
  It is also the riskiest task in the plan. Everything before it exists to make
  sure it starts against four merged, tested, green inputs.

If concurrency is unavailable, **the wave order is still a valid sequential
order** — run it top to bottom, single agent, and the only cost is the original
17h15m. Nothing in this section changes what gets built or which criteria prove
it.

---

## Task detail

### T-00 · Repo skills
tooling · 45m · **wave 0** — parallel with T-01, no shared files

Two Claude Code skills under `.claude/skills/` that make the `CLAUDE.md`
session ritual executable: `task-start` claims a task and loads its spec
context; `task-close` verifies rules 3, 4, and 5 mechanically and writes the
ledger annotation. Scripts are bash or stdlib Python, matching `scripts/`.
No runtime dependency, no application code.

Under the wave model the skills carry two further jobs, because both are
constraints that a person will not reliably check three times in parallel:

- `task-start` gates on **the whole preceding wave**, not just the task's
  named dependency — rule 2 of *Rules for concurrent agents* is what keeps
  three agents building against the same contracts.
- `task-close` checks the branch's changed files against the **File ownership**
  table above. One writer per path per wave is what makes three concurrent
  pull requests merge, and it is a harder constraint than the dependency graph.

**Done when:** `/task-close` runs successfully on the T-00 session itself
and writes its ledger annotation.

**Time box:** if this passes 60m, ship `task-start` as SKILL.md only and
leave `task-close` as a checklist. T-01 does not wait for this.

### T-16 · Spec lint and gate dry-run
tooling · 30m · **wave 0** — parallel with T-01, no shared files · *added by ARCH-03*

T-00 validated the gate by closing T-00 itself — the one task with no
criteria, no earlier wave and no ownership lane, so the one input that cannot
trip it. The critic pass found two gate defects that a dry run would have
caught in seconds. This task makes the spec system check itself. Stdlib only,
no application code, same lane as T-00.

- `task-start --dry-run <ID>`: run every check and print the summary without
  claiming. And a plan-wide `--dry-run all` that walks T-00..T-15 against a
  simulated ledger in wave order and fails on any task that could never open.
- Same-wave dependencies: `task-start` honours the task's own `Depends on`
  cell inside its wave, not only the previous wave — T-12 waits for T-11.
- `scripts/spec-lint.py`, run by `task-start` and by CI on any pull request
  touching `docs/`: the Sequence table's estimates sum to the header; every
  `AC-` reference in `TASKS.md` and every ADR resolves in `ACCEPTANCE.md` and
  `adr/`; the ADR count in `PROJECT.md` matches `adr/README.md`; every
  criterion is assigned to exactly one task (or split with a labelled
  parenthetical, as `AC-API-10` is).
- `task-close` check 2 runs `npm run build && npm run test:bundle` after
  `test`, once `package.json` exists, so the `AC-API-3` bundle test is part
  of the close.

**Done when:** `--dry-run all` passes on this plan, and `spec-lint.py` passes
on `docs/` as amended by ARCH-03.

### ARCH-04 · Workflow amendments from the wave-1 review
Architect · not a task row · *added 2026-09-02* · **status: closed 2026-09-02** —
items 1–7 resolved in `docs: ARCH-04 resolve B-18..B-21, amend OPERATOR.md, decide interventions`;
`B-18..B-21` carry their Resolution and Commit in `BLOCKERS.md`.

Not a build task and not in the Sequence table: an Architect session that
runs **before wave 2 opens**, on the pattern of ARCH-03. It exists because
the wave loop in [`OPERATOR.md`](OPERATOR.md) §6 has no step that reads
[`BLOCKERS.md`](BLOCKERS.md), and by the end of wave 1 four rows were open
with nobody assigned to them. What it resolves, in order:

1. **`B-20` — nobody mounts `<TasksProvider>`.** Blocks wave 2 outright:
   T-04 and T-05 consume provider hooks that throw outside the provider, and
   `app/(protected)/layout.tsx` (merged in #17) mounts `<LiveRegion />` only.
   The layout is T-02's file and T-02 is merged, so the Architect names the
   owner of the one-line change — the natural answer is a T-02 follow-up
   commit inside T-17's session, which is the only session open before
   wave 2, with the file added to T-17's row for that commit alone.
2. **`B-19` — `task-close` check 5 fails any task whose new dependency is
   already covered by an ADR.** Choose the durable resolution the row
   proposes (a dependency whose name appears in `docs/adr/*.md` is accepted)
   and schedule the script change in T-17.
3. **`B-18` — `spec-lint.py` is not run by CI.** Add
   `.github/workflows/repo-guard.yml` to T-17's ownership row so the lint
   job lands there (done above), and close the row.
4. **`B-21` — the Route Handler's `400 invalid_request` has no criterion.**
   Add a new `AC-API-` criterion to `ACCEPTANCE.md` or fold it into `AC-API-4`; the tests
   in `test/api/handlers.test.ts` already exist and are waiting for an ID.
5. **`OPERATOR.md` §6 gets a step 0:** "open `BLOCKERS.md`; every row whose
   Resolution is `open` is resolved in an Architect session before wave
   N+1 starts." And §5 gets the rule that the PR title is built from the
   union of criterion IDs across the branch's commits, not from the first
   commit — the platform pre-fills it from the first commit, which is how
   #17 lost `AC-AUTH-1`, `AC-NAV-1..2` and #18 lost `AC-API-3` on `main`.
6. **Decide the `interventions` column.** Every row on `main` is `-`. The
   PR timestamps say why: #17 and #18 were merged three minutes after they
   were opened, and no diff was read. Either amend `LEDGER.md` to say that
   intervention counting needs a review pass this operator is not doing and
   that the quality evidence is T-13, or redefine the three counts so a
   script can derive them at merge time — *accepted* = merged with no review
   comment and no post-open commit, *edited* = commits pushed after a review
   comment, *rejected* = closed unmerged — and schedule that script in T-17.
   One or the other; a column defined as "the number worth watching" and
   never populated is worse in the presentation than a column removed.
7. **Annotate the two damaged rows.** T-01's notes say what share of its
   $84.70 was the ledger loop (75 `chore: update T-01 ledger row` commits on
   #10 between 20:02 and 02:49), and the T-02 and T-06 rows record the
   criteria their squash-merge subjects omit, since a merged subject cannot
   be changed.

**Done when:** `B-18..B-21` carry a Resolution and a Commit, `OPERATOR.md`
§5 and §6 are amended, `LEDGER.md` states the interventions decision, and
`spec-lint.py` passes. No application code.

### ARCH-06 · Optimisation phase from the post-QA review
Architect · not a task row · *added 2026-09-02* · **status: open** —
spec amendments landed in `docs: ARCH-06 optimisation phase, resolve B-25..B-26`;
closes when T-21 has re-marked `ACCEPTANCE.md`.

The build is done and verified. This entry is what a principal engineer would
change in it, measured rather than felt, and it opens waves 6–8. The numbers
below were taken against `main` a74ab31 on 2026-09-02.

**What was measured.**

| Thing | Value |
|---|---|
| Application source, non-blank lines | 3,661 — of which 1,062 (29%) are comment lines |
| Test source lines / tests / suites / wall time | 4,513 / 299 / 29 / 17s with coverage |
| Static JS shipped, gzipped | 287 KB, of which the application's own two chunks are 53 KB raw |
| `components/ui/**` files never imported | 5 of 16 (`dialog`, `select`, `tabs`, `radio-group`, `separator`; ~410 lines) |
| Reducer actions dispatched by no code | 2 (`add`, `remove` — the wave-2 pre-API cases) |
| Sync states no component can observe | 1 (`failed` — set and rolled back in the same synchronous sequence) |
| Tests that read config or the source tree rather than exercise behaviour | 33 across `test/quality/**`, `test/msw/handlers.test.ts` |
| Task, wave and blocker IDs in source comments | 100+ (`T-08` alone appears 16 times) |

**What the numbers say.** Bundle size is not a lever: the framework is the
bundle, the unused primitives are already tree-shaken, and deleting
application code would ship nothing smaller. The suite's cost is low and its
pure-logic half (reducer, validation, retry, storage, session, upstream,
handlers — about 110 tests) is the best thing in the repository; the count is
not the problem. Two real defects sit in the spec, and the rest is hygiene:

1. **`B-25` — `AC-UI-5` mandates dead code.** Its test asserts that `select`
   and `dialog` exist on disk. No screen uses either. A Builder cannot delete
   them without failing a criterion, and QA would mark the deletion a
   regression. *Resolved:* the criterion is reworded to what the brief
   actually asks — every control the interface renders comes from a shadcn
   primitive, and none is hand-rolled — with no list of files.
2. **`B-26` — rule 5 manufactures tests for tooling properties.** "A criterion
   is not met until a test names it" is right for behaviour and wrong for
   strict mode, import boundaries, CI step order and coverage thresholds.
   The rule forced T-01, T-10 and T-11 to write Jest tests that spawn ESLint
   to read the ESLint config, regex-parse the CI YAML, and walk the source
   tree checking import directions. Those are lint rules in a Jest costume:
   slower (`typescript.test.ts` is the third slowest file at 3.8s), and
   invisible in the editor where a boundary violation should surface.
   *Resolved:* a fourth mark, `⚙` **enforced by tooling**, earned by naming
   the lint rule, compiler flag, runner option or CI step that makes the
   criterion impossible to violate. Eight criteria are eligible and no
   others: `AC-QUAL-1..2`, `AC-CI-1`, `AC-UI-5..6`, `AC-TEST-2..4`.
   `AC-TEST-1` keeps its test — a cross-check between this document and the
   suite is genuinely a test — but loses its hard-coded `79` and `seven`.
3. **Dead state.** The `add` and `remove` actions, the `failed` sync state,
   the five unused primitives and the `tw-animate-css` stylesheet that
   exists only for `dialog`'s animation.
4. **Two sources of truth for one type.** `types/task.ts` declares `Task`,
   `lib/tasks/schema.ts` declares the zod schema, and an `Exact<A, B>`
   compile-time hack keeps them equal; `lib/server/handlers.ts` repeats the
   hack for the request body. The type is derived from the schema and both
   hacks go.
5. **Build-process artefacts in the architecture.** `<AuthProvider>` is
   mounted three times, once per route segment, because T-02's lane did not
   include the root layout. `lib/tasks/hooks.ts` exists to hide contexts the
   provider exports anyway. `lib/api/config.ts` carries the server's
   rate-limit profile and the client's retry policy in one file because both
   were "frozen at T-01". Each is one mount, one file, one split.
6. **React in `lib/`.** Guards, the session bar and both providers are
   components living under a directory whose name promises pure logic.
   They move to `components/auth/` and `components/tasks/`; `lib/` keeps
   only what runs without React.
7. **Comment diet.** A comment states an invariant or a non-obvious why.
   The task, wave and blocker trail was valuable while agents coordinated
   across lanes; it is now carried by `git log`, `LEDGER.md` and this file.
   Expected removal: 500–700 lines with no loss.

**What is deliberately not done**, so it is not asked twice: Vitest (the
brief names Jest; [ADR-0006](adr/0006-test-strategy.md) records the cost),
`zod/mini`, a lighter primitive library, a monorepo, feature folders that
move `lib/server/**` (the `AC-API-3` boundary tests name that path and the
secret boundary is not worth re-proving for a rename).

**Sequencing.** One chain, ascending: T-18 first, because it changes what
proves the criteria T-19 and T-20 will touch; T-19 before T-20, because
deletions before moves keep every diff readable. T-21 is a fresh QA session
on the T-13 pattern and re-marks every criterion whose named test moved or
whose proof became a `⚙`. T-15 follows, so the freeze is still the last
thing that happens. The wave gate applies as before: T-18 opens only once
T-15's *old* wave-6 slot is vacated, which this amendment does by moving it.

**Done when:** T-21 has re-marked `ACCEPTANCE.md` with no `◐`, `B-25` and
`B-26` carry a Commit, `npm test` runs in under 12 seconds locally, and the
application's behaviour is unchanged — every `☑` still names a passing test.

### T-17 · Merge-boundary guards and blocker visibility
tooling · 20m · **wave 1** — runs alone, after T-02/T-03/T-06 are merged and before wave 2 opens · *added by ARCH-04; estimate set at 20m when ARCH-04 chose the interventions honesty note over a derivation script*

Every rule that wave 1 broke was enforced only inside the session, by a
close turn the operator can skip by pressing **Merge** first. This task moves
three of them to the merge boundary, where the button stays grey until they
hold, and makes open blockers visible where a Builder will read them. Same
lane and same constraints as T-16: stdlib or workflow YAML, no runtime
dependency, no application code.

- **PR-title job in `repo-guard.yml`.** Fails a pull request whose title does
  not match `<type>(<scope>): <TASK-ID> … [<criteria>]` for a Builder
  branch, and — for any commit on the branch that carries `[AC-…]` — whose
  bracketed set is not the union of the branch's commit criteria. `chore:`
  and `docs:` titles are exempt, as in `CLAUDE.md` rule 3.
- **Ledger-row job in `repo-guard.yml`.** Fails a Builder pull request whose
  diff does not add a `docs/LEDGER.md` row with the task ID in the title.
  This is what makes `/task-close` unskippable: without it, T-01, T-16, T-06
  and T-02 all merged before their rows existed, and T-02 still has none.
- **`spec-lint` job in `repo-guard.yml`** on any pull request touching
  `docs/**` or `scripts/spec-lint.py` — the `B-18` drop-in, stdlib only.
- **`task-start` prints open blockers.** Every `BLOCKERS.md` row whose
  Resolution is `open`, with the ones naming this task or a path in its
  ownership row first. It warns; it does not refuse — refusing would hold
  every wave on the Architect's calendar.
- **`task-close` check 5 accepts an ADR-covered dependency** (`B-19`): a
  new entry in `dependencies` passes if its package name appears in any file
  under `docs/adr/`.
- **The `B-20` follow-up commit** (assigned here by ARCH-04): mount
  `<TasksProvider>` inside `RequireAuth` in `app/(protected)/layout.tsx`,
  one commit, `[AC-STATE-1]`, nothing else in it. The file is in this task's
  ownership row for that commit only.
- **The `B-21` rename commit** (assigned here by ARCH-04): the describe block
  in `test/api/handlers.test.ts` that cites `B-21` names `AC-API-13`
  instead, one commit, `[AC-API-13]`, no assertion changed. The file is in
  this task's ownership row for that commit only.
- *No interventions script.* ARCH-04 chose the honesty note
  (`LEDGER.md`, "What `interventions` counts"), so the `--interventions
  from-pr` derivation is not built and the estimate is 20m, not 30m.

**Done when:** a pull request with a mistitled subject, or with no ledger
row, is red on Repo Guard; `task-start --dry-run all` still passes;
`spec-lint.py` runs green in CI on this branch; and `/task-close` on this
session passes check 5 with `package.json` unchanged.

**Time box:** 45m. Past that, ship the two `repo-guard.yml` jobs and the
`task-start` warning, and leave the rest as a `B-` row.

### T-01 · Scaffold, contracts, and CI
`AC-QUAL-1`, `AC-QUAL-2`, `AC-CI-1`, `AC-CI-2` · 90m · **wave 0, solo**

Next.js App Router, TypeScript strict, Tailwind, shadcn/ui initialised. Jest +
RTL + `user-event` + MSW + `jest-axe` configured and running one trivial test.
GitHub Actions running typecheck, lint, test, then `next build` and
`npm run test:bundle` on pull requests, registered as a required status check.
`test:bundle` is a second Jest config holding only the `AC-API-3` bundle
search; it **fails, never skips**, when `.next/` is absent, so it can only
pass after a real production build. It is separate so `npm test` stays fast
locally. *(ARCH-03: the bundle test needs a build that no CI step produced.)*

**Plus the contract freeze — the part that makes waves 1 and 2 possible.**
Every later task reads these files and no later task writes them. Types only;
no behaviour, no tests beyond the trivial one:

| File | Contents | Frozen for |
|---|---|---|
| `types/task.ts` | `Task { id, title, dueDate, completed, createdAt, sync }` — `id` a client-generated UUID, `dueDate` a calendar day `YYYY-MM-DD` (`AM-12`), `createdAt` a client-assigned ISO timestamp, `sync: SyncState`. `TaskId`. `SyncState = 'confirmed' \| 'syncing' \| 'failed'`. `Filter = 'all' \| 'pending' \| 'completed'`. *ARCH-03: the in-flight state was `'pending'`, which collided with the `Filter` value and with "status is Pending" in `AC-ADD-1`; three agents would have meant three things by one word.* | T-03..T-10 |
| `types/api.ts` | request/response DTOs for `POST /api/tasks` and `DELETE /api/tasks/:id`; the server **echoes** the client's `id` and `createdAt` and assigns nothing, so reconciliation is by identity and the sort key never changes (`AC-API-8`); the `401`/`429` error bodies and the `Retry-After` contract; the `Upstream` interface that `lib/server/upstream.ts` implements and the Route Handlers call with the key ([ADR-0004](adr/0004-api-simulation.md), amended). The browser request type carries **no key field**. | T-06, T-07, T-08 |
| `lib/tasks/actions.ts` | the discriminated-union `TaskAction` type, every case the plan needs, including the T-08 optimistic ones | T-03, T-04, T-05, T-08 |
| `lib/tasks/schema.ts` | the Zod schema and `STORAGE_KEY`/`STORAGE_VERSION` for the persisted `{ version, tasks }` envelope. The persisted task **omits `sync`**: it is runtime-only, and every hydrated task is `confirmed` — `localStorage` is the system of record and an in-flight write that never confirmed is still the user's task. | T-03, T-08 |
| `lib/api/config.ts` | the injectable latency/failure config type (`AC-API-10`) — never `Math.random()` | T-06, T-07 |
| `app/(protected)/tasks/page.tsx` | the page shell, rendering `<TaskForm />` above `<TaskList />` from stub components | T-04, T-05 |
| `components/ui/live-region.tsx` | `<LiveRegion />`, mounted once by T-02 in the protected layout, and `useAnnounce()` returning `announce(message, { assertive? })`. The one announcement mechanism for `AC-FILT-6`, `AC-DEL-2`, `AC-API-11`, `AC-A11Y-3`. *(ARCH-03: four criteria across three waves needed it and no task owned it.)* | T-02, T-05, T-08, T-09 |
| `test/msw/handlers.ts` | default MSW handlers implementing `types/api.ts`, **plus factories** — `handlersFor(script)` taking a scripted sequence of responses (`429` with a given `Retry-After`, then `201`, …) — so T-07 and T-08 drive repeated `429`s through `server.use(...)` without editing this file. *(ARCH-03: a static handler file would have forced T-07 to edit a frozen contract.)* | T-07, T-08 |

Also at T-01, and for the same reason: **install every dependency and every
shadcn primitive the whole plan needs**, from all six ADRs. `package.json`,
`package-lock.json`, and `components/ui/**` are then owned by T-01 and touched
by nobody. A wave-2 agent that needs a package it does not have has found a
spec gap and writes a blocker — it does not run `npm install`.

> The contract freeze is the whole trick. Without it, T-04 waits on T-03's
> reducer, T-07 waits on T-06's handler, and the plan is a queue. With it,
> each of those waits on a type signature that already exists, and the eight
> feature tasks collapse into three waves.

**Done when:** `npm run typecheck && npm run lint && npm test && npm run build
&& npm run test:bundle` pass locally and in CI on a pull request, and every
file in the table above exists and compiles.

**Hand-off at the end of this task:** the stakeholder connects the Vercel
project. Connecting it here rather than at T-12 means every subsequent push
produces a preview deployment, so the live path is exercised eleven tasks
before anyone depends on it. `TASKS_API_KEY` is set in Vercel's encrypted
environment at the same time — never committed, never `NEXT_PUBLIC_`.

> CI first, before there is anything to check. It costs an hour once and gates
> every task after it; retrofitting it at T-11 means eleven tasks landed
> unverified.

### T-02 · Auth and routing
`AC-AUTH-1..9`, `AC-NAV-1..4` · 75m · **wave 1** — parallel with T-03, T-06

`/login` and `/tasks` as distinct routes; `/` redirects by auth state.
`AuthProvider` over `sessionStorage`. Route protection as a **client-side
guard** in the protected layout that renders nothing until auth state is read —
not middleware, which cannot see `sessionStorage`
([ADR-0001](adr/0001-app-router.md), [ADR-0005](adr/0005-auth-and-secret-boundary.md)).
The non-production notice on the login page. Mounts T-01's `<LiveRegion />`
once in the protected layout, so every later task announces through it.
*ARCH-04 (`B-20`):* the same layout mounts `<TasksProvider>` inside
`RequireAuth`; T-02 merged without it, and the one-line follow-up commit
lands in the T-17 session.

**Done when:** `AC-AUTH-5` passes — the new-tab case is asserted, not assumed.

### T-03 · Task provider and persistence
`AC-STATE-1..6`, `AC-AUTH-10` · 75m · **wave 1** — parallel with T-02, T-06

Split state/dispatch contexts, `useReducer`, discriminated-union actions, typed
hooks. Versioned `localStorage` adapter with Zod validation and a fail-safe
read. Hydration after mount.

**Done when:** `AC-STATE-5` passes with malformed JSON, valid-JSON-wrong-shape,
and an unknown version — each rendering an empty list rather than throwing.

> Shares nothing with T-02 or T-06 but the contracts frozen at T-01. Writes
> the provider, reducer, storage adapter, and hooks; reads `actions.ts` and
> `schema.ts` without editing either. The T-08 optimistic action cases are
> already in the union — handle them as no-ops or `never` branches so the
> reducer stays exhaustively checked, and leave the behaviour to T-08.

### T-04 · Add-task form
`AC-ADD-1..7` · 60m · **wave 2** — parallel with T-05, T-07

shadcn form primitives. Title and due-date validation with errors associated
via `aria-describedby`. Trim, length bound, past dates allowed and marked
overdue. Reset and focus return on success. No API yet — dispatch straight to
the reducer.

**Done when:** every validation branch has a test naming its criterion.

### T-05 · List, filter, complete, delete
`AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`, `AC-DEL-1`, `AC-DEL-3..4` · 90m · **wave 2** — parallel with T-04, T-07

Task list with deterministic ordering and an overdue marker that is not
colour-only. All / Pending / Completed filter, **held in the URL query string**
so it is shareable, restorable, and back-button-correct (`AC-FILT-4`). Distinct
empty states. Complete, uncomplete, delete — all still local. `AC-FILT-6`'s
announcement goes through `useAnnounce()` from T-01's live region; this task
creates no live region of its own.

**🏁 At the end of this task the application is demonstrable.** Everything
after it deepens something that already runs.

### T-06 · API Route Handlers and the secret boundary
`AC-API-3..5`, `AC-API-10` (server) · 75m · **wave 1** — parallel with T-02, T-03

Two layers, both server-side ([ADR-0004](adr/0004-api-simulation.md), amended):

- `app/api/tasks/**` — the browser-facing Route Handlers. They read
  `TASKS_API_KEY` from server environment only and are the **caller that
  presents the key**. They pass the upstream's status through unchanged.
- `lib/server/upstream.ts` — the simulated third-party API, an in-process
  module implementing the `Upstream` interface from `types/api.ts`. It
  demands the key (`401` when absent or wrong), enforces a fixed-window
  allowance (`429` with `Retry-After`), and injects latency and scripted
  failures from `lib/api/config.ts` — never `Math.random()`.

The browser sends no key, ever. *ARCH-03: the original text made the Route
Handler both the API that requires the key and the only thing the browser
can call, so every request was a `401` by construction. `AC-API-1..2` moved
to T-08 — "a request is sent when I create a task" is a UI behaviour this
task cannot prove.*

**Includes `AC-API-3`: the test that searches the production client bundle for
the key's value and its variable name.** It is the only test in the suite that
proves an absence, and it is the one that makes the secret-handling claim
checkable rather than asserted. Do not defer it.

*ARCH-04 (`B-21`):* `AC-API-13` — a malformed request is rejected with
`400 invalid_request` before the upstream is called — is this task's. It was
built and tested in #18 under a describe block that cites `B-21` instead of
an ID; the one-line rename that makes the tests name `AC-API-13` lands in
the T-17 session.

> Moved from wave 3 to wave 1. This task writes only `app/api/**` and
> `lib/server/**`, imports only `types/api.ts` and `lib/api/config.ts`, and
> renders nothing. `AC-API-3` runs against a production build of whatever is on
> `main` at the time — an early build with a stub UI proves the boundary just
> as well as a late one, and re-runs at T-12 against the deployed artifact.
> The only thing the bundle test needs is that the key is read on the server,
> which is this task's own output.

### T-07 · Resilient API client
`AC-API-6`, `AC-API-7` (client), `AC-API-12` (client), `AC-API-10` (client) · 75m · **wave 2** — parallel with T-04, T-05

Typed client with `AbortController` and timeout. On `429`: wait at least
`Retry-After`, then exponential backoff with **full jitter**
([ADR-0004](adr/0004-api-simulation.md)). Bounded retry budget. Never retry a
non-`429` `4xx`. Rate-limit exhaustion surfaces as a **distinct error type**
(`RateLimitedError`, carrying the last `Retry-After`) so that T-08 can message
it distinctly. This module renders nothing and rolls nothing back — the
"rolled back" clause of `AC-API-7` and the "message shown" clause of
`AC-API-12` are T-08's, and are labelled that way in the Sequence table.
*(ARCH-03)*

Tests use MSW and fake timers. A test that really sleeps through a retry
schedule is a test nobody runs twice.

### T-08 · Optimistic mutations
`AC-API-1..2`, `AC-API-7` (rollback), `AC-API-8..9`, `AC-API-11`, `AC-API-12` (message), `AC-ADD-8`, `AC-DEL-2` · 90m · **wave 3, solo** — the join point

Per-task sync state of `confirmed | syncing | failed`, in the reducer. The
apply → call → reconcile/rollback orchestration lives in
`lib/tasks/mutations.ts`, one function per mutation, so the components stay
thin and the sequence is testable without rendering. Add and delete apply
immediately; reconcile on success; restore the prior record on final failure.
In-flight state announced through `useAnnounce()`, not spinner-only.
Double-submit guarded. Rate-limit failures messaged as rate-limit failures
(`AC-API-12`), generic failures generically.

**🏁 Every requirement in Aritzia's brief is now met.**

> The riskiest task in the plan, and it is why the reducer is tested as a
> pure function first. *ARCH-03 corrected where the risk is:* list order is
> derived at render (`AC-LIST-3`: due date, then creation time), so restoring
> the deleted record restores its position for free — there is no index to
> get wrong. The real risk is identity on reconcile (`AC-API-8`): the server
> echoes the client's `id` and `createdAt` and assigns nothing, so the row
> keeps its key and its sort position. A reconcile that replaced either
> would remount or reorder the row, which is exactly what the criterion
> forbids.

### T-09 · Accessibility pass
`AC-A11Y-1..6` · 60m · **wave 4** — parallel with T-10, T-14; merges before T-10

Labels, `aria-describedby`/`aria-invalid` on errors, live-region announcements
for async outcomes — through the T-01 live region, not a new one — visible
focus, no colour-only meaning. `jest-axe` on both pages, plus a manual
keyboard walk of the full path — axe cannot judge whether a label is
meaningful or whether focus lands somewhere sensible. The walk is recorded
as `◉` against `AC-A11Y-4` with the date and the steps, per the
`ACCEPTANCE.md` legend.

### T-10 · Responsive pass and component boundary
`AC-UI-1..6` · 45m · **wave 4** — parallel with T-09, T-14; rebases onto T-09

320 / 768 / 1024 verified by hand — jsdom does not lay out, so this cannot be
asserted in Jest ([ADR-0006](adr/0006-test-strategy.md)), and claiming
otherwise would be a false assurance; `AC-UI-1..4` are recorded as `◉` with
the viewports and the date. Touch targets ≥ 44px. Audit that primitives are
shadcn and that no primitive imports from the task domain. Layout-class edits
in `components/tasks/**` are in this task's lane; semantic edits there are
T-09's, which merges first.

### T-11 · Test sweep
`AC-TEST-1..4` · 60m · **wave 5, solo**

Audit every criterion ID for a test that names it. Fill gaps. Enforce coverage
thresholds on state, API-client, and validation modules. Remove any
snapshot-only coverage.

**Done when:** every criterion has a test that names it, except the seven no
Jest test can prove, whose manual procedure is written where T-13 can read it
(a test-file header or `scripts/*.md`). T-11 writes no status mark:
`ACCEPTANCE.md` is a spec file and the marks are T-13's (*ARCH-05*; the
earlier wording read as if T-11 marked them, and a Builder never edits
`ACCEPTANCE.md`).

### T-12 · Promote and verify the deployment
`AC-DEP-1` · 30m · **wave 5, solo**

The Vercel project was connected at T-01, so this is verification rather than
setup — which is the point of moving it earlier. Confirm `TASKS_API_KEY` is
present in the production environment and absent from the bundle
(`AC-API-3` again, this time against the deployed artifact). Verify the full
path on a real phone-width viewport, not a desktop devtools emulation.

- **The `B-22` touch-target commit** (assigned here by ARCH-05): the four
  T-02 controls that fail `AC-UI-2` under coarse-pointer emulation take the
  class T-10 used elsewhere — `pointer-coarse:h-11` on the username and
  password inputs and the Log in button in `app/login/login-form.tsx`
  (`pointer-coarse:px-6` on the button), `pointer-coarse:h-11
  pointer-coarse:px-4` on the Log out button in `lib/auth/session-bar.tsx`.
  One commit, `[AC-UI-2]`, nothing else in it; both files are in this task's
  ownership row for that commit only. It lands here rather than in a new task
  because T-12 is the session that promotes the build T-13 verifies against,
  so the fix is deployed before T-13 opens and T-13 can mark `AC-UI-2` `◉`
  for every control, not only the task-page ones. Re-run
  `scripts/responsive-check.mjs` and confirm it prints no failures before
  promoting.

### T-13 · QA pass
verification only · 45m · **wave 5, solo** — fresh session, no shared context

Independent walk of all 79 criteria against the deployed build. Fresh session —
QA that shares context with the Builder is not independent. Findings are
written to [`BLOCKERS.md`](BLOCKERS.md), and the Architect turns them into
tasks; the QA session writes no application code.

**T-13 writes the status marks in `ACCEPTANCE.md`** (*ARCH-05*). Until T-13
no criterion carries a `☐`/`◐`/`☑`/`◉` mark, only the legend; nothing
earlier in the plan is allowed to mark one, and T-11's done-when has been
reworded to say so. T-13 marks each criterion `☑` only with the named test
beside it, `◉` only for the seven the legend names and only with the
procedure, viewport or device, and date beside it, and `◐` for anything
implemented but unproven; `AC-UI-2` is marked `◉` against the deployed build
that carries the `B-22` commit. This is the one spec edit a QA session
makes, on the same footing as appending to `BLOCKERS.md`, and it is committed
as `docs: T-13 ACCEPTANCE.md status marks`; `CLAUDE.md` §Roles says the same.
A mark with no test or procedure next to it is a `B-` row, not a `☑`.

### T-14 · Presentation
120m · **wave 5**, parallel with the T-11 → T-12 → T-13 chain

15–20 minutes, engineering audience. Built from these specs, not from scratch.

Sections 1, 2, 3, 4 and 6 below can be written the moment wave 3 merges — they
argue from `PROJECT.md`, `ACCEPTANCE.md`, and the ADRs, all of which are
already final. Only section 5 needs finished numbers, and section 2's live
trace needs a green build. So this task runs in wave 5 and takes two
injections at the end: the ledger totals after T-13, and the QA result.

Structure the argument, do not narrate the build:

1. **The proportionality answer, in the first two minutes.** The project's top
   risk is that this reads as over-engineering (`PROJECT.md` §8). Answer it
   before it is asked: here is the NOT list, here is why a monorepo was
   declined, here is where the seam is.
2. **Requirement → criterion → test → commit**, traced live for one requirement.
3. **The API simulation** as the technical centrepiece: server-side key, 429,
   full jitter, optimistic rollback — each mapped to its cart/checkout analogue.
4. **The build-vs-buy calls**, especially the two deliberate declines: TanStack
   Query and Zustand, and what would flip each.
5. **The ledger** — actual cost of the build, and what the intervention ratio
   says about specification quality.
6. **What I would do next**, from the P2 list and the NOT list.

### T-18 · Tooling marks: lint boundaries replace the meta-tests
`AC-QUAL-1..2`, `AC-CI-1`, `AC-UI-5..6`, `AC-TEST-2..4` (⚙ mark) · 75m · **wave 6, solo** — after T-13; opens the chain

Move every source-tree and config assertion out of Jest and into the tool
that actually enforces it, so the guarantee is the same and the feedback
arrives in the editor. Behaviour tests are untouched.

- `AC-UI-6`: an `eslint.config.mjs` block scoped to `components/ui/**` with
  `no-restricted-imports` forbidding `@/app`, `@/components/tasks`,
  `@/lib/*` except `@/lib/utils`, `@/types`, and any `../` path.
- `AC-UI-5`: `no-restricted-syntax` on JSX elements named `button`, `input`,
  `select`, `textarea`, `dialog` outside `components/ui/**`. No file list —
  the criterion no longer names one (*ARCH-06*, `B-25`).
- `AC-QUAL-1..2`: already `strict: true`, `no-explicit-any` and
  `ban-ts-comment` with a description; the `⚙` mark names them. The test that
  spawned ESLint to read its own config is deleted.
- `AC-CI-1`: `.github/workflows/ci.yml` is the proof; the YAML-regex test is
  deleted.
- `AC-TEST-2`: `eslint-plugin-testing-library` (recommended React config —
  a dev dependency serving [ADR-0006](adr/0006-test-strategy.md), amended
  *ARCH-06*) plus `no-restricted-syntax` on `toHaveClass`, `.className` and
  `.instance()` in `test/**`.
- `AC-TEST-3`: `no-restricted-syntax` on `toMatchSnapshot` and
  `toMatchInlineSnapshot` in `test/**`.
- `AC-TEST-4`: `jest.config.mjs` `coverageThreshold` is the proof. Split
  `npm test` (fast, no coverage) from `npm run test:ci` (coverage, threshold
  enforced) so a local run is the fast path; CI runs the second.
- `AC-TEST-1`: keep `test-sweep.test.ts`, delete the `79` and `seven`
  literals — derive both from `ACCEPTANCE.md`, and accept a criterion whose
  status line carries `⚙` as proven. Delete `test/msw/handlers.test.ts`
  (it tests the test doubles; the handlers are exercised by every MSW test).

**Done when:** `test/quality/typescript.test.ts`, `ci.test.ts` and
`component-boundary.test.ts` are gone, `npm run lint` fails on a
deliberately introduced boundary violation and a hand-rolled `<button>`,
every behaviour test still passes, and the PR body lists each of the eight
criteria with the rule, flag or file that now proves it, for T-21 to mark.

### T-19 · Dead code and single sources of truth
refactor · 90m · **wave 6, solo** — after T-18

Nothing the user can see changes. Every commit cites the criteria whose
tests prove that (`[AC-STATE-1, AC-API-8]` and so on).

1. Delete the `add` and `remove` actions and their reducer cases; the
   provider's `PERSISTING_ACTIONS` set shrinks with them. Delete the `failed`
   sync state and the `sync/set` dispatch that set it; `SyncState` becomes
   `"confirmed" | "syncing"`. Update the reducer tests that exercised them.
2. Derive `Task` from `persistedTaskSchema` (`z.infer` plus `sync`) and delete
   both `Exact<A, B>` checks. `types/task.ts` keeps `TaskId`, `Filter`,
   `FILTERS`, `isFilter` and the `SyncState` union; the schema is the one
   statement of a task's fields.
3. Delete `components/ui/{dialog,select,tabs,radio-group,separator}.tsx`,
   `tw-animate-css`, and the `@import` for it in `app/globals.css`.
4. Mount `<AuthProvider>` once in `app/layout.tsx`; remove the three
   per-segment mounts. Fold `lib/tasks/hooks.ts` into `lib/tasks/provider.tsx`.
5. Split `lib/api/config.ts`: the simulation profile to
   `lib/server/simulation.ts`, the retry policy to `lib/api/retry.ts` beside
   the functions that read it.
6. Consolidate criterion proofs so each `AC-` has one home file. Where the
   a11y file and the optimistic file prove the same announcement, the a11y
   file keeps the assertion that is about the live region and drops the
   one that is about the mutation. Target: no criterion ID named in more
   than three files; `AC-API-4` currently appears in seventeen places.

**Done when:** `npm run build` output is byte-for-byte the same routes,
every test passes, coverage on `lib/**` is at or above the T-11 floor, and
the PR body lists every deleted symbol and file.

### T-20 · Comment diet and React out of `lib/`
refactor · 75m · **wave 6, solo** — after T-19

1. Move `lib/auth/{guards,provider,session-bar}.tsx` to `components/auth/`
   and `lib/tasks/provider.tsx` to `components/tasks/provider.tsx`; `lib/`
   holds nothing that imports React. Update imports, tests and
   `test/api/secret-boundary.test.ts`'s client-module list. `lib/server/**`
   does not move.
2. Rewrite every file header and inline comment to state the invariant and
   the non-obvious why, and nothing about which task, wave, blocker or
   session wrote it. `AC-` references stay where they explain a rule's
   origin (`AC-LIST-3` beside the sort); `T-`, `B-`, `ARCH-`, `AM-` and
   "Wave N" references go. The `AC-API-3` header in `lib/server/env.ts`
   stays as written: it is the secret boundary's own documentation.
3. Delete comments that restate the line below them.

**Done when:** `grep -rE '\b(T-[0-9]{2}|B-[0-9]+|ARCH-[0-9]+|Wave [0-9])\b'
app components lib types` returns nothing, every test passes, and the
comment share of `app components lib types` is under 15% of non-blank lines
(it was 29%).

### T-21 · QA re-verification after the optimisation
verification only · 45m · **wave 7, solo** — fresh session, no shared context

Independent re-walk on the T-13 pattern against `main` after T-20. Every
criterion whose named test moved, was consolidated or became a `⚙` is
re-marked: `☑` with the new file and test name, `⚙` with the rule, flag,
runner option or CI step named beside it, `◉` unchanged for the seven.
Findings go to [`BLOCKERS.md`](BLOCKERS.md). Records the `Commit` column on
`B-25` and `B-26`. Committed as `docs: T-21 ACCEPTANCE.md status marks`.

### T-15 · Freeze and dry run
45m · **wave 8, solo** — after T-21 *and* T-14 (*ARCH-06:* was wave 6; the
freeze stays the last thing that happens)

Nothing merges after this task begins. Full dry run against the live URL, timed.
Record a local fallback path in case the deployment fails during the
presentation.

---

## If time runs short

The slider says **protect scope, accept rough edges** (`PROJECT.md` §6). So
cuts come out of depth, never out of a brief requirement. In this order:

1. **P2 entirely** — Playwright, then Storybook. Already out.
2. **T-11 coverage thresholds** → audit criterion coverage only, drop the
   enforced percentage.
3. **T-09 depth** → keep `jest-axe`, labels, and focus visibility; drop the
   full manual keyboard audit.
4. **T-10** → verify 320 and 1024 only; skip 768.
5. **T-13** → fold QA into T-12 rather than a separate session, and say so in
   the ledger notes.

**Never cut:** anything mapping to R1–R11, `AC-API-3`, or T-15. A missing
requirement is a failed submission; an unrehearsed demo that breaks live is
worse than a rough edge.

## Not in this plan

`PROJECT.md` §4 is the full NOT list. The items most likely to be asked about:

| | Why not |
|---|---|
| Turborepo monorepo | One deployable. The seam is documented instead — [ADR-0003](adr/0003-component-library.md). |
| Admin app for user creation | Not in the brief; contradicts the auth model; traced to a misreading of "user list" (`AM-8`). |
| Storybook | P2. Presents components rather than shipping the app. |
| Playwright E2E | P2. The brief specifies Jest + RTL; T-15's dry run covers the live path. |
| Task edit, reorder, priority, tags, search | Not in the brief. |
| Real backend or database | The brief specifies `localStorage` as the store. |
