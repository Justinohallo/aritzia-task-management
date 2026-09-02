# 06 · The API simulation

> **In one paragraph.** Two server-only layers stand in for "an API that
> requires a private key and may rate-limit". The **Route Handlers** are the
> endpoints the browser calls; they validate the request, read the key from
> server environment, present it to the upstream, and pass the upstream's
> status, body and `Retry-After` through unchanged. The **upstream** is an
> in-process module behind the `Upstream` interface: it checks the key in
> constant time, consumes a scripted outcome if one is queued, spends one unit
> of a fixed-window allowance, and answers. Nothing is persisted. Every source
> of non-determinism (clock, latency, failures) is injected, so a test gets the
> same answer every run.

## The concept: the backend-for-frontend and the credential it holds

A browser cannot hold a secret. Anything in the client bundle, in
`localStorage`, or in a `NEXT_PUBLIC_` variable is readable by every visitor.
So when a browser-facing app must call a third-party API that demands a key,
the key lives on a server the app controls, and the browser calls *that*
server instead. The pattern is called a backend-for-frontend (BFF), and Next's
Route Handlers are a BFF you get for free with the framework.

The upstream in a real system would be an inventory service, a tax engine, a
payment gateway or an email provider. Here it is a module, because the brief
says *simulate*, but the seam between the BFF and the upstream is the real
one: an interface in `types/api.ts`, credentials passed explicitly, and
results that carry an HTTP status. Swapping the module for a `fetch` to a real
service would change one file.

[ADR-0004](../adr/0004-api-simulation.md) records an amendment worth knowing:
the original design had the Route Handler *be* the upstream, reading the key
and rejecting requests that lacked it. But the only caller of a Route Handler
is the browser, which must never hold the key, so every request would have
been a `401`. The two-layer shape is the fix, and it is the shape the
eCommerce analogy describes.

## How it is built here

### The contract

```ts
// types/api.ts (trimmed)
//   browser ──fetch──▶ Route Handler (holds the key) ──call──▶ Upstream (demands it)

export interface CreateTaskRequest  { id: TaskId; title: string; dueDate: string; createdAt: string; }
export interface CreateTaskResponse { task: ApiTask; }      // 201; echoes id and createdAt
export interface DeleteTaskResponse { id: TaskId; }         // 200; echoes id

export type ApiErrorCode = "invalid_request" | "unauthorized" | "rate_limited" | "upstream_error";
export interface ApiErrorBody { error: { code: ApiErrorCode; message: string; retryAfterSeconds?: number } }

export interface UpstreamCredentials { apiKey: string | undefined }
export type UpstreamResult<T> = { ok: true; status: 200 | 201; body: T }
                              | { ok: false; status: 401 | 429 | 500 | 503; body: ApiErrorBody; retryAfterSeconds?: number };

export interface Upstream {
  createTask(request: CreateTaskRequest, credentials: UpstreamCredentials): Promise<UpstreamResult<CreateTaskResponse>>;
  deleteTask(id: TaskId, credentials: UpstreamCredentials): Promise<UpstreamResult<DeleteTaskResponse>>;
}
```

Two contract decisions carry the optimistic layer ([page 08](08-optimistic-mutations.md)):

- **The client generates `id` and `createdAt`; the server echoes them.** The
  server assigns nothing. So the optimistic row and the confirmed row have
  the same identity and the same sort key, and reconciliation is a map by
  `id` that never remounts or reorders (`AC-API-8`).
- **`completed` is not on the wire.** A new task is always incomplete, and
  completion is a local toggle the API is never told about.

The error body mirrors `Retry-After` as `retryAfterSeconds` so a client that
cannot read headers still has it, and the status set is closed:
`400` is the handler's own, `401 | 429 | 500 | 503` are the upstream's.

### The Route Handlers

```ts
// lib/server/handlers.ts (trimmed)
export const createTaskRequestSchema = z.object({
  id: taskIdSchema, title: taskTitleSchema, dueDate: dueDateSchema, createdAt: isoTimestampSchema,
});

export function createTaskHandler(deps: HandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    let raw: unknown;
    try { raw = await request.json(); } catch { return invalidRequest("body: Expected a JSON object"); }
    const parsed = createTaskRequestSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(describeIssues(parsed.error));
    const result = await deps.upstream.createTask(parsed.data, { apiKey: deps.apiKey() });
    return passThrough(result);
  };
}

export const productionDeps: HandlerDeps = {
  get upstream() { return getUpstream(); },
  apiKey: readApiKey,
};
```

What each handler does, in order:

1. **Parse and validate the body** with a schema *composed from the frozen
   field schemas*, never restated. A malformed body is `400 invalid_request`
   and the upstream is not called (`AC-API-13`). The delete handler validates
   the `[id]` segment as a UUID the same way.
2. **Strip unknown keys.** `z.object` strips by default, so a browser that
   adds `apiKey: "…"` to the body sees it travel no further than this line.
   No header is consulted. The browser's request carries no key and none is
   read from it (`AC-API-3`).
3. **Read the key per request** from `deps.apiKey()`, which in production is
   `readApiKey` over `process.env`. Per request, not at module load, so a
   changed environment is seen without a restart and so nothing about the
   key is captured at build.
4. **Present it to the upstream** and **pass the result through unchanged**:
   the same status, the same body, and the `Retry-After` header when the
   upstream set `retryAfterSeconds` (`AC-API-4`, `AC-API-5`). Every response
   carries `Cache-Control: no-store`.

`productionDeps.upstream` is a getter so the shared instance is resolved
lazily on first request rather than at import. The `Exact<…>` check under
the schema makes the parsed body's type provably identical to
`CreateTaskRequest`; if either drifts the file stops compiling
([page 13](13-typescript-patterns.md)).

### The key reader

```ts
// lib/server/env.ts
export function readApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.TASKS_API_KEY;
  return value === undefined || value === "" ? undefined : value;
}
```

The only file in the source tree that names `TASKS_API_KEY`, and a test
asserts that ([page 14](14-ci-and-security.md)). An empty string counts as
absent: a blank value in a deploy's settings is a misconfiguration, and the
upstream should say so with a `401` rather than authenticate against `""`.

### The upstream

```ts
// lib/server/upstream.ts (trimmed)
export function createUpstream({ config, registeredKey, sleep = realSleep }: UpstreamOptions): Upstream {
  const window = fixedWindow(config.rateLimit, config.now ?? Date.now);
  const script = [...config.script];

  async function call<T>(credentials, status, body: () => T): Promise<UpstreamResult<T>> {
    if (config.latencyMs > 0) await sleep(config.latencyMs);          // 1. latency
    if (!authenticated(credentials)) return unauthorized();            // 2. key   → 401
    const scripted = script.shift();                                   // 3. script wins outright
    if (scripted?.kind === "rate_limited") return rateLimited(scripted.retryAfterSeconds);
    if (scripted?.kind === "error") return upstreamError(scripted.status);
    if (!window.take()) return rateLimited(config.rateLimit.retryAfterSeconds); // 4. window → 429
    return { ok: true, status, body: body() };                         // 5. success
  }
  …
}
```

The order is the specification, and each step has a reason:

1. **Latency first**, so a rejected request costs the same time as an
   accepted one. `0` under test; 400 ms in the deployed profile so the
   "Saving…" state is visible.
2. **Key check before anything else.** An unauthenticated request must not
   consume allowance or a scripted outcome; a real upstream would not
   count it either.
3. **A scripted outcome wins outright.** A scripted `429` ignores the window;
   a scripted `5xx` consumes no allowance. The script is how a test says
   "fail the next request this way" without racing a clock.
4. **The fixed window.** Below.
5. **Success echoes the request.** `201 { task }` on create, `200 { id }` on
   delete, with the client's `id` and `createdAt` unchanged.

#### Constant-time key comparison

```ts
function keysMatch(presented: string, registered: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(registered, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

`===` on strings returns as soon as it finds a differing byte, so the time it
takes leaks how many leading bytes matched. `crypto.timingSafeEqual` compares
every byte regardless. It throws on unequal lengths, hence the length check
first; a length mismatch is a mismatch, and the length of a key is not the
secret. Over a network the signal is buried in noise, but the habit is the
point: a key comparison uses the constant-time primitive, always.

#### The fixed window

```ts
function fixedWindow(limit: RateLimitConfig, now: () => number) {
  let openedAt: number | undefined;
  let used = 0;
  return {
    take(): boolean {
      const t = now();
      if (openedAt === undefined || t - openedAt >= limit.windowMs) { openedAt = t; used = 0; }
      if (used >= limit.maxRequests) return false;
      used += 1;
      return true;
    },
  };
}
```

A fixed window opens on its first request and resets `windowMs` later. The
deployed profile is **5 requests per 10 seconds, `Retry-After: 3`**
(`DEFAULT_SIMULATION_CONFIG` in `lib/api/config.ts`), chosen so a reviewer
can hit it by adding a handful of tasks quickly.

The known weakness of a fixed window is the boundary: 5 requests at
t=9.9 s and 5 more at t=10.1 s is 10 requests in 200 ms, all accepted. A
**token bucket** (tokens refill at a steady rate; each request spends one)
absorbs a legitimate burst and smooths the boundary, and is the production
choice for bursty retail traffic. Fixed window was chosen for *legibility in
a reviewed codebase*, and the trade-off is recorded rather than silently
taken ([ADR-0004](../adr/0004-api-simulation.md), alternatives).

The window lives in process memory. On serverless, each cold start is a new
process with a fresh window, so the deployed limiter is best-effort. A
production limiter belongs in shared storage (Redis, with an atomic
increment-and-expire) or at the edge, where it is also the DoS line.

#### The deployed instance

```ts
let instance: Upstream | undefined;
export function getUpstream(): Upstream {
  instance ??= createUpstream({ config: DEFAULT_SIMULATION_CONFIG, registeredKey: readApiKey });
  return instance;
}
```

One upstream per server process, so the window is shared across requests.
`registeredKey` is `readApiKey`, read on every call: in a simulation with
one deployment and one credential, the key the upstream "has registered" is
provisioned from the same environment the handler presents from. A server
whose environment lacks the key has, by the same token, no key registered
anywhere, and every request is a `401` until it is configured.

### Determinism: the config as the only source of randomness

```ts
// lib/api/config.ts
export interface SimulationConfig {
  latencyMs: number;
  rateLimit: { windowMs; maxRequests; retryAfterSeconds };
  script: readonly ScriptedOutcome[];   // consumed in order; then every request is ok
  now?: () => number;                   // injected clock; Date.now if absent
}
```

Nothing in the upstream calls `Math.random()`. A "fail randomly for realism"
design reads well in a demo and makes a Jest requirement unsatisfiable
without flakes (`A-5`, `AM-3`). Instead: latency is a number, failures are a
script, the clock is a function, and the sleep is injectable. A test builds
an upstream with `latencyMs: 0`, a fake clock it advances by hand, and a
script of `[{ kind: "rate_limited", retryAfterSeconds: 2 }, { kind: "ok" }]`,
and asserts the exact sequence (`AC-API-10`).

## The decisions inside

**Why pass the upstream's body through rather than reshape it?** Because
the client's error taxonomy ([page 07](07-resilient-client.md)) is keyed on
status and `code`, and a BFF that rewrites errors is a BFF that hides
information from the layer that needs it. The handler adds nothing and
removes nothing except an invalid request.

**Why `Cache-Control: no-store` on every response?** A `POST` is rarely
cached, but a `429` with a `Retry-After` header is exactly the kind of
response an intermediary might be tempted to serve again, and a `201` that
echoes a UUID must never be. Saying it explicitly costs one header.

**Why is `describeIssues` a joined string and not the Zod error object?**
The error body's `message` is "human-readable, safe to show", per the
contract. A `path: message; path: message` string satisfies that; a raw
Zod issue array would be a client-side parsing job and might include values
from the request.

**Why is the script an array consumed by `shift()`?** So a test's intent
reads as a sentence: "the next two requests are rate-limited, then it
works". Once the script is exhausted every request is `ok`, still subject to
the window, so a test never has to pad the script.

## What to discuss

**"The Route Handler is open. Anyone can spend your rate limit."** True,
and [page 05](05-authentication.md) says why: the brief's `sessionStorage`
session cannot reach the server. In production the handler checks a session
cookie before touching the credential. Here, the blast radius is the demo's
window.

**"What does a `401` mean here, if the browser never sends a key?"** That the
*server's own environment* is misconfigured. That is what `401` from a BFF's
upstream means in production too: the service account's credential is
missing, expired or wrong. The client does not retry it, because retrying
a configuration error just repeats it (`AC-API-4`).

**"Why simulate in-process rather than with MSW in the browser?"** MSW is
the test-time double ([page 12](12-testing.md)). As the *production*
simulation it would put the key in client-intercepted code, which inverts the
point. The in-process upstream keeps the key server-side and keeps the
network hop real.

**"How would this become a real upstream?"** Replace the body of
`createUpstream` with `fetch` calls carrying `Authorization: Bearer
${credentials.apiKey}`, map the response to `UpstreamResult`, keep the
interface. The handlers, the client and every test above the upstream's own
would be unchanged.

## Where to look

- Contract: `types/api.ts`
- Handlers: `lib/server/handlers.ts`; bindings `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`
- Key reader: `lib/server/env.ts`
- Upstream: `lib/server/upstream.ts`
- Config and the deployed profile: `lib/api/config.ts`
- Tests: `test/api/upstream.test.ts` (`AC-API-4`, `AC-API-5`, `AC-API-10`), `test/api/handlers.test.ts` (`AC-API-13`, pass-through, `Retry-After`), `test/api/secret-boundary.test.ts` and `test/bundle/no-secret-in-bundle.test.ts` (`AC-API-3`)
