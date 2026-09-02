# 08 · Optimistic mutations

> **In one paragraph.** An add appears in the list before the request is
> sent, marked `syncing`; a delete disappears before the request is sent. On
> success the add is reconciled in place by `id`; on final failure the add is
> removed and the delete's prior record is restored, in its original position,
> with the failure announced and shown. The whole sequence for each mutation is
> one function in `lib/tasks/mutations.ts` that takes its `dispatch`, `client`
> and `announce` as an argument, so the ordering is testable without rendering,
> and the components stay thin.

## The concept: optimistic UI is a bet with a rollback plan

A pessimistic UI waits for the server before changing what the user sees.
It is simple and honest, and on a 400 ms round trip it feels broken. An
optimistic UI applies the change immediately, on the assumption that the
server will agree, and undoes it if the server does not. The user gets
instant feedback; the engineering gets three new problems:

1. **Identity.** The optimistic record and the confirmed record must be the
   *same* record, or the row remounts and jumps when the server answers.
2. **Rollback.** Undoing an add is deleting the provisional row. Undoing a
   delete means *someone kept the deleted record*, and it must go back
   where it was.
3. **Visibility.** The user must be able to tell a provisional row from a
   confirmed one, and assistive technology must be told too.

A cart is the canonical example: add-to-cart must feel instant, and if the
inventory call fails the item must vanish with an explanation. This app's
version is the same shape with a to-do row.

## How it is built here

### Sync state on every task

```ts
// types/task.ts
export type SyncState = "confirmed" | "syncing" | "failed";
```

Runtime-only; never persisted ([page 04](04-persistence-and-storage.md)).
Named `syncing` rather than `pending` because `pending` already means
*not completed* in the filter and in the brief (`ARCH-03`).

### The sequences

```
createTask:  add/optimistic ─▶ POST ─┬─ 201 ─▶ add/confirm                       (AC-API-8)
                                     └─ fail ─▶ sync/set failed, add/rollback     (AC-API-7)
deleteTask:  remove/optimistic ─▶ DELETE ─┬─ 200 ─▶ (nothing to reconcile)
                                          └─ fail ─▶ remove/rollback              (AC-API-9)
```

```ts
// lib/tasks/mutations.ts (trimmed)
export async function createTask({ dispatch, client, announce }: MutationDeps, task: Task): Promise<MutationResult> {
  dispatch({ type: "add/optimistic", task });
  announce(`Adding "${task.title}"…`);
  try {
    const response = await client.createTask(toCreateRequest(task));
    dispatch({ type: "add/confirm", id: task.id, task: response.task });
    announce(`"${task.title}" added.`);
    return { ok: true };
  } catch (error) {
    const failure = describeFailure("add", task, error);
    dispatch({ type: "sync/set", id: task.id, sync: "failed" });
    dispatch({ type: "add/rollback", id: task.id });
    announce(failure.message, { assertive: true });
    return { ok: false, failure };
  }
}

export async function deleteTask({ dispatch, client, announce }: MutationDeps, task: Task): Promise<MutationResult> {
  dispatch({ type: "remove/optimistic", id: task.id });
  announce(`Deleting "${task.title}"…`);
  try {
    await client.deleteTask(task.id);
    announce(`"${task.title}" deleted.`);
    return { ok: true };
  } catch (error) {
    const failure = describeFailure("delete", task, error);
    dispatch({ type: "remove/rollback", task });   // the prior record, held here
    announce(failure.message, { assertive: true });
    return { ok: false, failure };
  }
}
```

Properties worth naming:

**Neither function throws.** The result is a discriminated union; the
component decides what to show. A thrown error from a fire-and-forget
`onClick` would be an unhandled rejection with nowhere to land.

**The delete's rollback record is held by the closure, not the reducer.**
`task` is the argument. When the request fails, `remove/rollback` carries the
whole record back. The reducer never kept a shadow copy
([page 03](03-state-management.md)).

**Position is not restored; it is re-derived.** The reducer appends the
restored record to the end of the array. The list sorts at render by
`dueDate` then `createdAt` (`AC-LIST-3`), and both are unchanged, so the row
lands back where it was with no index to get wrong ([page 09](09-list-filter-ordering.md)).

**`sync/set failed` precedes `add/rollback`.** Two dispatches, back to back,
both persisting. The `failed` state exists in the type so a future design
could leave a failed row in place with a retry affordance; today it is
visible for one render. Setting it is cheap and keeps the state machine
honest about what happened.

### Reconciliation by identity

```ts
// lib/tasks/reducer.ts
case "add/confirm":
  return state.map((t) =>
    t.id === action.id ? { ...t, title: action.task.title, dueDate: action.task.dueDate, sync: "confirmed" } : t,
  );
```

The contract makes this trivial: the client generated `id` and `createdAt`,
the server echoed both ([page 06](06-api-simulation.md)). The reducer takes
the server's `title` and `dueDate` (in case a real upstream normalised them),
keeps the existing `id` and `createdAt` (so the React key and the sort
position cannot change even if a server misbehaved), and keeps the local
`completed` (the user may have ticked the box while the request was in
flight). The row neither remounts nor reorders (`AC-API-8`).

### The double-submit guard

```tsx
// components/tasks/task-form.tsx
const inFlight = useRef(false);
async function onSubmit(event) {
  event.preventDefault();
  if (inFlight.current) return;
  …
  inFlight.current = true;
  setSubmitting(true);
  …
  const outcome = await createTask(task);
  inFlight.current = false;
  setSubmitting(false);
}
```

Two halves. `setSubmitting(true)` disables the button on the *next render*.
A second Enter keypress before that render has committed would go through;
the `inFlight` ref is synchronous and catches it (`AC-ADD-8`). The reducer's
`add/optimistic` is a no-op for an id already present, which is the third
line of defence against the same race.

### What the form does with the outcome

On submit, before the request has settled, the fields clear and focus
returns to the title, so the user can start typing the next task
(`AC-ADD-6`). The submit control is disabled and reads "Adding…" until the
request settles (`AC-API-11`). On a final failure the message is shown inline
under the form, and the emptied fields are *refilled* with the failed task's
values, but only if the user has not started typing something else:

```ts
setTitle((current) => (current === "" ? task.title : current));
setDueDate((current) => (current === "" ? task.dueDate : current));
```

so a failed task can be resubmitted rather than retyped, and a user who has
moved on is not interrupted.

### What the list does with the outcome

The row is gone before the request is sent, so the in-flight indicator for a
delete cannot live on the row. `components/tasks/task-list.tsx` keeps a
`deleting: Task[]` state and renders "Deleting *title*…" above the list, or
"Deleting N tasks…" for several (`AC-API-11`). A failure message renders in
the same place and the restored row reappears below it.

### What the row shows

`components/tasks/task-item.tsx`: a `syncing` row has `aria-busy`, a
"Saving…" badge with a spinner, and its delete control disabled until the
server has the record. The word is what assistive technology reads; the
spinner is `aria-hidden`.

### Announcements

Every step is announced through the one live region
([page 10](10-accessibility.md)): "Adding…" and "Deleting…" politely, the
outcome politely, a failure *assertively* (`AC-API-11`, `AC-DEL-2`,
`AC-A11Y-3`). The message a failure announces is the same message the
component shows, produced once by `describeFailure`:

```ts
export function describeFailure(verb, task, error): MutationFailure {
  const attempted  = verb === "add" ? `add "${task.title}"` : `delete "${task.title}"`;
  const rolledBack = verb === "add" ? "It was not saved." : "It has been put back in the list.";
  if (error instanceof RateLimitedError) {
    const when = error.retryAfterSeconds === undefined ? "Try again in a few seconds." : `Try again in about ${Math.ceil(error.retryAfterSeconds)} seconds.`;
    return { kind: "rate_limited", message: `Could not ${attempted}: the server is rate limiting requests. ${rolledBack} ${when}`, error };
  }
  return { kind: "generic", message: `Could not ${attempted}: the request failed. ${rolledBack} Please try again.`, error };
}
```

Rate limiting names itself and says when to try again; everything else
(`5xx`, `401`, a timeout, no network) is generic and does not claim to know
why (`AC-API-12`). The raw `error` rides along for logging and is never shown.

### Binding to React

```ts
export const ApiClientContext = createContext<ApiClient>(apiClient);

export function useTaskMutations(): TaskMutations {
  const dispatch = useTaskDispatch();
  const client = useContext(ApiClientContext);
  const announce = useAnnounce();
  return useMemo(() => ({ createTask: (t) => createTask({ dispatch, client, announce }, t), … }), [dispatch, client, announce]);
}
```

The context defaults to the production client, so the app mounts no extra
provider. A test wraps its tree in `<ApiClientContext.Provider value={fastClient}>`
with a client whose `sleep` resolves at once and whose jitter draw is fixed,
and a full rate-limit-then-rollback scenario runs in milliseconds through
MSW (`AC-API-10`; [page 12](12-testing.md)).

## The decisions inside

**Why persist the optimistic states?** `localStorage` is the system of
record ([ADR-0004](../adr/0004-api-simulation.md)). A reload mid-flight
should show what the user just did; the row comes back `confirmed` because
the envelope has no sync field. The alternative, persisting only on
`add/confirm`, would lose a task the user typed if they reloaded during a
three-retry `429` sequence.

**Why is completion not optimistic?** Because it is not a network call. The
brief calls the API on addition and removal; completion is a local toggle
persisted to `localStorage`. There is nothing to be optimistic *about*.

**Why does the list, not the row, run the delete?** The row would unmount
before its own `await` resolved. The list outlives the row and owns the
in-flight indicator and the failure message. The row's job is to render a
task and call two callbacks.

## What to discuss

**"What if the user deletes a row whose create is still in flight?"** The
delete control on a `syncing` row is disabled (`AC-API-11`), so the case
cannot arise from the UI. If it could, the upstream would be asked to delete
a record it may not have yet; the contract's echo semantics would make that
a `200` anyway, since the upstream stores nothing, but a real upstream would
not, and the disabled control is the honest answer.

**"What if the delete fails and, meanwhile, the user re-added the same
task?"** Different `id` (a fresh UUID), so both rows exist. If a *retry*
raced the rollback with the *same* id, `remove/rollback` is a no-op for an
id already present. The reducer is idempotent against the races it can see.

**"How does this generalise to a cart?"** Directly: `add/optimistic` is
add-to-cart, the reconcile is the inventory confirmation, the rollback with a
rate-limit-specific message is "we couldn't reserve this item; try again in a
moment". The two things that carry over unchanged are *the client owns the
identity* and *the prior record is held by the orchestration, not the store*.

## Where to look

- Sequences and messages: `lib/tasks/mutations.ts`
- Reducer cases: `lib/tasks/reducer.ts`
- Form: `components/tasks/task-form.tsx`; list: `components/tasks/task-list.tsx`; row: `components/tasks/task-item.tsx`
- Tests: `test/tasks/mutations.test.ts` (ordering as pure sequences), `test/tasks/optimistic.test.tsx` (end to end through MSW: `AC-API-1..2`, `AC-API-7..9`, `AC-API-11..12`, `AC-ADD-8`, `AC-DEL-2`), `test/tasks/reducer.test.ts`
