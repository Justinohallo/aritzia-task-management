# ADR-0004 — Route Handler simulation with bounded, jittered retry

**Status:** Accepted, amended 2026-09-01 (ARCH-03: who presents the key) · **Date:** 2026-09-01 · **Criteria:** `AC-API-1..12`, `AC-DEL-1`, `AC-ADD-1`

## Context

The brief: *"Simulate an API call on each addition and removal (assume the API
requires a private key for use and consider potential rate-limiting
scenarios)."*

One sentence, three requirements: a call on add and remove, a private key, and
rate limiting. It is the least specified bullet in the brief and the one with
the most engineering in it — which makes it the right place to spend surplus
effort (`PROJECT.md` §8).

## Decision

**A real network round trip to Next.js Route Handlers**, not a client-side
timer.

**Server** — two layers, both of which run only on the server:

1. **Route Handlers** — `POST /api/tasks`, `DELETE /api/tasks/:id` — are the
   endpoints the browser calls. They read `TASKS_API_KEY` from server
   environment and are the caller that presents it to the upstream. They
   pass the upstream's status and body through unchanged. The browser's
   request carries no key (`AC-API-3`).
2. **A simulated upstream** — `lib/server/upstream.ts`, an in-process module
   behind the `Upstream` interface in `types/api.ts` — is the third-party API
   the brief describes. It rejects a missing or wrong key with `401`
   (`AC-API-4`), enforces a fixed-window request allowance and responds `429`
   with a `Retry-After` header on exhaustion (`AC-API-5`), and injects latency
   and scripted failures from an injectable configuration — never
   `Math.random()` (`AC-API-10`).
3. Neither layer persists anything. `localStorage` remains the system of
   record, per the brief.

### Who presents the key (amendment, ARCH-03)

The original text of this record made the Route Handler the upstream: it
read the key and rejected requests that lacked it. But the only thing that
calls a Route Handler is the browser, and `AC-API-3` forbids the browser from
ever holding the key — so every request would have been a `401` by
construction, and the client's rule that "a `401` is a configuration error"
implied a caller that could never have been configured correctly. Nobody
walked one request across ADR-0001, this record, and ADR-0005 together.

The two-layer shape is the one the eCommerce analogy actually describes: the
Route Handler is the backend-for-frontend that holds the credential, and the
upstream is the inventory, tax or payment service that demands it. A `401`
now means what it means in production — the server's own environment is
misconfigured — and it surfaces to the browser as a distinct, non-retried
error, which is a better demonstration than a `401` that could never occur.

**Client** — a typed API module:

1. `fetch` with `AbortController` and a request timeout.
2. On `429`, wait at least `Retry-After`, then retry with exponential backoff
   and **full jitter** (`AC-API-6`).
3. Bounded retry budget. On exhaustion, surface a rate-limit-specific message —
   distinguishable from a generic failure — and roll back (`AC-API-7`,
   `AC-API-12`).
4. Never retry a `4xx` that is not `429`. A `401` is a configuration error;
   retrying it just makes the same mistake more often.

**Optimistic layer** — in the reducer, not the component. Every task carries a
sync state of `confirmed`, `syncing`, or `failed` (*ARCH-03: was `pending`,
which collided with the `Filter` value of the same name*). The server echoes
the client-generated `id` and `createdAt`, so reconciliation is by identity
and never reorders the row (`AC-API-8`). The sync state is runtime-only and
is not persisted; every hydrated task is `confirmed`. Add and delete apply
immediately, reconcile on success, and restore prior state on final failure
(`AC-API-8`, `AC-API-9`).

## Build vs. buy

**The most defensible "buy" available here is TanStack Query, and it is being
declined deliberately.**

TanStack Query would provide optimistic updates with rollback, retry with
backoff, request deduplication, and in-flight state — most of `AC-API-6`
through `AC-API-11` — in configuration rather than code. On a production
Aritzia feature it is what I would reach for, and the reasoning is not close.

Two reasons it loses here:

1. **The mechanism is the deliverable.** The brief asks to *demonstrate*
   handling of a keyed, rate-limited API. Delegating that to a library
   demonstrates knowing the library exists. The retry, the jitter, and the
   rollback are the engineering being assessed, and they are roughly 100 lines.
2. **It sits adjacent to the brief's "no full-fledged store" constraint.**
   TanStack Query is a server-cache, not a client store, so it is arguably
   permitted — but it does own a normalised cache, and defending that reading
   costs more than writing the retry does.

**Where that flips, concretely:** the moment there is a second consumer of the
same server data, a need for background refetch or window-focus revalidation,
or pagination. At that point hand-rolled fetching becomes a liability and the
purchase is obviously correct. This is a two-endpoint app, and it is below the
line.

**Bought without hesitation:** Next's Route Handlers (see
[ADR-0001](0001-app-router.md)) and Zod for request and schema validation —
hand-rolled validators are a well-known source of quiet bugs, and the same
schemas serve the persistence layer in [ADR-0002](0002-state-management.md).

## Why full jitter, and why it is the eCommerce point

Exponential backoff alone does not solve the problem it appears to solve. If
every client that gets a `429` waits the same computed interval, they all
retry at the same instant, and the retry wave has the same shape as the spike
that caused the limit. Backoff without jitter reschedules a thundering herd; it
does not disperse it.

Full jitter — sleeping a random duration in `[0, backoff]` — spreads the
retries across the window.

This is not academic for a retailer. A product drop is a synchronised demand
spike by design: everyone arrives in the same few seconds because they were
told to. Any downstream call — inventory, tax, payment authorisation, an ESP —
that rate-limits under that spike will produce a synchronised wall of 429s,
and an unjittered client turns one spike into several. Getting this right on a
to-do app is rehearsal for the launch that actually matters.

## Consequences

**Good.** Every clause of the brief's sentence becomes observable and testable.
`AC-API-3` — the key never reaching the client — is asserted against real build
output rather than promised. The simulation is honest: it is a network call
that can genuinely fail.

**Bad.** More moving parts than a `setTimeout`, and the retry path needs fake
timers to test without slow tests. The in-memory rate-limit counter resets on
serverless cold start, so the deployed demo's limiter is best-effort — stated
plainly rather than hidden. A production limiter belongs in shared storage
(Redis) or at the edge.

**Rejected: fail randomly for realism.** It reads well in a demo and makes the
Jest requirement unsatisfiable without flakes. Deterministic injection, with a
documented default profile for the live demo, gives both (`AM-3`).

## Alternatives considered

**`setTimeout` in the client, resolving a promise.** The minimum reading of
"simulate." Rejected: it cannot demonstrate server-side key handling or a real
`429`, both of which the same sentence explicitly raises.

**The Route Handler as the upstream itself, with no second layer.** The
original decision here, and the one ARCH-03 amended: it leaves nothing that
can legitimately present the key. See *Who presents the key* above.

**Mock Service Worker as the simulation itself.** Excellent in tests, and MSW
is used there ([ADR-0006](0006-test-strategy.md)). Rejected as the production
simulation because the key would then live in client-intercepted code, which
inverts the point.

**Token bucket instead of fixed window.** More accurate, and the right
production choice for bursty retail traffic — a bucket absorbs a legitimate
burst that a fixed window rejects at a boundary. Fixed window chosen for
legibility in a reviewed codebase; the trade-off is recorded rather than
silently taken.
