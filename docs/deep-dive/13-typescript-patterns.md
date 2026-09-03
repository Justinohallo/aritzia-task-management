# 13 · TypeScript patterns

> **In one paragraph.** Strict mode, no `any`, no `@ts-ignore`, and a small
> set of patterns used consistently: discriminated unions for every result
> and action, a `never` branch that makes a `switch` exhaustive, an `Exact`
> type that fails compilation when two shapes drift, types derived from Zod
> schemas rather than declared beside them, type predicates for narrowing
> untrusted input, and `as const satisfies` for tuples that are both values
> and types. This page collects them so a reviewer can name what they see.

## The concept: make illegal states unrepresentable, and make drift a compile error

Types are cheapest when they *prevent* a class of bug rather than document
it. Two principles run through this codebase:

1. **Model outcomes as unions, not as fields that might be set.** A result
   is `{ ok: true; value } | { ok: false; errors }`, never
   `{ ok: boolean; value?: T; errors?: E }`. The second allows
   `{ ok: true, errors: [...] }`; the first does not, and narrowing on `ok`
   gives the compiler the field it needs.
2. **When two things must agree, make the compiler check it.** The reducer's
   cases and the action union; the request schema and the wire type; the
   persisted schema and the domain type. Each pair has a one-line check that
   stops the build if they diverge.

## The patterns

### Discriminated unions with a literal tag

```ts
// lib/tasks/actions.ts
export type TaskAction =
  | { type: "hydrate"; tasks: Task[] }
  | { type: "add/confirm"; id: TaskId; task: ApiTask }
  | …;

// lib/tasks/validation.ts
export type TaskValidation = { ok: true; value: ValidTaskInput } | { ok: false; errors: TaskFieldErrors };

// lib/tasks/mutations.ts
export type MutationResult = { ok: true } | { ok: false; failure: MutationFailure };

// types/api.ts
export type UpstreamResult<T> = { ok: true; status: 200 | 201; body: T } | { ok: false; status: UpstreamErrorStatus; body: ApiErrorBody; retryAfterSeconds?: number };

// lib/api/config.ts
export type ScriptedOutcome = { kind: "ok" } | { kind: "rate_limited"; retryAfterSeconds: number } | { kind: "error"; status: 500 | 503 };
```

A check on the tag (`if (!result.ok)`, `switch (action.type)`,
`scripted?.kind === "error"`) narrows the whole object. Inside the branch the
compiler knows exactly which fields exist. `status: 200 | 201` on the
success branch and `UpstreamErrorStatus` on the failure branch mean a
handler cannot return a `429` with `ok: true`.

### Exhaustive `switch` with `never`

```ts
// lib/tasks/reducer.ts
default: {
  const unhandled: never = action;
  throw new Error(`Unhandled task action: ${JSON.stringify(unhandled)}`);
}
```

After every `case`, the type of `action` in `default` is whatever members
remain. If every member is handled, that is `never`, and assigning it to a
`never` variable compiles. Add a member to `TaskAction` without a case, and
`action` in `default` is that member, which is not assignable to `never`:
compile error, pointing at the reducer. The `throw` is for runtime (a
malformed action from a test), and `JSON.stringify(unhandled)` is allowed
because `never` is assignable to anything.

### The `Exact` check: two shapes that must not drift

```ts
// lib/tasks/schema.ts
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const persistedTaskMatchesDomain: Exact<PersistedTask, Omit<Task, "sync">> = true;
void persistedTaskMatchesDomain;

// lib/server/handlers.ts
const requestMatchesContract: Exact<z.infer<typeof createTaskRequestSchema>, CreateTaskRequest> = true;
void requestMatchesContract;
```

`Exact<A, B>` is `true` only if `A` is assignable to `B` *and* `B` to `A`,
which for object types means the same keys with the same types. The tuple
wrapping `[A] extends [B]` stops TypeScript distributing over unions.
Assigning `true` to a variable of that type compiles only when the shapes
match; otherwise the type is `never` and `true` is not assignable. `void x`
marks the variable as used so lint does not complain, and the whole thing
erases at build.

Why it matters: `types/task.ts` is a frozen contract. `lib/tasks/schema.ts`
is a Zod schema that *should* describe the same shape. Without the check, a
field added to one and not the other is a runtime surprise (a task that
validates but is missing a property, or vice versa). With it, the build
fails on the line that says why.

### Types derived from schemas, not declared beside them

```ts
export const persistedTaskSchema = z.object({ id: taskIdSchema, title: taskTitleSchema, … });
export type PersistedTask = z.infer<typeof persistedTaskSchema>;

export const authRecordSchema = z.object({ version: z.literal(1), username: z.string().min(1), authenticatedAt: z.iso.datetime() });
export type AuthRecord = z.infer<typeof authRecordSchema>;
```

`z.infer` produces the static type from the runtime validator, so there is
one definition and the two cannot disagree. The pattern is: *validate at the
boundary with the schema, then carry the inferred type inside.* Everything
that comes from `localStorage`, `sessionStorage`, a request body or a URL
parameter is `unknown` until a schema or a predicate says otherwise.

### Type predicates for untrusted input

```ts
// types/task.ts
export const FILTERS = ["all", "pending", "completed"] as const satisfies readonly Filter[];
export function isFilter(value: string | null | undefined): value is Filter {
  return (FILTERS as readonly string[]).includes(value ?? "");
}

// lib/api/client.ts
function isApiErrorBody(value: unknown): value is ApiErrorBody { … }
```

A function returning `value is T` is a *type guard*: in the `true` branch
the compiler treats `value` as `T`. `isFilter` narrows a query-string value
to the `Filter` union; `isApiErrorBody` narrows a parsed JSON body. Both
take the widest honest input type (`string | null | undefined`, `unknown`)
so the caller never has to lie about what it has.

### `as const satisfies`

`["all", "pending", "completed"] as const` is a readonly tuple of literals,
usable as a value (to render the filter buttons) and as a type source.
`satisfies readonly Filter[]` checks it against the `Filter` union without
*widening* it to `Filter[]`, so adding `"archived"` to the tuple without
adding it to `Filter` is an error, and removing one from the tuple leaves a
`Filter` member with no button, which `isFilter`'s tests catch.

### `readonly` state and `ReadonlySet`

```ts
export type TasksState = readonly Task[];
export const PERSISTING_ACTIONS: ReadonlySet<TaskActionType> = new Set([…]);
```

`readonly Task[]` has no `push`, `splice` or in-place `sort`, so a reducer
case that tries to mutate state does not compile. `sortTasks` copies first
(`[...tasks].sort(…)`) for the same reason. The cost is zero at runtime.

### Result-returning adapters instead of throwing

```ts
export function writeTasks(tasks, storage): boolean { … }
export function readTasks(storage): Task[] { … }        // never throws
export function login(credentials): LoginResult { … }   // never throws
```

Storage and auth adapters return `boolean` or a union rather than throwing,
and their doc comments say "never throws". The type system cannot express
"does not throw", so the convention is enforced by the adapters catching
everything at the boundary and by tests feeding them every failure they can
think of. The payoff is that callers have no `try` blocks and no forgotten
ones.

### Injected dependencies with production defaults

```ts
export function readApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined
export function readTasks(storage: Storage | undefined = defaultStorage()): Task[]
export function isOverdue(dueDate: string, today: string = localToday()): boolean
export function createApiClient(options: ApiClientOptions = {}): ApiClient
```

The last parameter is the impure thing (environment, storage, the clock,
`fetch`), defaulted to the real one. Production calls with no argument; a
test passes a stub. It is the same idea as dependency injection with none
of the machinery, and it is why almost nothing in the suite mocks a global
([page 12](12-testing.md)).

### Class hierarchies where `instanceof` is the contract

```ts
export class ApiClientError extends Error {
  constructor(message: string) { super(message); this.name = new.target.name; }
}
export class RateLimitedError extends ApiClientError { readonly status = 429 as const; … }
```

The error classes are the one place the codebase uses classes, and for a
reason: `instanceof` is the only narrowing that survives `catch (error:
unknown)`. `new.target.name` sets `name` to the *subclass* name from the
base constructor. `429 as const` makes `status` a literal type so a check
on it narrows too.

### `Readonly<{ children: React.ReactNode }>` and `React.ComponentProps<"button">`

Layouts take `Readonly<{ children }>` (Next's convention). Primitives take
`React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>`, so
every native attribute is accepted and every variant is typed, with no
hand-written prop interface to drift from the element.

## Strictness, enforced

`tsconfig.json` has `strict: true`. ESLint (`eslint.config.mjs`) sets
`@typescript-eslint/no-explicit-any` to `error` (`AC-QUAL-1`) and
`ban-ts-comment` to forbid `@ts-ignore` and `@ts-nocheck` while allowing
`@ts-expect-error` *only with a description of at least ten characters*
(`AC-QUAL-2`). `@ts-expect-error` is preferred because it fails when the
error it suppresses goes away, so a stale suppression cannot linger.
`test/quality/typescript.test.ts` reads the resolved ESLint config and the
source tree to assert all of this holds, so the rule is a test rather than a
convention.

## What to discuss

**"Why Zod for runtime types when TypeScript already has types?"**
TypeScript's types are erased at build. Anything that crosses a boundary at
runtime (storage, network, the URL) arrives as `unknown` and must be
checked by code that runs. Zod is that code, and `z.infer` ties the two
worlds together.

**"Isn't `Exact` a trick?"** It is a well-known idiom, and it is three lines
that turn a documentation claim ("these two shapes are the same") into a
compiler check. The alternative is a comment.

**"Where would you add branded types?"** `TaskId` is `string`. A branded
`string & { __brand: "TaskId" }` would stop a `username` being passed where
an id is expected. Not done because there are only two string ids in the
system and the schemas validate the UUID format at every boundary; it is the
next step if the type surface grows.

## Where to look

- Unions and the `never` branch: `lib/tasks/actions.ts`, `lib/tasks/reducer.ts`
- `Exact`: `lib/tasks/schema.ts`, `lib/server/handlers.ts`
- Schema-derived types: `lib/tasks/schema.ts`, `lib/auth/session.ts`
- Predicates and `satisfies`: `types/task.ts`, `lib/api/client.ts`
- Error classes: `lib/api/client.ts`
- Enforcement: `tsconfig.json`, `eslint.config.mjs`, `test/quality/typescript.test.ts` (`AC-QUAL-1..2`)
