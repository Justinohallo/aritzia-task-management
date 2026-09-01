# TASKS.md — the ordered build plan

> **No task has been started.** This document is the plan, not a record of
> progress.
>
> **Appetite:** P1 complete by 2026-09-02 17:00 PT (confirmed).
> **Estimated:** 18h30m of work across 17 tasks — 17h15m of build once the
> two tooling tasks are excluded. The Sequence table is the source; these
> totals are its sum. **9h45m of wall clock** when run as six waves of
> concurrent agents. T-00 and T-16 add tooling work and no wall clock: they
> run inside wave 0, alongside the longer T-01.
> See [Running in parallel](#running-in-parallel).
>
> **Amended 2026-09-01 (ARCH-03).** A fresh-session critic pass over the
> whole spec system found fifteen contradictions before wave 0 opened. Each
> amendment below is marked *ARCH-03* and the findings are recorded as
> `B-01..B-17` in [`BLOCKERS.md`](BLOCKERS.md). The pass repeats after any
> Architect amendment, before the next wave opens.

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
| **T-01** | Scaffold, contracts, and CI | `AC-QUAL-1..2`, `AC-CI-1..2` | 90m | **0** | — |
| **T-02** | Auth and routing | `AC-AUTH-1..9`, `AC-NAV-1..4` | 75m | **1** | T-01 |
| **T-03** | Task provider and persistence | `AC-STATE-1..6`, `AC-AUTH-10` | 75m | **1** | T-01 |
| **T-06** | API Route Handlers and the secret boundary | `AC-API-3..5`, `AC-API-10` (server) | 75m | **1** | T-01 (contract only) |
| **T-04** | Add-task form | `AC-ADD-1..7` | 60m | **2** | T-03 |
| **T-05** | List, filter, complete, delete | `AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`, `AC-DEL-1`, `AC-DEL-3..4` | 90m | **2** | T-03 |
| **T-07** | Resilient API client | `AC-API-6`, `AC-API-7` (client), `AC-API-12` (client), `AC-API-10` (client) | 75m | **2** | T-06 |
| | 🏁 **Milestone: the application works** (end of wave 2) | | | | |
| **T-08** | Optimistic mutations | `AC-API-1..2`, `AC-API-7` (rollback), `AC-API-8..9`, `AC-API-11`, `AC-API-12` (message), `AC-ADD-8`, `AC-DEL-2` | 90m | **3** | T-04, T-05, T-07 |
| | 🏁 **Milestone: every brief requirement met** | | | | |
| **T-09** | Accessibility pass | `AC-A11Y-1..6` | 60m | **4** | T-08 |
| **T-10** | Responsive pass and component boundary | `AC-UI-1..6` | 45m | **4** | T-08 |
| **T-11** | Test sweep | `AC-TEST-1..4` | 60m | **5** | T-09, T-10 |
| **T-12** | Promote and verify the deployment | `AC-DEP-1` | 30m | **5** | T-11 |
| **T-13** | QA pass | all — verification only | 45m | **5** | T-12 |
| **T-14** | Presentation | — | 120m | **5** | wave gate only — the specs, *not* the code |
| **T-15** | Freeze and dry run | — | 45m | **6** | T-13, T-14 |

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
| **1** | 3 | T-02 ‖ T-03 ‖ T-06 | 75m | all three merged, `main` green |
| **2** | 3 | T-04 ‖ T-05 ‖ T-07 | 90m | all three merged, `main` green 🏁 *app works* |
| **3** | 1 | T-08 | 90m | merged, `main` green 🏁 *brief met* |
| **4** | 2 | T-09 ‖ T-10 | 60m | T-09 and T-10 merged |
| **5** | 2 | T-11 → T-12 → T-13 ‖ T-14 | 135m | QA pass recorded, T-14 drafted |
| **6** | 1 | T-15 | 45m | — |

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
| **T-14** | `docs/presentation/**` | all specs, `LEDGER.md` |

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

**Done when:** no criterion in `ACCEPTANCE.md` is marked `☑` without a named
test, the seven criteria no Jest test can prove are `◉` with their procedure
named, and `◐` is used honestly for anything implemented but unproven.

### T-12 · Promote and verify the deployment
`AC-DEP-1` · 30m · **wave 5, solo**

The Vercel project was connected at T-01, so this is verification rather than
setup — which is the point of moving it earlier. Confirm `TASKS_API_KEY` is
present in the production environment and absent from the bundle
(`AC-API-3` again, this time against the deployed artifact). Verify the full
path on a real phone-width viewport, not a desktop devtools emulation.

### T-13 · QA pass
verification only · 45m · **wave 5, solo** — fresh session, no shared context

Independent walk of all 78 criteria against the deployed build. Fresh session —
QA that shares context with the Builder is not independent. Findings are
written to [`BLOCKERS.md`](BLOCKERS.md), and the Architect turns them into
tasks; the QA session writes no application code and no spec.

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

### T-15 · Freeze and dry run
45m · **wave 6, solo** — after T-13 *and* T-14

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
