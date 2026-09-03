# Technical Deep Dive

> **What this is:** the wiki for the technical systems behind this
> application. It is written to be *learned from* and *discussed from*: each
> page explains one subsystem, the general concept it is an instance of, why
> the code takes the shape it does, and where to look in the source to see it.
> **Written:** 2026-09-02, against `main` `a74ab31`.
> **Companion to:** [`../adr/`](../adr/README.md) (the decisions) ·
> [`../ACCEPTANCE.md`](../ACCEPTANCE.md) (the criteria) ·
> [`../PROJECT.md`](../PROJECT.md) (the why)

The ADRs record *what was decided and why*. This section records *how it
works*: the mechanisms, the trade-offs at the level of individual lines, and
the general engineering concepts a reviewer might want to discuss. Where a
page restates an ADR it links to it instead; where it explains something the
ADR takes for granted, it explains it in full.

## How to read this

Read the [architecture overview](01-architecture-overview.md) first. It has
the one diagram that every other page zooms into. After that the pages are
independent; each opens with a summary paragraph, so skim those to find the
subsystem you want.

Each page follows the same shape:

1. **In one paragraph** — the idea, stated once.
2. **The concept** — the general engineering principle, independent of this codebase.
3. **How it is built here** — the modules, with file paths.
4. **The decisions inside** — the small choices the ADR did not record, and why.
5. **What to discuss** — the questions a reviewer might ask, with the honest answers.
6. **Where to look** — the files and the tests that prove it.

## Pages

| # | Page | Subsystem | Source of truth |
|---|---|---|---|
| 01 | [Architecture overview](01-architecture-overview.md) | The request path, the module map, the server/client seam | [ADR-0001](../adr/0001-app-router.md), [ADR-0004](../adr/0004-api-simulation.md) |
| 02 | [Next.js App Router](02-nextjs-app-router.md) | Route groups, layouts, server vs client components, Route Handlers, hydration | [ADR-0001](../adr/0001-app-router.md) |
| 03 | [State management](03-state-management.md) | Context + reducer, split contexts, discriminated-union actions, the persistence trigger | [ADR-0002](../adr/0002-state-management.md) |
| 04 | [Persistence and storage](04-persistence-and-storage.md) | `localStorage` vs `sessionStorage`, the versioned envelope, fail-safe parsing with Zod | [ADR-0002](../adr/0002-state-management.md), [ADR-0005](../adr/0005-auth-and-secret-boundary.md) |
| 05 | [Authentication and route guards](05-authentication.md) | The session record, the three guards, why middleware cannot help, what production changes | [ADR-0005](../adr/0005-auth-and-secret-boundary.md) |
| 06 | [The API simulation](06-api-simulation.md) | Route Handlers, the simulated upstream, the fixed-window limiter, the secret boundary | [ADR-0004](../adr/0004-api-simulation.md) |
| 07 | [The resilient client](07-resilient-client.md) | Timeouts, `AbortController`, the error taxonomy, exponential backoff with full jitter, `Retry-After` | [ADR-0004](../adr/0004-api-simulation.md) |
| 08 | [Optimistic mutations](08-optimistic-mutations.md) | Apply, reconcile, roll back; sync state; where the prior record is held | [ADR-0004](../adr/0004-api-simulation.md) |
| 09 | [List, filter and ordering](09-list-filter-ordering.md) | Derived order, the URL as the filter's state, calendar days vs instants | [ADR-0002](../adr/0002-state-management.md) |
| 10 | [Accessibility](10-accessibility.md) | The live-region bus, error association, focus management when a row leaves, touch targets | [ADR-0003](../adr/0003-component-library.md) |
| 11 | [UI, components and styling](11-ui-and-styling.md) | shadcn's ownership model, Radix, Tailwind v4, the component boundary, responsive layout | [ADR-0003](../adr/0003-component-library.md) |
| 12 | [Testing](12-testing.md) | Four layers, MSW, injected time and randomness, coverage floors, the bundle test, tests over the source tree | [ADR-0006](../adr/0006-test-strategy.md) |
| 13 | [TypeScript patterns](13-typescript-patterns.md) | Discriminated unions, exhaustiveness, the `Exact` check, schema-derived types, type predicates | [ADR-0006](../adr/0006-test-strategy.md) |
| 14 | [CI, repository guards and secrets](14-ci-and-security.md) | The five-step pipeline, Repo Guard, the key's whole lifecycle, branch protections | [ADR-0005](../adr/0005-auth-and-secret-boundary.md) |
| 15 | [Process instrumentation](15-process-instrumentation.md) | Roles, task attribution, the ledger, hooks, spec-lint, waves, blockers | [`../LEDGER.md`](../LEDGER.md), [`../TASKS.md`](../TASKS.md) |
| — | [Glossary](glossary.md) | Every term of art used in these pages, defined once | — |

## The spine, in one table

`PROJECT.md` §2 frames each requirement as the miniature of a problem an
eCommerce stack already has. The deep-dive pages are where those analogies
are made concrete, so the same table is repeated here with the page that
carries each one:

| This app | The general problem | Page |
|---|---|---|
| Optimistic add/delete with rollback | Any mutation that must feel instant and reconcile later: a cart, a wishlist, a like | [08](08-optimistic-mutations.md) |
| `429` + `Retry-After` with full jitter | Any call to a rate-limited dependency under a synchronised spike | [07](07-resilient-client.md) |
| Filter held in the URL | Any faceted view that must be shareable, restorable and back-button-safe | [09](09-list-filter-ordering.md) |
| Private key read only in a Route Handler | Any credential that must never ship in a client bundle | [06](06-api-simulation.md), [14](14-ci-and-security.md) |
| `localStorage` rehydration through a versioned schema | Any client-persisted record that outlives the deploy that wrote it | [04](04-persistence-and-storage.md) |
| `sessionStorage` identity that dies with the tab | Session-scoped state, and why production uses an `HttpOnly` cookie instead | [05](05-authentication.md) |

## Conventions in these pages

- **File paths are repository-relative** and in code font: `lib/api/retry.ts`.
- **Criterion IDs** (`AC-API-6`) link the mechanism to
  [`ACCEPTANCE.md`](../ACCEPTANCE.md), where the test that proves it is named.
  `scripts/spec-lint.py` checks that every ID used here exists.
- **Ambiguity IDs** (`AM-3`) and **assumption IDs** (`A-5`) refer to
  [`PROJECT.md`](../PROJECT.md) §9 and the ADRs.
- **"The brief"** is Aritzia's original requirement text, quoted verbatim in
  [`ACCEPTANCE.md`](../ACCEPTANCE.md)'s traceability table.
- Code excerpts are trimmed. The file is the source; the excerpt is the pointer.
