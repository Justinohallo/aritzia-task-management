# TASKS.md — the ordered build plan

> **No task has been started.** This document is the plan, not a record of
> progress.
>
> **Appetite:** P1 complete by 2026-09-02 17:00 PT (confirmed).
> **Estimated:** ~16.5 focused hours across ~15 sessions.

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

| # | Task | Criteria | Est. | Depends on |
|---|---|---|---|---|
| **T-01** | Scaffold and CI | `AC-QUAL-1..2`, `AC-CI-1..2` | 60m | — |
| **T-02** | Auth and routing | `AC-AUTH-1..9`, `AC-NAV-1..4` | 75m | T-01 |
| **T-03** | Task provider and persistence | `AC-STATE-1..6`, `AC-AUTH-10` | 75m | T-01 |
| **T-04** | Add-task form | `AC-ADD-1..7` | 60m | T-03 |
| **T-05** | List, filter, complete, delete | `AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`, `AC-DEL-1`, `AC-DEL-3..4` | 90m | T-04 |
| | 🏁 **Milestone: the application works** | | | |
| **T-06** | API Route Handlers and the secret boundary | `AC-API-1..5`, `AC-API-10` (server) | 75m | T-05 |
| **T-07** | Resilient API client | `AC-API-6..7`, `AC-API-12`, `AC-API-10` (client) | 75m | T-06 |
| **T-08** | Optimistic mutations | `AC-API-8..9`, `AC-API-11`, `AC-ADD-8`, `AC-DEL-2` | 90m | T-07 |
| | 🏁 **Milestone: every brief requirement met** | | | |
| **T-09** | Accessibility pass | `AC-A11Y-1..6` | 60m | T-08 |
| **T-10** | Responsive pass and component boundary | `AC-UI-1..6` | 45m | T-08 |
| **T-11** | Test sweep | `AC-TEST-1..4` | 60m | T-09, T-10 |
| **T-12** | Promote and verify the deployment | `AC-DEP-1` | 30m | T-11 |
| **T-13** | QA pass | all — verification only | 45m | T-12 |
| **T-14** | Presentation | — | 120m | T-13 |
| **T-15** | Freeze and dry run | — | 45m | T-14 |

---

## Task detail

### T-01 · Scaffold and CI
`AC-QUAL-1`, `AC-QUAL-2`, `AC-CI-1`, `AC-CI-2` · 60m

Next.js App Router, TypeScript strict, Tailwind, shadcn/ui initialised. Jest +
RTL + `user-event` + MSW + `jest-axe` configured and running one trivial test.
GitHub Actions running typecheck, lint, and test on pull requests, registered
as a required status check.

**Done when:** `npm run typecheck && npm run lint && npm test` pass locally and
in CI on a pull request.

**Hand-off at the end of this task:** the stakeholder connects the Vercel
project. Connecting it here rather than at T-12 means every subsequent push
produces a preview deployment, so the live path is exercised eleven tasks
before anyone depends on it. `TASKS_API_KEY` is set in Vercel's encrypted
environment at the same time — never committed, never `NEXT_PUBLIC_`.

> CI first, before there is anything to check. It costs an hour once and gates
> every task after it; retrofitting it at T-11 means eleven tasks landed
> unverified.

### T-02 · Auth and routing
`AC-AUTH-1..9`, `AC-NAV-1..4` · 75m · after T-01

`/login` and `/tasks` as distinct routes; `/` redirects by auth state.
`AuthProvider` over `sessionStorage`. Route protection as a **client-side
guard** in the protected layout that renders nothing until auth state is read —
not middleware, which cannot see `sessionStorage`
([ADR-0001](adr/0001-app-router.md), [ADR-0005](adr/0005-auth-and-secret-boundary.md)).
The non-production notice on the login page.

**Done when:** `AC-AUTH-5` passes — the new-tab case is asserted, not assumed.

### T-03 · Task provider and persistence
`AC-STATE-1..6`, `AC-AUTH-10` · 75m · after T-01

Split state/dispatch contexts, `useReducer`, discriminated-union actions, typed
hooks. Versioned `localStorage` adapter with Zod validation and a fail-safe
read. Hydration after mount.

**Done when:** `AC-STATE-5` passes with malformed JSON, valid-JSON-wrong-shape,
and an unknown version — each rendering an empty list rather than throwing.

> Runs in parallel with T-02 if there are two sessions available; they share
> only the scaffold.

### T-04 · Add-task form
`AC-ADD-1..7` · 60m · after T-03

shadcn form primitives. Title and due-date validation with errors associated
via `aria-describedby`. Trim, length bound, past dates allowed and marked
overdue. Reset and focus return on success. No API yet — dispatch straight to
the reducer.

**Done when:** every validation branch has a test naming its criterion.

### T-05 · List, filter, complete, delete
`AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`, `AC-DEL-1`, `AC-DEL-3..4` · 90m · after T-04

Task list with deterministic ordering and an overdue marker that is not
colour-only. All / Pending / Completed filter, **held in the URL query string**
so it is shareable, restorable, and back-button-correct (`AC-FILT-4`). Distinct
empty states. Complete, uncomplete, delete — all still local.

**🏁 At the end of this task the application is demonstrable.** Everything
after it deepens something that already runs.

### T-06 · API Route Handlers and the secret boundary
`AC-API-1..5`, `AC-API-10` (server) · 75m · after T-05

`POST /api/tasks`, `DELETE /api/tasks/:id`. `TASKS_API_KEY` read from server
environment only. `401` on a bad key. Fixed-window limiter returning `429` with
`Retry-After`. Injectable latency and scripted failures — never `Math.random()`.

**Includes `AC-API-3`: the test that searches the production client bundle for
the key's value and its variable name.** It is the only test in the suite that
proves an absence, and it is the one that makes the secret-handling claim
checkable rather than asserted. Do not defer it.

### T-07 · Resilient API client
`AC-API-6..7`, `AC-API-12`, `AC-API-10` (client) · 75m · after T-06

Typed client with `AbortController` and timeout. On `429`: wait at least
`Retry-After`, then exponential backoff with **full jitter**
([ADR-0004](adr/0004-api-simulation.md)). Bounded retry budget. Never retry a
non-`429` `4xx`. Rate-limit failure messaged distinctly from generic failure.

Tests use MSW and fake timers. A test that really sleeps through a retry
schedule is a test nobody runs twice.

### T-08 · Optimistic mutations
`AC-API-8..9`, `AC-API-11`, `AC-ADD-8`, `AC-DEL-2` · 90m · after T-07

Per-task sync state of `confirmed | pending | failed`, in the reducer. Add and
delete apply immediately; reconcile on success; restore prior state and
position on final failure. In-flight indicators announced, not spinner-only.
Double-submit guarded.

**🏁 Every requirement in Aritzia's brief is now met.**

> The riskiest task in the plan. Rollback ordering — restoring a deleted task
> to its original index rather than appending it — is where this goes wrong,
> and it is why the reducer is tested as a pure function first.

### T-09 · Accessibility pass
`AC-A11Y-1..6` · 60m · after T-08

Labels, `aria-describedby`/`aria-invalid` on errors, live-region announcements
for async outcomes, visible focus, no colour-only meaning. `jest-axe` on both
pages, plus a manual keyboard walk of the full path — axe cannot judge whether
a label is meaningful or whether focus lands somewhere sensible.

### T-10 · Responsive pass and component boundary
`AC-UI-1..6` · 45m · after T-08

320 / 768 / 1024 verified by hand — jsdom does not lay out, so this cannot be
asserted in Jest ([ADR-0006](adr/0006-test-strategy.md)), and claiming
otherwise would be a false assurance. Touch targets ≥ 44px. Audit that
primitives are shadcn and that no primitive imports from the task domain.

### T-11 · Test sweep
`AC-TEST-1..4` · 60m · after T-09, T-10

Audit every criterion ID for a test that names it. Fill gaps. Enforce coverage
thresholds on state, API-client, and validation modules. Remove any
snapshot-only coverage.

**Done when:** no criterion in `ACCEPTANCE.md` is marked `☑` without a named
test, and `◐` is used honestly for anything implemented but unproven.

### T-12 · Promote and verify the deployment
`AC-DEP-1` · 30m · after T-11

The Vercel project was connected at T-01, so this is verification rather than
setup — which is the point of moving it earlier. Confirm `TASKS_API_KEY` is
present in the production environment and absent from the bundle
(`AC-API-3` again, this time against the deployed artifact). Verify the full
path on a real phone-width viewport, not a desktop devtools emulation.

### T-13 · QA pass
verification only · 45m · after T-12

Independent walk of all 78 criteria against the deployed build. Fresh session —
QA that shares context with the Builder is not independent. Findings go back as
tasks; the QA session writes no application code.

### T-14 · Presentation
120m · after T-13

15–20 minutes, engineering audience. Built from these specs, not from scratch.

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
45m · after T-14

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
