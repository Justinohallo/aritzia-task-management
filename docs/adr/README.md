# Architecture decision records

One file per decision that was expensive to make or would be expensive to
reverse. Each records the context at the time, the decision, the alternatives
that were genuinely considered, and the consequences — including the bad ones.

Every ADR carries a **build vs. buy** section. On a two-day build with a
grading rubric, the temptation is to hand-roll everything to show range. That
is the wrong instinct: writing an accessible combobox from scratch is not
evidence of seniority, it is evidence of not knowing what a combobox costs.
The judgment being demonstrated is knowing which line to be on and why.

**Rule for this repository:** an ADR is written *before* a new runtime
dependency is added, not after.

| # | Decision | Status |
|---|---|---|
| [0001](0001-app-router.md) | Next.js App Router over Pages Router | Accepted |
| [0002](0002-state-management.md) | Context + reducer over a state library | Accepted |
| [0003](0003-component-library.md) | shadcn/ui over a packaged component library | Accepted |
| [0004](0004-api-simulation.md) | Route Handler simulation with bounded, jittered retry | Accepted |
| [0005](0005-auth-and-secret-boundary.md) | sessionStorage auth per brief; server-only secret boundary | Accepted |
| [0006](0006-test-strategy.md) | Jest + RTL + MSW, behaviour-first | Accepted |
