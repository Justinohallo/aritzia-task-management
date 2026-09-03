/**
 * Reducer actions.
 *
 * The reducer switches exhaustively over `type`; a case it does not handle
 * yet is a `never` branch or a no-op, and stays a compile error if removed.
 *
 * State is the list of {@link Task}. List order is never stored — it is
 * derived at render from `dueDate` then `createdAt` (`AC-LIST-3`) — so
 * restoring a record restores its position with no index to get wrong.
 */
import type { ApiTask } from "@/types/api";
import type { Task, TaskId } from "@/types/task";

export type TaskAction =
  // --- Persistence (ADR-0002) ---
  | { type: "hydrate"; tasks: Task[] } // localStorage's list after mount; hydrated tasks are always confirmed; dispatched once, must not trigger a write
  | { type: "setCompleted"; id: TaskId; completed: boolean } // AC-DONE-1/2; not an API call

  // --- Optimistic lifecycle (ADR-0004; AC-API-8, AC-API-9, AC-API-11) ---
  | { type: "add/optimistic"; task: Task } // row appears now as syncing; id/createdAt are the values the request carries and the server echoes
  | { type: "add/confirm"; id: TaskId; task: ApiTask } // reconcile on 201 by id, keeping id/createdAt so the row neither remounts nor reorders (AC-API-8)
  | { type: "add/rollback"; id: TaskId } // final failure after the retry budget: remove the provisional row (AC-API-7)
  | { type: "remove/optimistic"; id: TaskId } // row disappears now (AC-API-9); mutations.ts keeps the prior record for rollback, not the reducer
  | { type: "remove/rollback"; task: Task }; // final failure: restore as confirmed, position following from AC-LIST-3 (AC-API-9)

export type TaskActionType = TaskAction["type"];
