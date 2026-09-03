# Glossary

Every term of art used in the deep-dive pages, defined once. Terms specific
to this repository are marked *(repo)*.

**AbortController / AbortSignal** — The Web API for cancelling an in-flight
operation. `fetch` accepts a `signal` and rejects with `AbortError` when the
controller is aborted. The client uses one per request, fired by either a
timeout or the caller. [07](07-resilient-client.md)

**Accessibility tree** — The browser's second representation of the page,
built from roles, names and states, navigated by assistive technology.
[10](10-accessibility.md)

**ADR (Architecture Decision Record)** — One file per decision that was
expensive to make or reverse: context, decision, alternatives, consequences.
Here every ADR also has a build-vs-buy section, and an ADR precedes any new
runtime dependency. [`../adr/`](../adr/README.md)

**`AM-n`, `A-n`, `B-n`, `ARCH-nn`** *(repo)* — Ambiguity, assumption,
blocker and Architect-session identifiers. `AM-` and `A-` are in
`PROJECT.md` and the ADRs; `B-` rows are in `BLOCKERS.md`; `ARCH-` sessions
resolve them. [15](15-process-instrumentation.md)

**`aria-live` region** — An element whose text changes are read by a screen
reader without focus moving to it. `polite` waits; `assertive` interrupts.
[10](10-accessibility.md)

**Backend-for-frontend (BFF)** — A server the browser calls that holds
credentials and talks to upstream services on the browser's behalf. The
Route Handlers are one. [06](06-api-simulation.md)

**Criterion (`AC-…`)** *(repo)* — One numbered Given/When/Then requirement
in `ACCEPTANCE.md`, referenced in test names and commit subjects.
79 exist. [12](12-testing.md)

**Constant-time comparison** — Comparing two secrets in time that does not
depend on where they first differ, so timing cannot leak the secret.
`crypto.timingSafeEqual`. [06](06-api-simulation.md)

**Derived state** — A value computed from other state at render rather than
stored. The list's order and the filtered view are derived.
[09](09-list-filter-ordering.md)

**Discriminated union** — A TypeScript union whose members share a literal
tag (`type`, `ok`, `kind`) so that checking the tag narrows the whole object.
[13](13-typescript-patterns.md)

**Exhaustive switch** — A `switch` over a union with a `default` that assigns
to `never`, so an unhandled member is a compile error.
[03](03-state-management.md), [13](13-typescript-patterns.md)

**Exponential backoff** — Waiting `base × 2^(n−1)` before the *n*th retry.
Alone, it reschedules a thundering herd rather than dispersing it.
[07](07-resilient-client.md)

**Fixed window** — A rate limiter that allows *N* requests per window of
*T* seconds, resetting at the boundary. Legible; weak at the boundary. The
production alternative is a token bucket. [06](06-api-simulation.md)

**Frozen contract** *(repo)* — A file written at T-01 and read by every later
task, changed only through a blocker: `types/*`, `lib/tasks/actions.ts`,
`lib/tasks/schema.ts`, `lib/api/config.ts`, `components/ui/**`,
`test/msw/handlers.ts`. [01](01-architecture-overview.md)

**Full jitter** — Replacing the backoff wait with a uniform random draw in
`[0, backoff]`, so clients rate-limited together retry at different moments.
[07](07-resilient-client.md)

**Hydration** — React attaching to server-rendered HTML on the client. It
requires the client's first render to match the server's, which is why no
browser API is read during render here. [02](02-nextjs-app-router.md)

**`HttpOnly` cookie** — A cookie the browser sends with requests but does not
expose to JavaScript. The production alternative to a `sessionStorage`
token. [05](05-authentication.md)

**Idempotent** — Applying an operation twice has the same effect as once.
The reducer's optimistic cases are idempotent against the races they can
see. [03](03-state-management.md)

**Interventions** *(repo)* — `accepted/edited/rejected`, counted by the
human against proposals a session made. The ledger column the transcript
cannot fill. [15](15-process-instrumentation.md)

**jsdom** — A JavaScript implementation of the DOM used by Jest. It does not
lay out or paint, so responsive and focus-visibility criteria are verified in
a real browser instead. [12](12-testing.md)

**Ledger** *(repo)* — `docs/LEDGER.md`: one row per session with exact token
counts and list-price cost, written by a `SessionEnd` hook.
[15](15-process-instrumentation.md)

**Live region bus** *(repo)* — The module-level publish/subscribe in
`components/ui/live-region.tsx` that lets non-component code announce to the
one mounted region. [10](10-accessibility.md)

**`localStorage` / `sessionStorage`** — Synchronous per-origin string maps.
`localStorage` persists across tabs and restarts; `sessionStorage` is per-tab
and dies with it. Neither is sent to the server. [04](04-persistence-and-storage.md)

**MSW (Mock Service Worker)** — A library that intercepts `fetch` at the
network layer in tests, so the real client code path runs against scripted
responses. [12](12-testing.md)

**`NEXT_PUBLIC_`** — The prefix that makes Next.js inline an environment
variable into the client bundle. Never used for the key.
[14](14-ci-and-security.md)

**Optimistic update** — Applying a change to the UI before the server
confirms it, with a plan to roll it back if the server refuses.
[08](08-optimistic-mutations.md)

**`◉`, `☑`, `◐`, `☐`** *(repo)* — Status marks in `ACCEPTANCE.md`: verified
manually with procedure and date (seven criteria only); met with a named
test; implemented but untested; not started. [12](12-testing.md)

**Reconcile** — Replacing an optimistic record with the server's confirmed
one, matched by identity so the row neither remounts nor reorders.
[08](08-optimistic-mutations.md)

**`Retry-After`** — The HTTP header on a `429` (or `503`) saying how long to
wait. Treated as a floor, never jittered below. [07](07-resilient-client.md)

**Route group** — A directory in parentheses under `app/`, such as
`(protected)`, that carries a layout without adding a URL segment.
[02](02-nextjs-app-router.md)

**Route Handler** — A file `route.ts` under `app/` exporting HTTP-method
functions from `Request` to `Response`. Server-only. [02](02-nextjs-app-router.md)

**Roving tabindex** — A keyboard pattern where a group (the filter radios)
is one Tab stop and arrow keys move within it. Supplied by Radix.
[10](10-accessibility.md)

**Semi-persistent state** *(repo, from the brief)* — State that outlives a
reload but is not a server record; realised as two storages with two
lifetimes. [04](04-persistence-and-storage.md)

**Server Component / Client Component** — In the App Router, a component
that renders on the server and ships no JavaScript, versus one marked
`"use client"` that hydrates in the browser. [02](02-nextjs-app-router.md)

**shadcn/ui** — A generator that copies Radix-based, Tailwind-styled
components into the repository. The source is owned; the behaviour is
bought. [11](11-ui-and-styling.md)

**Split contexts** — Providing state and dispatch through separate React
contexts so dispatch-only consumers do not re-render on state changes.
[03](03-state-management.md)

**Suspense boundary** — A `<Suspense>` wrapper that defers a subtree.
Required above `useSearchParams` for static rendering.
[02](02-nextjs-app-router.md)

**Sync state** *(repo)* — `confirmed | syncing | failed`, the runtime-only
status of a task against the API. Never persisted. [08](08-optimistic-mutations.md)

**Thundering herd** — Many clients retrying at the same instant after a
shared failure, reproducing the spike that caused it. Jitter is the cure.
[07](07-resilient-client.md)

**Token bucket** — A rate limiter that refills tokens at a steady rate and
spends one per request, absorbing bursts. The production alternative to a
fixed window. [06](06-api-simulation.md)

**Type predicate** — A function returning `value is T`, used to narrow
untrusted input (`isFilter`, `isApiErrorBody`). [13](13-typescript-patterns.md)

**Upstream** *(repo)* — The simulated third-party API in
`lib/server/upstream.ts`, behind the `Upstream` interface. The thing that
requires the key and rate-limits. [06](06-api-simulation.md)

**Versioned envelope** — `{ version, tasks }` around persisted data, so a
future shape change can be migrated rather than misread.
[04](04-persistence-and-storage.md)

**Wave** *(repo)* — A set of up to three tasks built concurrently by separate
sessions with disjoint file lanes, gated on `main` being green.
[15](15-process-instrumentation.md)

**`z.infer`** — Zod's utility that derives a TypeScript type from a runtime
schema, so validation and typing have one definition.
[13](13-typescript-patterns.md)
