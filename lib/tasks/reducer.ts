/**
 * Task reducer — T-03 (ADR-0002; `AC-STATE-1`), extended by T-08 with the
 * optimistic lifecycle (ADR-0004; `AC-API-8`, `AC-API-9`, `AC-API-11`).
 *
 * A pure function over the frozen {@link TaskAction} union. The switch is
 * exhaustive: removing a case is a compile error.
 *
 * The optimistic cases hold the whole apply → reconcile / rollback story,
 * so it can be tested without React:
 *
 *   - `add/optimistic` appends the row as `syncing` — it is visible before
 *     the API answers (`AC-API-8`, `AC-API-11`).
 *   - `add/confirm` reconciles **in place, by `id`**. The existing record's
 *     `id` and `createdAt` are kept even if the server's echo differed: the
 *     row's React key and its sort position (`AC-LIST-3`) are what
 *     `AC-API-8` says must not change, and the T-01 contract says the server
 *     echoes both anyway. `completed` is local too — it is never sent, and
 *     the user may have ticked the box while the request was in flight.
 *   - `add/rollback` removes the provisional row on final failure (`AC-API-7`).
 *   - `remove/optimistic` drops the row now (`AC-API-9`). The orchestration
 *     in `lib/tasks/mutations.ts` keeps the prior record; the reducer does not.
 *   - `remove/rollback` re-inserts that record as `confirmed`. Order is
 *     derived at render, so its position comes back with it (`AC-API-9`).
 *
 * Persistence is not the reducer's job. The provider writes to storage after
 * the actions in {@link PERSISTING_ACTIONS}; `hydrate` is deliberately not one
 * of them (`AC-STATE-4`, ADR-0002 "alternatives considered").
 */
import type { TaskAction, TaskActionType } from "@/lib/tasks/actions";
import type { Task } from "@/types/task";

export type TasksState = readonly Task[];

export const initialTasksState: TasksState = [];

/**
 * The actions whose result is written to `localStorage`. Everything that
 * changes what the user would expect to see after a reload is here. An
 * optimistic change is one of those: `localStorage` is the system of record
 * (ADR-0004), and a reload mid-flight should show what the user just did.
 */
export const PERSISTING_ACTIONS: ReadonlySet<TaskActionType> = new Set<TaskActionType>([
  "setCompleted",
  "add/optimistic",
  "add/confirm",
  "add/rollback",
  "remove/optimistic",
  "remove/rollback",
]);

export function isPersistingAction(action: TaskAction): boolean {
  return PERSISTING_ACTIONS.has(action.type);
}

function has(state: TasksState, id: string): boolean {
  return state.some((t) => t.id === id);
}

export function tasksReducer(state: TasksState, action: TaskAction): TasksState {
  switch (action.type) {
    case "hydrate":
      return action.tasks;

    case "setCompleted": {
      if (!has(state, action.id)) return state;
      return state.map((t) => (t.id === action.id ? { ...t, completed: action.completed } : t));
    }

    // -----------------------------------------------------------------------
    // T-08 — optimistic lifecycle
    // -----------------------------------------------------------------------

    case "add/optimistic": {
      // A second apply for the same id is the double-submit `AC-ADD-8`
      // guards against upstream; here it is a no-op rather than a duplicate.
      if (has(state, action.task.id)) return state;
      return [...state, { ...action.task, sync: "syncing" }];
    }

    case "add/confirm": {
      if (!has(state, action.id)) return state;
      return state.map((t) =>
        t.id === action.id
          ? { ...t, title: action.task.title, dueDate: action.task.dueDate, sync: "confirmed" }
          : t,
      );
    }

    case "add/rollback": {
      if (!has(state, action.id)) return state;
      return state.filter((t) => t.id !== action.id);
    }

    case "remove/optimistic": {
      if (!has(state, action.id)) return state;
      return state.filter((t) => t.id !== action.id);
    }

    case "remove/rollback": {
      // Already back (a retry that raced the rollback): nothing to restore.
      if (has(state, action.task.id)) return state;
      return [...state, { ...action.task, sync: "confirmed" }];
    }

    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled task action: ${JSON.stringify(unhandled)}`);
    }
  }
}
