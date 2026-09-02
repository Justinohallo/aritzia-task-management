/**
 * Reducer actions — frozen at T-01 (`docs/TASKS.md`, contract table).
 *
 * Read by T-03 (reducer), T-04 and T-05 (local mutations) and T-08
 * (optimistic lifecycle). Every case the plan needs is declared here now,
 * including the T-08 ones, so no agent has to widen the union mid-wave.
 * The reducer switches exhaustively over `type`; a case it does not handle
 * yet is a `never` branch or a no-op, and stays a compile error if removed.
 *
 * State is the list of {@link Task}. List order is never stored — it is
 * derived at render from `dueDate` then `createdAt` (`AC-LIST-3`) — so
 * restoring a record restores its position with no index to get wrong.
 */
import type { ApiTask } from "@/types/api";
import type { SyncState, Task, TaskId } from "@/types/task";

export type TaskAction =
  // -------------------------------------------------------------------------
  // T-03 — persistence (ADR-0002)
  // -------------------------------------------------------------------------
  /**
   * Replace state with the list read from `localStorage` after mount. Every
   * hydrated task is `confirmed` — the persisted envelope carries no sync
   * state (`lib/tasks/schema.ts`). Dispatched once; must not trigger a write.
   */
  | { type: "hydrate"; tasks: Task[] }

  // -------------------------------------------------------------------------
  // T-04 / T-05 — local mutations, before the API is wired (wave 2)
  // -------------------------------------------------------------------------
  /** Append a task. In wave 2 the task arrives `confirmed`. */
  | { type: "add"; task: Task }
  /** Mark complete or incomplete (`AC-DONE-1`, `AC-DONE-2`). Not an API call. */
  | { type: "setCompleted"; id: TaskId; completed: boolean }
  /** Remove a task outright. In wave 2 there is no server to reconcile with. */
  | { type: "remove"; id: TaskId }

  // -------------------------------------------------------------------------
  // T-08 — optimistic lifecycle (ADR-0004; AC-API-8, AC-API-9, AC-API-11)
  // -------------------------------------------------------------------------
  /**
   * Optimistic create: the row appears now with `sync: 'syncing'`
   * (`AC-API-8`, `AC-API-11`). `task.id` and `task.createdAt` are the values
   * the request carries; the server echoes both.
   */
  | { type: "add/optimistic"; task: Task }
  /**
   * Reconcile with the server's record on `201`. Match by `id`; set
   * `sync: 'confirmed'`. `task.id` and `task.createdAt` equal the existing
   * record's, so the row neither remounts nor reorders (`AC-API-8`).
   */
  | { type: "add/confirm"; id: TaskId; task: ApiTask }
  /** Final failure after the retry budget: remove the provisional row (`AC-API-7`). */
  | { type: "add/rollback"; id: TaskId }
  /**
   * Optimistic delete: the row disappears now (`AC-API-9`). The orchestration
   * in `lib/tasks/mutations.ts` keeps the prior record for rollback; the
   * reducer does not.
   */
  | { type: "remove/optimistic"; id: TaskId }
  /**
   * Final failure: restore the prior record with `sync: 'confirmed'`. Its
   * position follows from `AC-LIST-3`; nothing else is needed (`AC-API-9`).
   */
  | { type: "remove/rollback"; task: Task }
  /**
   * Set a task's sync state without touching anything else — for marking a
   * record `failed` before it is rolled back, or `confirmed` after a delete
   * that was rolled back and then retried. No-op if the id is absent.
   */
  | { type: "sync/set"; id: TaskId; sync: SyncState };

export type TaskActionType = TaskAction["type"];
