/**
 * Task reducer — T-03 (ADR-0002; `AC-STATE-1`). Extended by T-08.
 *
 * A pure function over the frozen {@link TaskAction} union. The switch is
 * exhaustive: removing a case is a compile error, and T-08's optimistic
 * cases are declared here as explicit no-ops so the behaviour they will get
 * in wave 3 is not guessed at in wave 1.
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
 * changes what the user would expect to see after a reload is here.
 */
export const PERSISTING_ACTIONS: ReadonlySet<TaskActionType> = new Set<TaskActionType>([
  "add",
  "setCompleted",
  "remove",
]);

export function isPersistingAction(action: TaskAction): boolean {
  return PERSISTING_ACTIONS.has(action.type);
}

export function tasksReducer(state: TasksState, action: TaskAction): TasksState {
  switch (action.type) {
    case "hydrate":
      return action.tasks;

    case "add":
      return [...state, action.task];

    case "setCompleted": {
      if (!state.some((t) => t.id === action.id)) return state;
      return state.map((t) => (t.id === action.id ? { ...t, completed: action.completed } : t));
    }

    case "remove": {
      if (!state.some((t) => t.id === action.id)) return state;
      return state.filter((t) => t.id !== action.id);
    }

    // T-08 — optimistic lifecycle. Declared no-ops in wave 1 so the union
    // stays exhaustively handled; T-08 owns this file next and fills them in.
    case "add/optimistic":
    case "add/confirm":
    case "add/rollback":
    case "remove/optimistic":
    case "remove/rollback":
    case "sync/set":
      return state;

    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled task action: ${JSON.stringify(unhandled)}`);
    }
  }
}
