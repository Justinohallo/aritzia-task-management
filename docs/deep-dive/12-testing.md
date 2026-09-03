# 12 · Testing

> **In one paragraph.** Tests are organised around acceptance criteria, not
> files: every test name carries the ID it proves, and a test in the suite
> asserts that every criterion is named somewhere. Four layers, unequal by
> design: pure logic (reducer, retry maths, validation) tested exhaustively
> as functions; component behaviour through React Testing Library by role and
> label; the network boundary through MSW, so the real `fetch` path runs; and
> accessibility through axe. Non-determinism is injected everywhere, so a
> three-retry rate-limit scenario runs in milliseconds with an exact schedule.
> One test proves an absence: it searches the production bundle for the key.

## The concept: test the behaviour the brief asks for, at the cheapest layer that can prove it

A suite that renders each component and snapshots it satisfies "write unit
tests" and proves nothing: a snapshot asserts that the output is what it was
last time. [ADR-0006](../adr/0006-test-strategy.md) inverts the question.
With 79 criteria and a two-day budget, the criteria are the unit of test
design, and each is proven at the lowest layer that can prove it: the
reducer's rollback ordering does not need a DOM, so it has none; the `429`
retry path needs the real `fetch` to be meaningful, so it gets MSW rather
than a mocked module.

The testing pyramid, applied: many fast pure tests, fewer component tests,
a handful at the network boundary, one against the build output, and a
recorded manual procedure for the seven criteria no Jest test can prove.

## How it is built here

### The runner

```js
// jest.config.mjs (trimmed)
testEnvironment: "jest-fixed-jsdom",
setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
testPathIgnorePatterns: [… "<rootDir>/test/bundle/"],
collectCoverage: !FILTERED_RUN,
coverageThreshold: { "./lib/tasks/": { statements: 80 }, "./lib/api/": { statements: 80 }, "./lib/tasks/validation.ts": { statements: 80 } },
```

Three configuration decisions with reasons:

**`jest-fixed-jsdom`.** Plain `jest-environment-jsdom` *removes* Node's
`fetch`, `Response`, `TextEncoder` and friends from the global scope. MSW
needs the real `fetch` to intercept. The fixed environment is jsdom with
those Node globals restored.

**ESM-only packages are transformed.** MSW depends on packages that ship only
ES modules, which Jest on Node 22 cannot `require()`. `next/jest` refuses to
let `transformIgnorePatterns` reach into `node_modules`, so the config
post-processes the resolved config to add them. The alternative, a
`transpilePackages` entry in `next.config.ts`, would leak a test-only concern
into the production build.

**Coverage thresholds on logic, not globally.** A global percentage mostly
measures how much markup exists. The 80% floor is on `lib/tasks/` and
`lib/api/`, where a missed branch is a missed rollback or retry case
(`AC-TEST-4`). The floor is *enforced by the runner*, so a full `npm test`
fails below it. A run narrowed to a path (`npm test -- test/tasks`) skips
collection, because the coverage of a subset says nothing about the whole.

### Setup: MSW is on for every test

```ts
// jest.setup.ts
import "@testing-library/jest-dom";
import { toHaveNoViolations } from "jest-axe";
import { server } from "@/test/msw/server";
expect.extend(toHaveNoViolations);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`onUnhandledRequest: "error"` means a request no handler matches *fails the
test* rather than logging a warning. A test that accidentally hits a real
network, or a typo in an endpoint path, is a bug, and it surfaces as one.
`resetHandlers` after each test returns to the defaults so a scripted
failure in one test cannot leak into the next.

### Layer 1: pure logic

| Module | Test | What it proves |
|---|---|---|
| `lib/tasks/reducer.ts` | `test/tasks/reducer.test.ts` | Every action's transition, immutability, idempotence under races, exhaustiveness |
| `lib/tasks/validation.ts` | `test/tasks/validation.test.ts` | Trimming, length bound, date validity, `isOverdue` on the boundary day |
| `lib/api/retry.ts` | `test/api/retry.test.ts` | Backoff ceilings, jitter clamping, `Retry-After` as a floor, the budget, parsing garbage |
| `lib/auth/credentials.ts` | `test/auth/credentials.test.ts` | The rule, trimming, the first-failing-field contract |
| `lib/tasks/storage.ts`, `lib/auth/session.ts` | `test/tasks/storage.test.ts`, `test/auth/session.test.ts` | Fail-safe parsing of every malformed input; the `.server.test.ts` variants import under `node` to prove no `window` is touched |
| `lib/tasks/mutations.ts` | `test/tasks/mutations.test.ts` | The exact dispatch sequence for success and each failure, with a stub client and a recording dispatch |

These are the majority of the suite and run in milliseconds. The reducer
tests are the ones a reviewer asking "how does your rollback work" should
read: they feed `add/optimistic`, then `add/rollback`, and assert the state
after each, with no React anywhere.

### Layer 2: component behaviour

React Testing Library with `user-event`, queried **by role and label, never
by test id or class**. `test/quality/test-sweep.test.ts` enforces it: a
component test that asserts on a class name or reaches into internal state
fails the sweep (`AC-TEST-2`). A snapshot as a component's *only* test fails
it too (`AC-TEST-3`).

```ts
// the shape of a component test
await user.type(screen.getByLabelText("Title"), "Buy milk");
await user.type(screen.getByLabelText("Due date"), "2026-09-10");
await user.click(screen.getByRole("button", { name: "Add task" }));
expect(screen.getByRole("checkbox", { name: "Buy milk" })).not.toBeChecked();
```

Querying by accessible role and name has a side effect that is the reason
for the rule: **a component that cannot be found by role and name is a
component a screen reader cannot find either.** The test strategy and the
accessibility strategy are the same strategy.

`next/navigation` is mocked at the module level with a `mockRouter`, so
`router.replace` and `router.push` are assertable and `useSearchParams` can
be fed a URL. The providers accept `storage` and `now` props so tests inject
in-memory storage and fixed clocks.

### Layer 3: the network boundary

```ts
// test/msw/handlers.ts (trimmed)
export function handlersFor(script: readonly ScriptedResponse[]): HttpHandler[] {
  const queue = [...script];
  const next = () => queue.shift() ?? ok();
  return [
    http.post("/api/tasks", async ({ request }) => { const s = next(); return s.status !== "ok" ? errorResponse(s) : created(await request.json()); }),
    http.delete("/api/tasks/:id", ({ params }) => { const s = next(); return s.status !== "ok" ? errorResponse(s) : deleted(String(params.id)); }),
  ];
}
export const handlers = handlersFor([]);   // the defaults: everything succeeds
```

Mock Service Worker intercepts `fetch` at the network layer. The client's
real request path runs: headers, JSON, status handling, the retry loop.
A test scripts the server:

```ts
server.use(...handlersFor([rateLimited(2), rateLimited(1), ok()]));
```

and the next three requests, across both endpoints, are a `429` with
`Retry-After: 2`, a `429` with `Retry-After: 1`, and a `201`. The scripted
handler mirrors the upstream's echo semantics exactly (same `id`, same
`createdAt`), so the optimistic reconcile is tested against the contract.

The alternative, `jest.mock("@/lib/api/client")`, is free and tests the
wrong thing: it asserts that a function you wrote was called with arguments
you chose, and passes while the real request path is broken. MSW was about
twenty minutes of setup that repaid itself on the first `429` test.

### Injected time and randomness (`AC-API-10`)

A rate-limit test through the real client would sleep for `Retry-After`
seconds. Instead of fake timers, the test injects a client:

```ts
const fastClient = createApiClient({
  sleep: async (ms) => { delays.push(ms); },   // records, resolves at once
  retry: { random: () => 0.5 },               // fixed jitter draw
});
render(<ApiClientContext.Provider value={fastClient}><TasksPage /></ApiClientContext.Provider>);
```

The scenario runs in milliseconds and the recorded `delays` are asserted
exactly: `[2000, 1000]` for the script above (the `Retry-After` floors,
which exceed the jittered backoff at a draw of 0.5). On the server side the
upstream's clock, latency and failures are equally injected
([page 06](06-api-simulation.md)), so `test/api/upstream.test.ts` advances a
fake clock past the window and asserts the reset.

The general rule: **every source of non-determinism is a parameter with a
production default.** `fetch`, `sleep`, `random`, `now`, `storage`. A test
that has to fake a global is a test that will one day flake.

### Layer 4: accessibility

`test/a11y.test.tsx` renders the login page and the tasks page inside the
protected layout, runs `axe` on each, and asserts no violations
(`AC-A11Y-6`). The same file tests focus management after row removal and
carries the recorded manual keyboard walk for `AC-A11Y-4`
([page 10](10-accessibility.md)).

### Tests over the source tree

A category worth naming because it is unusual. Several tests do not
exercise code; they read the repository and assert properties of it:

| Test | Asserts |
|---|---|
| `test/quality/test-sweep.test.ts` | `ACCEPTANCE.md` defines 79 criteria; every one outside the manual seven is named in an `it`/`describe`; no test names a phantom ID; component tests use accessible queries; no snapshot-only file; the coverage floor is in the config (`AC-TEST-1..4`) |
| `test/quality/typescript.test.ts` | `strict` is on; no `any` in app source; every `@ts-expect-error` has a description; ESLint's resolved config enforces both (`AC-QUAL-1..2`) |
| `test/quality/component-boundary.test.ts` | No primitive imports the domain; no native control rendered outside the primitives (`AC-UI-5..6`) |
| `test/quality/ci.test.ts` | The workflow triggers on every PR with no branch filter, runs the five steps in order, and gives the build a dummy key never a secret (`AC-CI-1`) |
| `test/api/secret-boundary.test.ts` | Exactly one source file names `TASKS_API_KEY`; it reads `process.env` and never `NEXT_PUBLIC_`; nothing outside the server lane imports `lib/server` (`AC-API-3`) |

These turn conventions into failing tests. "Tests name their criterion" is
a convention that decays; a test that greps for it does not.

### The bundle test: proving an absence (`AC-API-3`)

```ts
// test/bundle/no-secret-in-bundle.test.ts (trimmed)
it("AC-API-3: no client chunk contains the key's value", () => {
  const value = process.env.TASKS_API_KEY;
  expect({ keyPresentInEnvironment: Boolean(value) }).toEqual({ keyPresentInEnvironment: true });
  const hits = builtChunks().filter((f) => readFileSync(f, "utf8").includes(value));
  expect(hits).toEqual([]);
});
```

Every other test proves something happens. This one proves something does
*not*: the key's variable name and its *value* appear in no file under
`.next/static/`. It runs under a second config, `jest.bundle.config.mjs`,
after `next build`, in the `node` environment. It **fails rather than
skips** when there is no build or no key in the environment, because a
vacuous pass would be worse than no test. CI sets a dummy value for both the
build and the test so there is something to search for; locally:

```bash
TASKS_API_KEY=any-value npm run build && TASKS_API_KEY=any-value npm run test:bundle
```

### The seven manual criteria

`AC-UI-1..4` (jsdom does not lay out), `AC-A11Y-4` (focus visibility is a
judgement), `AC-CI-2` (a GitHub setting), `AC-DEP-1` (a phone). Each is `◉`
only with a procedure and a date beside it in `ACCEPTANCE.md`, and the sweep
test excuses exactly those seven and no others. Claiming responsive coverage
from jsdom would be a false assurance, which is worse than an acknowledged
manual check.

## The decisions inside

**Jest over Vitest.** The brief names Jest. Vitest would be faster and need
less configuration against a modern Next app. Named, so used; the cost
(the ESM transform dance above) is recorded rather than quietly overridden.

**Two Jest configs.** The bundle test needs a production build and takes
minutes; `npm test` should take seconds. Separating them keeps the local
loop fast and makes the bundle test's precondition explicit.

**A render helper was built, not bought.** Twenty lines wrapping the
providers, the router mock and the API-client context. Repeating provider
setup per file is the main way a suite becomes unmaintainable.

**Playwright is not in P1.** `AC-DEP-1`'s full path in a real browser
against the real deployment is what E2E adds; a manual dry-run covers it for
this submission. The pre-installed Chromium is driven for the responsive
check over the DevTools protocol without adding the dependency.

## What to discuss

**"How do you know the tests test anything?"** Three ways. The reducer and
retry tests assert exact states and exact delays, not "was called". The MSW
tests run the real client. And the sweep test fails if a criterion has no
named test or if a component test asserts on implementation details. What
it cannot catch is a test that names an ID and asserts something trivial;
that is a review concern, and `ACCEPTANCE.md` names the test beside each
mark so a reviewer can go and read it.

**"Why is line coverage not the headline number?"** Because it measures how
much code ran, not what was asserted about it. Criterion coverage, "every
line of the brief has a named test", is auditable in a way a percentage is
not. The percentage floor exists on the logic modules as a tripwire.

**"What would you test with more time?"** Playwright for the full path on
the deployed URL; property-based tests on the reducer (any sequence of
actions leaves a list with unique ids); a contract test that runs the MSW
handlers and the real upstream against the same script and asserts they
agree.

## Where to look

- Configs: `jest.config.mjs`, `jest.bundle.config.mjs`, `jest.setup.ts`
- Network double: `test/msw/handlers.ts`, `test/msw/server.ts`, `test/msw/handlers.test.ts`
- Pure: `test/tasks/reducer.test.ts`, `test/api/retry.test.ts`, `test/tasks/validation.test.ts`, `test/tasks/mutations.test.ts`
- Components: `test/tasks/task-form.test.tsx`, `test/tasks/task-list.test.tsx`, `test/auth/login-page.test.tsx`, `test/tasks-page.test.tsx`
- Boundary: `test/tasks/optimistic.test.tsx`, `test/api/client.test.ts`, `test/api/handlers.test.ts`, `test/api/upstream.test.ts`
- Quality and bundle: `test/quality/*`, `test/bundle/no-secret-in-bundle.test.ts`
