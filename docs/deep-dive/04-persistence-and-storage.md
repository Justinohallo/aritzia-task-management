# 04 · Persistence and storage

> **In one paragraph.** Two Web Storage areas with two lifetimes: the task
> list in `localStorage`, which survives tabs and reloads, and the session in
> `sessionStorage`, which dies with the tab. Both are written as a versioned
> JSON envelope and read back through a Zod schema, so that anything on the
> user's disk from an older deploy, a hand edit, or a corrupt write is treated
> as untrusted input and fails safe rather than crashing the app on load.
> Both adapters resolve their storage lazily, never throw, and report a failed
> write instead of raising it.

## The concept: client-persisted state is untrusted input

Anything in a user's browser storage was written by *some past version* of
your application, or by the user, or by a browser extension. The current
version cannot assume its shape. Parsing it straight into state is the classic
way a persisted-state app ships a crash-on-load that no test catches: the
tests run against a clean store, and the bad data is already on ten thousand
machines when the bug is found. No rollback fixes it, because the data is not
on your servers.

The defence has three parts, all present here:

1. **A version field** in the envelope, so a future migration has something to switch on.
2. **Schema validation on read**, so a shape mismatch is a detected condition, not an exception.
3. **A fail-safe default** (empty list, signed out) so the app always loads.

The brief adds the fourth concept, which it calls *semi-persistent*: state
that outlives a reload but is not a server record, split across two storages
with different lifetimes so that the session and the data are decoupled
(`AC-AUTH-10`).

## Web Storage, briefly

| | `localStorage` | `sessionStorage` |
|---|---|---|
| Scope | Origin | Origin **and tab** |
| Survives reload | Yes | Yes |
| Survives closing the tab | Yes | No |
| Shared between tabs | Yes | No (a new tab starts empty) |
| Sent to the server | Never | Never |
| Readable by any script on the origin | Yes | Yes |
| Size | ~5 MB, synchronous | Same |

Both are synchronous string maps with `getItem`, `setItem`, `removeItem`.
Both can throw: Safari in private mode, a browser with storage disabled, or a
full quota all raise on access or on write. Neither is ever sent to the
server, which is the fact that shapes the whole auth design
([page 05](05-authentication.md)).

`AC-AUTH-5` asserts the tab-scoping of `sessionStorage` on purpose: it is the
one observable difference between the two mechanisms the brief specifies, and
the reason the choice is defensible.

## How it is built here

### The task envelope

```ts
// lib/tasks/schema.ts
export const STORAGE_KEY = "aritzia.tasks";
export const STORAGE_VERSION = 1;

export const persistedTaskSchema = z.object({
  id: taskIdSchema,            // z.uuid()
  title: taskTitleSchema,      // z.string().min(1).max(200)
  dueDate: dueDateSchema,      // z.iso.date()  — YYYY-MM-DD
  completed: z.boolean(),
  createdAt: isoTimestampSchema, // z.iso.datetime()
});

export const persistedEnvelopeSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  tasks: z.array(persistedTaskSchema),
});
```

What is stored:

```json
{ "version": 1, "tasks": [ { "id": "…", "title": "Buy milk", "dueDate": "2026-09-10", "completed": false, "createdAt": "2026-09-02T18:04:11.000Z" } ] }
```

What is **not** stored: `sync`. The runtime sync state is stripped on write
(`toPersistedTask`) and every hydrated task comes back `confirmed`
(`fromPersistedTask`). `localStorage` is the system of record: a task the
user added is their task, whether or not the confirming `201` ever arrived.
A stray `sync` key in old data is *stripped, not rejected*, because Zod's
`z.object` strips unknown keys by default.

`z.literal(STORAGE_VERSION)` is the migration hook. Bump the constant, and
every envelope written by the old version fails validation and reads as
empty. That is the safe default; the intended next step is to add a
`version: 0` branch to the adapter that migrates rather than discards. The
version field is what makes that possible instead of destructive.

### The adapter

```ts
// lib/tasks/storage.ts (trimmed)
function defaultStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}

export function parseStoredTasks(raw: string | null | undefined): Task[] {
  if (raw == null) return [];
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return []; }
  const result = persistedEnvelopeSchema.safeParse(json);
  if (!result.success) return [];
  return result.data.tasks.map(fromPersistedTask);
}

export function readTasks(storage = defaultStorage()): Task[] {
  if (!storage) return [];
  try { return parseStoredTasks(storage.getItem(STORAGE_KEY)); } catch { return []; }
}

export function writeTasks(tasks: readonly Task[], storage = defaultStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(toEnvelope(tasks))); return true; }
  catch { return false; }
}
```

Every line is a fail-safe decision:

- **`defaultStorage()` is called per invocation, inside a `try`.** Not at
  module load. Importing this file on the server is safe (`typeof window ===
  "undefined"`), and a browser that throws on `window.localStorage` access
  reads as "no storage" rather than crashing.
- **`parseStoredTasks` is exported separately from `readTasks`** so the
  fail-safe cases (bad JSON, wrong version, wrong shape, a task with an
  invalid date) can be tested as a pure function without a DOM. `test/tasks/storage.test.ts`
  feeds it strings; `test/tasks/storage.server.test.ts` runs under the `node`
  environment to prove the module imports cleanly with no `window`.
- **`safeParse`, not `parse`.** `parse` throws; `safeParse` returns a
  discriminated result. The adapter's contract is "never throws", so it uses
  the API that cannot.
- **`writeTasks` returns a boolean.** A full or disabled storage is
  reported, not thrown, because a failed persist must never take the
  in-memory list down with it. The provider currently ignores the return; the
  contract exists so a future "your changes may not be saved" notice has
  something to read.
- **Whole envelope or nothing.** One invalid task in the array fails the
  whole parse, and the list reads as empty. The alternative, keeping the
  valid ones, would silently drop data the user might have wanted to fix.
  Either choice is defensible; this one is the conservative one and it is
  the one `AC-STATE-5` names.

### The auth record

The same pattern, smaller, in `lib/auth/session.ts`:

```ts
export const AUTH_STORAGE_KEY = "aritzia.auth";
export const AUTH_STORAGE_VERSION = 1;
export const authRecordSchema = z.object({
  version: z.literal(AUTH_STORAGE_VERSION),
  username: z.string().min(1),
  authenticatedAt: z.iso.datetime(),
});
```

There is no `password` field in the schema, and unknown keys are stripped on
read, so *nothing this module can write or read* can carry a credential.
`AC-AUTH-9` tests that after a login no storage entry contains the password in
any form; the schema is why that test cannot fail.

`readSession` returns `null` rather than `[]` as its fail-safe: "not signed
in" is the safe default for an auth record for the same reason "empty list"
is for data. A mismatched version reads as signed out.

### When writes happen

The task provider writes after every persisting action and never after
hydration ([page 03](03-state-management.md)). The auth provider writes on
login and removes on logout; it never writes on read. Both providers accept a
`storage` prop so tests inject an in-memory `Storage` stub and assert exactly
what was written, without touching the real `window` storage or relying on
jsdom's implementation of it.

### Storage events between tabs

`localStorage` fires a `storage` event in *other* tabs when one tab writes.
This app does not listen for it. Two tabs editing the same list will last-write-win
on the next persisting action in each, and a reload shows whichever wrote
last. That is a known, accepted gap for a single-user demo. A production
guest-cart would either subscribe to the event or, more likely, reconcile
against a server on focus.

## The decisions inside

**Why Zod rather than a hand-written type guard?** Because hand-rolled
validators are where quiet bugs live, and because the same schemas serve
three consumers: the storage adapter, the form's validation and the Route
Handler's request validation ([ADR-0004](../adr/0004-api-simulation.md),
"bought without hesitation"). One definition of a valid task, with
`z.infer` producing the TypeScript type from it so the two cannot drift.

**Why a version literal rather than a version number with `>=`?** Because
the current code knows how to read exactly one shape. Accepting a *higher*
version (written by a newer deploy the user might have run in another tab)
would parse a shape this code has never seen. Literal equality is the honest
claim.

**Why are the keys namespaced (`aritzia.tasks`, `aritzia.auth`)?** Storage is
per-origin, and on a shared origin (a preview deployment, `localhost:3000`
across projects) a bare `tasks` key collides. The prefix costs nothing.

**Why is the due date a `YYYY-MM-DD` string and not a `Date` or a
timestamp?** Because a task due "Wednesday" is due all Wednesday, in the
user's timezone, and `Date` objects are instants. A bare date string parsed
with `new Date("2026-09-10")` is UTC midnight, which is the previous evening
west of Greenwich, and `JSON.stringify(date)` produces an instant. Storing the
calendar day as a string, comparing it lexically and formatting it from its
parts avoids the whole class of off-by-one-day bugs (`AM-12`;
[page 09](09-list-filter-ordering.md)).

## What to discuss

**"What happens to a user's data when you change the task shape?"** The
version bumps, the old envelope fails validation, the list reads as empty,
and *the old data is still on disk* because a fail-safe read never triggers
a write. The next step is a migration branch in `parseStoredTasks`. That is
the guest-cart problem: a catalog change must not empty carts across the
estate ([ADR-0002](../adr/0002-state-management.md), eCommerce mapping).

**"Is localStorage safe for this?"** For a to-do list, yes. It is readable
by any script on the origin, so it is the wrong place for anything secret,
which is the argument [page 05](05-authentication.md) makes about the session.
The task list was never secret.

**"Why not IndexedDB?"** Asynchronous, structured, larger. Right for
thousands of records or binary data; wrong for a list of strings the brief
says to put in `localStorage`.

## Where to look

- Schemas and the envelope: `lib/tasks/schema.ts`
- Task adapter: `lib/tasks/storage.ts`
- Auth record and adapter: `lib/auth/session.ts`
- Tests: `test/tasks/storage.test.ts` (fail-safe cases), `test/tasks/storage.server.test.ts` (server-safe import), `test/auth/session.test.ts`, `test/auth/session.server.test.ts`, `test/tasks/provider.test.tsx` (`AC-STATE-3..5`, `AC-AUTH-10`)
