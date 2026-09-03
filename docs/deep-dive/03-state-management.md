# 03 · State management

> **In one paragraph.** Task state is one `useReducer` behind two React
> contexts, one for state and one for dispatch. Actions are a discriminated
> union frozen at T-01; the reducer switches over them exhaustively so an
> unhandled action is a compile error. Persistence is not the reducer's job:
> a wrapped `dispatch` notes whether the action is one that changes user data,
> and an effect writes the resulting state to `localStorage` once the reducer
> has produced it. Hydration is a single action dispatched after mount, and it
> is deliberately not a persisting one.

## The concept: a reducer is a state machine you can read

`useReducer` takes a pure function `(state, action) => state` and gives back
the current state and a `dispatch`. The value is not that it is less code than
`useState` (it is more). The value is that **every transition is in one
place**, named, and testable without React. For a lifecycle like "apply
optimistically, then confirm or roll back", scattering `setState` calls across
handlers would put the transitions in three files and make the ordering
implicit. A reducer makes the ordering the reducer's problem, and a test can
feed it a sequence of actions and assert the exact state after each one.

The brief constrains the mechanism: *"use a provider for state management,
incorporating semipersistent state principles without relying on a
full-fledged store."* [ADR-0002](../adr/0002-state-management.md) reads that
as Context + reducer, excludes Redux, Zustand and friends by instruction, and
records that Zustand would otherwise have won.

## How it is built here

### The provider

```tsx
// lib/tasks/provider.tsx (trimmed)
export function TasksProvider({ children, storage }: TasksProviderProps) {
  const [tasks, rawDispatch] = useReducer(tasksReducer, initialTasksState);
  const [hydrated, markHydrated] = useReducer(() => true, false);
  const pendingWrite = useRef(false);

  const dispatch = useCallback<TaskDispatch>((action) => {
    if (isPersistingAction(action)) pendingWrite.current = true;
    rawDispatch(action);
  }, []);

  useEffect(() => {
    rawDispatch({ type: "hydrate", tasks: readTasks(storage) });
    markHydrated();
  }, [storage]);

  useEffect(() => {
    if (!pendingWrite.current) return;
    pendingWrite.current = false;
    writeTasks(tasks, storage);
  }, [tasks, storage]);

  return (
    <TasksStateContext.Provider value={{ tasks, hydrated }}>
      <TasksDispatchContext.Provider value={dispatch}>{children}</TasksDispatchContext.Provider>
    </TasksStateContext.Provider>
  );
}
```

Four mechanisms in twenty lines, each worth naming.

**Split contexts.** State and dispatch are provided separately. React
re-renders every consumer of a context when the context's value changes. The
`dispatch` value never changes (it is a `useCallback` with no dependencies),
so a component that only dispatches (the form) does not re-render when the
list does. A component that reads the list re-renders when it should. With
one combined context, every consumer would re-render on every change.

**`hydrated` as a second reducer.** `useReducer(() => true, false)` is a
one-way latch: a boolean that can only become `true`. It is written this way
rather than `useState` to make the one-way-ness visible and to give it a
stable setter without a dependency.

**The `pendingWrite` ref.** The wrapped `dispatch` cannot write to storage
itself: it does not have the new state yet, because the reducer runs during
React's render phase, after `dispatch` returns. So `dispatch` sets a flag,
the reducer produces the new `tasks`, and the effect that depends on `tasks`
reads the flag, clears it, and writes. The write happens exactly once per
persisting action and never for a non-persisting one.

**Hydration in an effect, not in the initial state.** `useReducer` accepts a
lazy initialiser, and the tempting version is
`useReducer(tasksReducer, undefined, () => readTasks())`. That runs during
render, on the server, where there is no `window`, and on the client it
produces a first render that disagrees with the server's. The effect runs
after mount, only on the client, and the first render on both sides is the
same empty list (`AC-STATE-6`; [page 02](02-nextjs-app-router.md)).

### The actions

```ts
// lib/tasks/actions.ts (the union, trimmed of comments)
export type TaskAction =
  | { type: "hydrate"; tasks: Task[] }
  | { type: "add"; task: Task }
  | { type: "setCompleted"; id: TaskId; completed: boolean }
  | { type: "remove"; id: TaskId }
  | { type: "add/optimistic"; task: Task }
  | { type: "add/confirm"; id: TaskId; task: ApiTask }
  | { type: "add/rollback"; id: TaskId }
  | { type: "remove/optimistic"; id: TaskId }
  | { type: "remove/rollback"; task: Task }
  | { type: "sync/set"; id: TaskId; sync: SyncState };
```

This is a **discriminated union**: every member has a `type` literal, and
TypeScript narrows the whole object once `type` is checked. Inside
`case "add/confirm":` the compiler knows `action.task` is an `ApiTask` and
`action.id` exists. The optimistic actions were declared in wave 0, before
anyone needed them, so that the wave-3 task could implement them without
widening a contract three other tasks had already built against.

Two design rules in the union:

- **The reducer never stores order.** There is no `index` in any action;
  `remove/rollback` carries the whole prior `task` and appends it. Position is
  derived at render from `dueDate` then `createdAt` (`AC-LIST-3`), so a
  restored record lands back where it was with no index to get wrong
  ([page 09](09-list-filter-ordering.md)).
- **The reducer never holds the rollback record.** `remove/optimistic` drops
  the row; whoever dispatched it is responsible for keeping the prior record
  and dispatching `remove/rollback` with it. That is `lib/tasks/mutations.ts`
  ([page 08](08-optimistic-mutations.md)). Keeping it in the reducer would
  have put a second, shadow list in state.

### The reducer

```ts
// lib/tasks/reducer.ts (trimmed)
export function tasksReducer(state: TasksState, action: TaskAction): TasksState {
  switch (action.type) {
    case "hydrate":          return action.tasks;
    case "add":              return [...state, action.task];
    case "setCompleted":     return has(state, action.id) ? state.map(…) : state;
    case "remove":           return has(state, action.id) ? state.filter(…) : state;
    case "add/optimistic":   return has(state, action.task.id) ? state : [...state, { ...action.task, sync: "syncing" }];
    case "add/confirm":      return state.map(t => t.id === action.id ? { ...t, title, dueDate, sync: "confirmed" } : t);
    case "add/rollback":     return state.filter(t => t.id !== action.id);
    case "remove/optimistic":return state.filter(t => t.id !== action.id);
    case "remove/rollback":  return has(state, action.task.id) ? state : [...state, { ...action.task, sync: "confirmed" }];
    case "sync/set":         return state.map(t => t.id === action.id ? { ...t, sync: action.sync } : t);
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled task action: ${JSON.stringify(unhandled)}`);
    }
  }
}
```

Three properties, each tested in `test/tasks/reducer.test.ts`:

**Pure and immutable.** Every case returns a new array or the same reference.
`state.map` and `state.filter` copy; nothing mutates. `TasksState` is
`readonly Task[]`, so a mutating call is a type error.

**Idempotent where a race could double-apply.** `add/optimistic` for an id
already present is a no-op, not a duplicate: the double-submit guard in the
form (`AC-ADD-8`) is the first line and this is the second.
`remove/rollback` for an id already present is a no-op, because a retry can
race a rollback. A reducer that assumes its actions arrive in the perfect
order is a reducer that will one day show two copies of a task.

**Exhaustive.** The `default` branch assigns `action` to a variable of type
`never`. If a member is added to `TaskAction` without a case here, `action`
is no longer `never` in the default branch and the file fails to compile.
Remove a case, same result. This is the cheapest correctness guarantee in the
codebase ([page 13](13-typescript-patterns.md)).

### Which actions persist

```ts
export const PERSISTING_ACTIONS: ReadonlySet<TaskActionType> = new Set([
  "add", "setCompleted", "remove",
  "add/optimistic", "add/confirm", "add/rollback",
  "remove/optimistic", "remove/rollback",
]);
```

Not in the set: `hydrate` and `sync/set`.

`hydrate` is excluded for a subtle reason [ADR-0002](../adr/0002-state-management.md)
records under "alternatives considered". If reading `localStorage` fails
safe to `[]` (corrupt JSON, an old version) and hydration then triggered a
write, the empty list would overwrite the corrupt-but-perhaps-recoverable
data. Excluding it means a bad read is never written back; the user's data is
still on disk for a future migration to attempt.

`sync/set` is excluded because the persisted envelope has no `sync` field
([page 04](04-persistence-and-storage.md)). Writing after it would be a
write that changes nothing.

The optimistic actions **are** included, and that is a decision:
`localStorage` is the system of record, so a task the user just added is
their task even if the confirming `201` never arrives. A reload mid-flight
shows what the user did. The row comes back as `confirmed` because the
envelope carries no sync state, which is exactly right: as far as the
browser's record is concerned, it exists.

### The hooks

```ts
// lib/tasks/hooks.ts
export function useTasks(): TasksState          { … ?? missing("useTasks") }
export function useTasksHydrated(): boolean     { … }
export function useTaskDispatch(): TaskDispatch { … }
```

The context objects are exported from the provider file marked `@internal`
and are never imported by a component. Each hook throws a pointed error when
used outside the provider: `useTasks must be used within <TasksProvider>.
Mount it in a layout above this component.` A `null` context that is
silently treated as an empty list would render a blank page and no clue.

## The decisions inside

**Why is auth state a separate provider with a separate reducer?** Two
lifetimes, two storages, two providers ([page 05](05-authentication.md)).
The auth reducer is the degenerate `(_, next) => next`, which is
`useState` spelled as `useReducer` so that the two providers read alike and
the record's three-valued state (`undefined` not read, `null` read and
absent, a record) is explicit.

**Why not persist with an effect on the whole state, unconditionally?**
Because that writes on hydration, which is the corrupt-then-reset problem
above. The `pendingWrite` flag costs one ref and buys the guarantee that only
user-initiated changes reach disk.

**Why is `completed` local and never sent to the API?** The brief calls the
API on addition and removal only. Completion is a local toggle, persisted to
`localStorage` (`AC-DONE-3`), and `add/confirm` preserves the local
`completed` flag rather than taking the server's echo, because the user may
have ticked the box while the create was in flight.

## What to discuss

**"Where does this stop scaling?"** [ADR-0002](../adr/0002-state-management.md)
names the line: high-frequency updates across a large tree, state shared by
many unrelated routes, or a need for devtools and middleware. Below that line
Context + reducer is ~120 lines with no dependency. Above it, Zustand for
client state and TanStack Query for server state, and the mechanism here is
what you would be delegating to them.

**"Why does the reducer do so little?"** Because it should. Validation is
`lib/tasks/validation.ts`. Ordering is the list component. Network is the
mutations module. The reducer's whole job is to turn a sequence of actions
into a list, and it can be tested with nothing but arrays.

**"How would you add undo?"** The actions are already serialisable and the
reducer is pure, so an undo is a history of states or of inverse actions.
`remove/rollback` is already an inverse of `remove/optimistic`. That the
question has an easy answer is the argument for a reducer.

## Where to look

- Provider and the write trigger: `lib/tasks/provider.tsx`
- Actions: `lib/tasks/actions.ts`
- Reducer and `PERSISTING_ACTIONS`: `lib/tasks/reducer.ts`
- Hooks: `lib/tasks/hooks.ts`
- Tests: `test/tasks/reducer.test.ts` (every transition as a pure function), `test/tasks/provider.test.tsx` (hydration, the write trigger, `AC-STATE-1..6`, `AC-AUTH-10`)
