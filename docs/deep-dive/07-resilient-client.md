# 07 · The resilient client

> **In one paragraph.** `lib/api/client.ts` is a typed `fetch` wrapper that
> knows three things: how to time out a request with an `AbortController`
> chained to the caller's own signal; how to turn every outcome into one of
> six error classes so the caller can `instanceof` its way to the right
> message; and how to retry a `429`, and only a `429`, by waiting at least
> `Retry-After` and then a jittered exponential backoff, within a bounded
> budget. The schedule itself is three pure functions in `lib/api/retry.ts`.
> Every source of non-determinism (the fetch, the sleep, the jitter draw) is
> injected, so a rate-limit test runs in milliseconds with a reproducible
> schedule.

## The concept: retry is a policy, and most policies are wrong

A retry policy answers four questions. Getting any one wrong makes the client
worse than one with no retry at all.

1. **What is retried?** Only failures that are *transient and safe to repeat*.
   A `429` says "not now"; a `503` might; a `400` says "you sent garbage" and
   a `401` says "you are not configured", and retrying either just repeats
   the mistake faster. This client retries `429` only, on purpose.
2. **How long to wait?** Long enough to help. If the server said how long
   (`Retry-After`), that is a floor, not a suggestion.
3. **How to spread the waits across many clients?** This is the one most
   implementations miss. If every client that got a `429` at the same instant
   waits the same computed interval, they all retry at the same instant, and
   the retry wave has the same shape as the spike that caused the limit.
   Backoff without jitter *reschedules* a thundering herd; it does not
   disperse it.
4. **When to stop?** A bounded budget, after which the failure is surfaced
   with enough information for the caller to say something useful.

## Exponential backoff with full jitter

Plain exponential backoff waits `base × 2^(n−1)` before retry *n*: 500 ms,
1 s, 2 s, 4 s. Capped at some maximum. Every client with the same config
computes the same sequence.

**Full jitter** replaces the wait with a uniform random draw in
`[0, base × 2^(n−1)]`. The *ceiling* still grows exponentially, so the average
wait still backs off, but two clients that were rate-limited together now
retry at different moments. Across a population, the retries spread across
the whole window instead of stacking at its end. The AWS Architecture Blog
post that popularised the comparison ("Exponential Backoff and Jitter",
2015) found full jitter gave the fewest total calls and the lowest completion
time of the variants tested, and it is the one this client uses.

```ts
// lib/api/retry.ts
export function backoffMs(attempt: number, config = DEFAULT_RETRY_CONFIG): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const ceiling = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** exponent);
  const draw = clamp01(config.random());
  return Math.round(draw * ceiling);
}
```

`config.random` is the injection point. Production passes `Math.random`;
a test passes `() => 0.5` or a fixed sequence, and the schedule is exact.
The draw is clamped to `[0, 1]` so a misbehaving source cannot produce a
negative wait or one above the ceiling.

### `Retry-After` is a floor, combined with `max`

```ts
export function retryDelayMs(attempt, retryAfterSeconds, config = DEFAULT_RETRY_CONFIG): number {
  const floor = retryAfterSeconds === undefined ? 0 : Math.max(0, retryAfterSeconds) * 1000;
  return Math.max(floor, backoffMs(attempt, config));
}
```

Two decisions in one line:

- The server's number is **never jittered below**. If it said 3 seconds, the
  client waits at least 3 seconds. A client that jitters *under* the floor
  is a client that ignores the server.
- The floor and the backoff are combined with **`max`, not `+`**. Adding them
  would mean a server asking for a long pause also inherits the client's
  full backoff on top; `max` means the client waits for whichever is longer
  and no more.

### Parsing `Retry-After` conservatively

```ts
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (header == null) return undefined;
  const trimmed = header.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? seconds : undefined;
}
```

HTTP allows `Retry-After` to be either a delay in seconds or an HTTP-date.
The contract in `types/api.ts` promises whole seconds, so the parser accepts
a non-negative decimal and nothing else. Anything unparseable yields
`undefined`, and the client falls back to backoff alone. The alternative,
treating garbage as `0`, would turn a malformed header into an immediate
retry, which is the worst possible reading of "not now".

### The budget

```ts
export function canRetry(attemptsMade: number, config = DEFAULT_RETRY_CONFIG): boolean {
  return attemptsMade < Math.max(1, Math.floor(config.maxAttempts));
}
```

`maxAttempts` counts the first request, so the default of `4` is one request
and at most three retries (`AC-API-7`). The `Math.max(1, …)` guard means a
misconfigured `0` still sends one request rather than none.

### A worked schedule

With the defaults (`baseDelayMs: 500`, `maxDelayMs: 8000`, `maxAttempts: 4`)
and a server that answers `429` with `Retry-After: 3` every time:

| Attempt | Outcome | Ceiling for next wait | Draw | Backoff | Floor | Wait |
|---|---|---|---|---|---|---|
| 1 | 429 | 500 ms | 0.4 | 200 ms | 3000 ms | **3000 ms** |
| 2 | 429 | 1000 ms | 0.9 | 900 ms | 3000 ms | **3000 ms** |
| 3 | 429 | 2000 ms | 0.7 | 1400 ms | 3000 ms | **3000 ms** |
| 4 | 429 | — | — | — | — | throw `RateLimitedError(3, 4)` |

With no `Retry-After` header, the same draws give waits of 200, 900 and
1400 ms: the floor is zero and the jittered backoff is the whole wait. With
`Retry-After: 1` and a draw of 0.95 on attempt 3, the wait is
`max(1000, 1900) = 1900` ms: the backoff has outgrown the floor.

## The client loop

```ts
// lib/api/client.ts (trimmed)
async function request<T>(path, init, requestOptions): Promise<T> {
  let attempts = 0;
  let lastRetryAfter: number | undefined;
  for (;;) {
    throwIfAborted(requestOptions.signal);
    attempts += 1;
    const response = await send(`${baseUrl}${path}`, init, requestOptions.signal);
    if (response.ok) return (await response.json()) as T;
    const body = await readErrorBody(response);
    if (response.status !== 429) throw new ApiError(response.status, body);
    lastRetryAfter = parseRetryAfter(response.headers.get("Retry-After")) ?? body?.error.retryAfterSeconds;
    if (!canRetry(attempts, config)) throw new RateLimitedError(lastRetryAfter, attempts);
    await sleep(retryDelayMs(attempts, lastRetryAfter, config));
  }
}
```

Read it as a state machine: send; on success return; on a non-`429` error
throw immediately; on `429` record the server's hint, check the budget,
sleep, loop. The header is preferred and the body's mirror is the fallback.
The caller's abort signal is checked at the top of every iteration so an
abort during a sleep is honoured on the next turn rather than sending one
more request.

### Timeouts with a chained `AbortController`

```ts
async function send(url, init, outer: AbortSignal | undefined): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs);
  const forward = () => controller.abort();
  outer?.addEventListener("abort", forward, { once: true });
  try {
    return await doFetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (timedOut) throw new TimeoutError(config.timeoutMs);
    if (outer?.aborted) throw new AbortedError();
    throw new NetworkError(cause);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", forward);
  }
}
```

`fetch` has no timeout option. The standard mechanism is an `AbortSignal`:
`fetch` rejects with an `AbortError` when the signal fires. Here one
controller per request is aborted by either of two sources, a timer or the
caller's own signal, which is *forwarded* into it. The three catch branches
tell the sources apart by their side effects: a `timedOut` flag set by the
timer, `outer.aborted` set by the caller, and anything else a genuine
network failure. `finally` clears the timer and unhooks the listener, so a
completed request leaves no dangling timer and no listener leak on a
long-lived caller signal.

This is the shape `AbortSignal.any()` standardises, written by hand because
the target runtime set at the time did not guarantee it.

### The error taxonomy

```ts
export class ApiClientError extends Error { constructor(m) { super(m); this.name = new.target.name; } }
export class ApiError        extends ApiClientError { status; code }              // 400, 401, 5xx — not retried
export class RateLimitedError extends ApiClientError { status = 429; retryAfterSeconds; attempts }  // budget spent
export class TimeoutError    extends ApiClientError { timeoutMs }
export class AbortedError    extends ApiClientError {}                           // the caller's signal
export class NetworkError    extends ApiClientError { cause }                    // fetch rejected
```

One class per outcome the mutation layer must tell apart. `instanceof` is
the contract: `describeFailure` in `lib/tasks/mutations.ts` checks
`error instanceof RateLimitedError` and nothing else, because that is the one
failure whose message should name rate limiting and say when to try again
(`AC-API-12`). Everything else is worded generically, since the client does
not claim to know why a `503` or a timeout happened.

`this.name = new.target.name` sets each subclass's `name` to its own class
name without repeating it in every constructor, so a logged error reads
`RateLimitedError: Rate limited after 4 attempts; retry after 3s`.

### Reading an error body without trusting it

```ts
async function readErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    const parsed: unknown = await response.json();
    if (isApiErrorBody(parsed)) return parsed;
  } catch { /* not JSON: the status alone is reported */ }
  return undefined;
}
```

A `429` from a proxy or a CDN may carry an HTML body. The client parses as
`unknown`, narrows with a type predicate, and treats anything that is not the
contract's shape as "no body". The status is still acted on; only the
optional `code` and `retryAfterSeconds` are missing.

### Injection

```ts
export interface ApiClientOptions {
  fetch?: FetchLike;              // default: the global fetch, looked up per call so MSW can intercept
  retry?: Partial<RetryConfig>;   // merged onto DEFAULT_RETRY_CONFIG; includes `random`
  sleep?: (ms: number) => Promise<void>;  // default: real setTimeout
  baseUrl?: string;
}
export const apiClient: ApiClient = createApiClient();   // the production instance
```

The default `fetch` is `(input, init) => fetch(input, init)`, a *lookup per
call* rather than a captured reference, so that MSW, which patches the
global, intercepts it. Tests construct `createApiClient({ sleep: recordAndResolve,
retry: { random: () => 0.5 } })` and assert the recorded delays exactly,
with no fake timers and no waiting (`AC-API-10`).

## The decisions inside

**Why not retry `503`?** In the simulation a `5xx` is a *scripted* failure,
put there so the generic-error path can be demonstrated (`AC-API-12`).
Retrying it would hide the path the script exists to show. In production the
answer depends on idempotency: a `POST` that may have been applied is not
safe to repeat without an idempotency key. Since this contract has one
(the client-generated `id`), retrying `503` would be defensible there, and
the loop's `if (status !== 429)` is the one line to change.

**Why is the budget in attempts and not in elapsed time?** Legibility. "One
request and three retries" is a sentence; "until 20 seconds have passed" is
a sentence too, but it interacts with `Retry-After` in ways that need a
second paragraph. `maxDelayMs` caps any single wait at 8 s, so the worst
case is bounded either way.

**Why does the client roll nothing back?** Separation. This module knows
about HTTP; `lib/tasks/mutations.ts` knows about the reducer. The client's
whole output is a resolved response or a thrown error of a known class, and
that is a boundary a test can stand on from either side.

## What to discuss

**"Why does jitter matter for a to-do app?"** It does not, for one user. It
matters for the launch. A product drop is a synchronised demand spike by
design, and any downstream call that rate-limits under it produces a wall of
`429`s at once. An unjittered client turns one spike into several; a jittered
one spreads them. Getting it right here is rehearsal for the case where it
counts ([ADR-0004](../adr/0004-api-simulation.md), "Why full jitter").

**"Why not TanStack Query? It does all of this."** It does, and it would be
the reach in production. Declined here because the retry, the jitter and the
rollback *are* the engineering being assessed, and they are about a hundred
lines. The line where the purchase flips is named: a second consumer of the
same data, background refetch, or pagination.

**"What does the user see during the three retries?"** The optimistic row
with a "Saving…" badge and the disabled submit button (`AC-API-11`), and the
live region has announced "Adding…". Nine seconds is a long time to show
that; the deployed `Retry-After: 3` was chosen so a reviewer can *see* the
retry path, not for the best user experience.

## Where to look

- Pure schedule: `lib/api/retry.ts`
- Client, timeout, error classes: `lib/api/client.ts`
- Defaults: `lib/api/config.ts` (`DEFAULT_RETRY_CONFIG`)
- Tests: `test/api/retry.test.ts` (schedule math, `AC-API-6`, `AC-API-7`), `test/api/client.test.ts` (loop, timeout, abort, error classes, `AC-API-10`, `AC-API-12`)
