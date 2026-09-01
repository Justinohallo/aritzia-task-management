# PROJECT.md — Aritzia Task Management

> **Status:** specification complete, build not started.
> **Written:** 2026-09-01 · **Due:** 2026-09-02 17:00 PT `[ASSUMED — see A-1]`
> **Source of truth for:** `docs/ACCEPTANCE.md`, `docs/adr/`, `docs/TASKS.md`

This is a technical case assessment for a Senior Developer role at Aritzia.
The deliverable is two things, not one: a Next.js/TypeScript task-management
application, and a 15–20 minute presentation on approach, rationale, and AI
workflow. The application is the evidence; the presentation is the argument.

---

## 1. Why are we here

To demonstrate senior engineering judgment and a repeatable AI-augmented
delivery process, weighted roughly equally.

The application itself is a to-do list. Nobody is impressed by a to-do list.
What is being assessed is everything around it: whether the requirements were
read precisely, whether the trade-offs were named, whether the tests test
anything, whether the scope was sized correctly, and whether the process that
produced it would survive contact with a real team.

The build is instrumented — every session's token usage and API-equivalent
cost is recorded in [`docs/LEDGER.md`](LEDGER.md) by an automatic hook — so
that "I work this way with AI" is a claim backed by numbers rather than an
assertion.

## 2. Elevator pitch

> **For** an engineering panel evaluating how a senior developer thinks,
> **this project** is a vertical slice of an eCommerce stack disguised as a
> task manager. **Unlike** a to-do app built to satisfy a checklist, **it
> treats each requirement as the miniature of a production problem Aritzia
> already has** — optimistic mutation with rollback is cart add/remove,
> rate-limit handling is a third-party inventory or payment call, filter
> state is catalog faceting, and server-side key handling is every
> integration that must never leak into a client bundle.

The mapping is the presentation's spine. Each architectural decision is
defended twice: once for this app, once for the checkout flow it generalises
to.

| This app | The Aritzia analogue |
|---|---|
| Optimistic add/delete with rollback | Cart mutation — instant feedback, reconcile or revert |
| 429 + `Retry-After` handling | Third-party inventory, tax, payment, or ESP calls |
| Filter by All / Pending / Completed | Catalog faceting — URL-addressable, shareable, restorable |
| Private key in a Route Handler | Any integration credential that must not reach the browser |
| localStorage rehydration | Guest cart persistence across sessions |
| sessionStorage auth token | Session-scoped identity that dies with the tab |

## 3. What we are building

The eleven requirements in Aritzia's brief, met precisely, plus the
non-functional work an engineering audience will look for anyway
(accessibility, CI, a live URL).

Requirements are not restated here. They live as numbered, testable criteria
in [`docs/ACCEPTANCE.md`](ACCEPTANCE.md), each mapped to a test and a commit.

## 4. The NOT list

Everything here is a deliberate cut, defensible on request. The first two
were chosen in intake; the rest are forced by the 48-hour appetite or absent
from the brief.

| Not doing | Why |
|---|---|
| Real auth provider (NextAuth, OAuth, JWT) | The brief specifies a locally persisted form with sessionStorage. Substituting a real provider would ignore an explicit instruction. Recorded as non-production in [ADR-0005](adr/0005-auth-and-secret-boundary.md). |
| Multi-user / collaboration / assignment | Not in the brief. Invites sync, conflict, and permission questions that a 48-hour build cannot answer honestly. |
| Real backend or database | The brief specifies localStorage for the list. A database would contradict the stated persistence model and add a deploy dependency. |
| Task editing, reordering, priority, tags, search | Not in the brief. Create, complete, and delete are the stated operations. |
| Turborepo monorepo | A monorepo earns its cost at two deployables or two consumers of a shared package. There is one app. The seam where `packages/ui` would split out is documented instead — see [ADR-0003](adr/0003-component-library.md). |
| Admin app for user creation | Not in the brief. It contradicts the sessionStorage auth model, and a user-creation surface would be graded as production security code. Traced to an ambiguous reading of "user list" — see A-3. |
| Storybook | Genuine value at a design-system-led brand, but it presents components rather than shipping the app. First item in P2. |
| Playwright E2E | The brief specifies Jest + RTL. E2E is additive, not required. Second item in P2. |

## 5. Stakeholders and users

| Who | Role | What they need from this |
|---|---|---|
| Aritzia engineering panel | Decision makers, **primary audience** | Evidence of judgment. They will read the diff, the tests, and the commit history. |
| Justin O'Halloran | Builder, presenter, sole approver | A submission that is complete, defensible, and demonstrably his own reasoning. |
| App end user | Notional — a generic single user | Not a persona exercise. The eCommerce framing lives in the architecture narrative, not in product copy. |

**Audience calibration:** engineering only. The presentation can assume
fluency in React, Next.js, and testing. Business framing stays brief; depth
on trade-offs is rewarded.

## 6. Trade-off sliders

Where two of these collide, the higher one wins.

| | Position | Meaning |
|---|---|---|
| 1 | **Scope** | Everything promised is present at 17:00 Wednesday. A missing requirement is a failed submission; a rough edge is a talking point. |
| 2 | **Quality** | TypeScript strict, tests that assert behaviour, accessible by default. Protected everywhere except the last hour. |
| 3 | **Presentation** | A fixed reserved block, not the remainder. Generated from these specs rather than written from scratch. |
| 4 | **Time** | Fixed. The deadline does not move. |

Stated plainly: **protect scope, accept rough edges.** If something is
unfinished at the freeze, it ships rough and is named as rough in the deck —
it is not deleted, and it is not hidden.

## 7. Appetite and phasing

**Appetite: ~48 hours wall clock, of which an unknown fraction is available.**
Plan assumes roughly one and a half working days of real capacity.

| Phase | Contents | Status |
|---|---|---|
| **P1** | All eleven brief requirements + accessibility + CI + Vercel deploy + the presentation | The submission. Complete and presentable on its own. |
| **P2** | Playwright smoke, then Storybook | Only if P1 is finished and frozen. Purely additive — neither touches P1's structure. |

P2 is not expected to happen at a Wednesday deadline. It exists so that
"what would you do next" has a concrete, already-reasoned answer.

**Freeze:** deploy freeze and demo dry-run are a tracked task, not a hope.
Nothing merges after the freeze.

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Over-engineering read as poor judgment** — the stakeholder's stated top risk. Five ADRs and a session ledger around a to-do list can read as inability to size a solution. | High | Meet it head-on rather than hope it goes unasked. The NOT list is a deck slide. Each ADR states what was *not* built and why. The proportionality argument is made out loud in the first two minutes. |
| **Demo breaks during the presentation** | High | Deploy freeze + dry-run as a tracked task. Local fallback recorded in case the live URL fails. |
| **Not finishing** | Medium | Phasing. P1 is ordered so that the first four tasks alone produce a working, demonstrable app; everything after that improves a thing that already runs. |
| **"This is just AI slop"** | Medium | The ledger, the ADRs, and the intervention log are the counter-argument. Commits reference acceptance criteria, so the reviewer can trace requirement → criterion → test → commit. |
| **Weak presentation, strong code** | Medium | Deck is a tracked, ledgered task with a reserved block, generated from these specs. |
| **Rate-limit / optimistic-rollback design consumes disproportionate time** | Medium | It is the most interesting engineering in the brief and the largest creativity payoff, so it is deliberately funded — but it is scheduled after the core CRUD path works, never before. |

## 9. Assumptions

Each of these is a decision made in the absence of an explicit instruction.
They are recorded so they can be challenged rather than discovered.

| ID | Assumption | Basis | If wrong |
|---|---|---|---|
| **A-1** | The deadline is **Wednesday 2026-09-02, 17:00 PT**. | Stakeholder said "Wednesday September at 5PM" without a date; the nearest Wednesday is the 2nd. | If it is the 9th, P1 lands a week early and P2 executes in full. Planning to the nearer date is the safe error. |
| **A-2** | **"Use pages for the log in form and user list"** means two distinct routes, not the Next.js Pages Router. | Distinct routes satisfy the phrase under either reading. App Router chosen deliberately — see [ADR-0001](adr/0001-app-router.md). | Low impact. Both routes exist either way; only the file layout differs. |
| **A-3** | **"user list"** means the signed-in user's task list, not a list of user accounts. | Every other bullet in the brief concerns tasks. No user-management requirement appears anywhere. | Would imply a user-admin surface. Explicitly cut — see §4. |
| **A-4** | **"Consider potential rate-limiting scenarios"** is satisfied by implementing 429 handling with backoff, not merely documenting a strategy. | "Consider" is weaker than "implement." Depth chosen because it is the strongest eCommerce analogue available. | Over-delivery, not under-delivery. Recorded in [ADR-0004](adr/0004-api-simulation.md) as a judgment call, not a requirement. |
| **A-5** | **Deterministic failure injection** is in scope for the API simulation. | Not in the brief. The brief's Jest + RTL requirement makes it necessary: a simulation that fails on `Math.random()` cannot be tested without flakes. | Fall back to a simpler injectable mock. Something must make the failure path deterministic. |
| **A-6** | The **presentation is a tracked, ledgered task**, ending in a deploy freeze and dry-run. | Stakeholder confirmed. | — |
| **A-7** | Submission is a **public repo link plus a live deployed URL**. | Stakeholder confirmed. | If repo-only, the Vercel task drops and half a day returns to P2. |
| **A-8** | **Semi-persistent state** means React Context + reducer with localStorage rehydration — no Redux, Zustand, or Jotai. | The brief says "a provider … without relying on a full-fledged store." | — |

## 10. Open questions

| ID | Question | Blocking? | Default if unanswered |
|---|---|---|---|
| **Q-1** | Is the deadline Wednesday the 2nd or the 9th? (A-1) | No | Build to the 2nd. |
| **Q-2** | Does Aritzia expect the repo to contain the presentation, or is the deck delivered separately? | No | Deck outline committed to `docs/`; the slides themselves stay out of the repo. |
| **Q-3** | Should the live demo be publicly reachable, or protected? A public URL with a fake login is harmless but is a public artifact tied to a hiring process. | No | Public. No real credentials exist. |

## 11. Definition of done

P1 is done when all of the following hold:

1. Every acceptance criterion in `docs/ACCEPTANCE.md` is marked met, with the
   test that proves it named.
2. `npm run typecheck`, `npm run lint`, and `npm test` pass clean in CI on the
   pull request.
3. The live Vercel URL serves the app, and the full path — log in, add, filter,
   complete, delete, reload, log out — works on a phone-width viewport.
4. No private key appears in any client bundle, asserted by a test.
5. `docs/LEDGER.md` has a row per task, and the totals reconcile.
6. The deck is written and rehearsed once against the live URL.
