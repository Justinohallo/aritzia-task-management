/**
 * Task reducer (ADR-0002; `AC-STATE-1`), extended with the optimistic
 * lifecycle (ADR-0004; `AC-API-8`, `AC-API-9`, `AC-API-11`) documented per
 * case in `lib/tasks/actions.ts`. A pure function over the
 * {@link TaskAction} union; the switch is exhaustive, so removing a case is
 * a compile error. `add/confirm` keeps the existing record's `id` and
 * `createdAt` even if the server's echo differed, so the row's React key
 * and sort position (`AC-LIST-3`) never move.
 *
 * Persistence is not the reducer's job. The provider writes to storage after
 * the actions in {@link PERSISTING_ACTIONS}; `hydrate` is deliberately not one
 * of them (`AC-STATE-4`, ADR-0002 "alternatives considered").
 */
import type { TaskAction, TaskActionType } from "@/lib/tasks/actions";
import type { Task } from "@/types/task";

export type TasksState = readonly Task[];

export const initialTasksState: TasksState = [];

/** The actions whose result is written to `localStorage`: everything a reload should still show, optimistic changes included (ADR-0004). */
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

    // --- Optimistic lifecycle ---

    case "add/optimistic": {
      if (has(state, action.task.id)) return state; // the double-submit AC-ADD-8 guards against upstream; here a no-op
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
      if (has(state, action.task.id)) return state; // already back: a retry raced the rollback
      return [...state, { ...action.task, sync: "confirmed" }];
    }

    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled task action: ${JSON.stringify(unhandled)}`);
    }
  }
}
