# ADR-0006 — Jest + RTL + MSW, behaviour-first

**Status:** Accepted, amended 2026-09-02 (ARCH-06) · **Date:** 2026-09-01 · **Criteria:** `AC-TEST-1..4`, `AC-A11Y-6`, and every criterion's proof

## Context

The brief: *"Write unit tests for the components using Jest and React Testing
Library."*

The runner is specified, so the decision is not *what* to use but *what to
assert*. A suite that renders each component and snapshots it satisfies the
letter of the requirement and demonstrates nothing. With 78 acceptance criteria
and a two-day budget, the strategy has to make the criteria the unit of test
design rather than the files.

## Decision

**Tests are organised around acceptance criteria, not around files.** Every
test name carries the criterion ID it proves (`AC-TEST-1`), so a reviewer can
grep any line of Aritzia's brief through to the assertion that covers it:

```
it('AC-API-9: restores the task in place when delete ultimately fails', ...)
```

Four layers, deliberately unequal in size:

| Layer | Tool | Scope | Why it exists |
|---|---|---|---|
| **Pure logic** | Jest | Reducer, validation, backoff, persistence adapter | Fastest and most valuable. The optimistic apply/confirm/rollback transitions are pure functions and can be tested exhaustively with no React involved. |
| **Component behaviour** | RTL + `user-event` | Forms, list, filter, task row | What the brief asks for. Queried by role and label — never by test id or class. |
| **Network boundary** | MSW | Retry, `429`, rollback, in-flight state | Intercepts at the network layer so the real `fetch` path is exercised. |
| **Accessibility** | `jest-axe` | Both pages | `AC-A11Y-6`. Catches the mechanical half of accessibility for the cost of one assertion. |

**Fake timers** for backoff (`AC-API-6`) — a test that genuinely sleeps through
a retry schedule is a test nobody runs twice.

**Coverage thresholds enforced by the runner** (`AC-TEST-4`), on the state,
API-client, and validation modules — the logic, where coverage means something.
Not a global percentage, which mostly measures how much markup exists.

**`AC-API-3` is tested against production build output**, not source: the
built client chunks are searched for the key's value and its variable name.
This is the only test that proves an absence, and it is the most important one
in the suite.

## Build vs. buy

**Jest over Vitest — bought by instruction.** Vitest would be faster, with less
configuration against a modern Next app and no transform pipeline to reconcile.
The brief names Jest. It is named, so it is used; the trade-off is recorded
here rather than quietly overridden. This is the same discipline as
[ADR-0005](0005-auth-and-secret-boundary.md): a specified choice is followed
and its cost stated.

**MSW over hand-rolled `fetch` mocks — bought.** `jest.mock('../api')` is free
and tests the wrong thing: it asserts that a function you wrote was called with
arguments you chose, which passes happily while the real request path is
broken. MSW intercepts at the network layer, so the test exercises the actual
client including headers, status handling, and retry. Roughly twenty minutes of
setup that repays itself on the first `429` test.

**`jest-axe` — bought.** One dependency, one assertion per page, covers the
mechanical portion of `AC-A11Y-1..5`. Nothing about it is worth building.
It does not cover the judgement half — announcement order, focus placement,
whether a label is *meaningful* — which is why `AC-A11Y-4` is a manual
keyboard walk as well.

**A render helper wrapping the providers — built.** Twenty lines, and every
alternative is worse. Repeating provider setup in each test file is the main
way a suite becomes unmaintainable.

**Not bought: Playwright.** The right tool for `AC-DEP-1`'s full path, and out
of P1 scope on the deadline. The unit and integration layers cover the same
behaviour with less setup; what E2E adds is proof it works in a real browser
against the real deployment, which for this submission is covered by a manual
dry-run instead (`TASKS.md`).

## Consequences

**Good.** The criterion IDs make coverage of the *brief* auditable, which is a
different and more useful thing than line coverage. Testing the reducer as a
pure function means the hardest logic — rollback ordering — is tested without
rendering anything.

**Bad.** Criterion-named tests are a convention that requires discipline;
nothing enforces it automatically, so a criterion can be marked met by a test
that only appears to prove it. The mitigation is that `AC-TEST-1` requires the
ID to appear in a test name, which is at least greppable. MSW and `jest-axe`
are two dependencies the brief did not ask for; both are justified above.

**Known gap, stated rather than hidden.** These tests run in jsdom. jsdom is
not a browser: it does not lay out, so `AC-UI-1..4` — responsiveness — cannot
be meaningfully asserted here and is verified by manual inspection at 320, 768,
and 1024 pixels. Claiming responsive coverage from jsdom would be a false
assurance, which is worse than an acknowledged manual check.

## Amendment — ARCH-06, 2026-09-02

The delivered suite had 299 tests, 33 of which asserted on configuration
files and the source tree: a Jest test spawning ESLint to confirm the ESLint
config, another regex-parsing the CI workflow, another walking `components/`
to check import directions. Every one of them was a consequence of rule 5
applied to a criterion that is a property of tooling, and every one of them
is a lint rule that would give the same guarantee faster and in the editor.

**Decision.** A criterion about the toolchain is proved by the tool. The
`⚙` mark (`ACCEPTANCE.md` legend) names the rule; the Jest meta-tests are
deleted (T-18). Behaviour tests are untouched, and `AC-TEST-1`'s
cross-check between `ACCEPTANCE.md` and the suite stays, because a document
and a test tree drifting apart is a behaviour of the repository.

**Build vs. buy.** `eslint-plugin-testing-library` — bought, as a dev
dependency under this ADR. It enforces `AC-TEST-2`'s query discipline with
rules maintained by the Testing Library authors; the hand-written regexes it
replaces caught five patterns and would have to be extended by hand for
each new one. Boundary rules (`AC-UI-5..6`) are `no-restricted-imports` and
`no-restricted-syntax` from ESLint core — nothing to buy.

**Consequence.** `npm test` no longer collects coverage on a local run;
`npm run test:ci` does, and CI runs that. The threshold is enforced where it
matters and the fast path is fast.

## eCommerce mapping

The layering is the same one a checkout flow needs, for the same reason: the
money-handling logic — totals, tax, promotion stacking — is pure and deserves
exhaustive unit tests; the network boundary deserves tests that exercise the
real request path because that is where partial failure lives; and the
accessibility of a purchase flow is a legal exposure, not a nicety. A suite
that snapshots the checkout page proves none of it.
