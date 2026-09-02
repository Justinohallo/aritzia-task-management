/**
 * Task domain types — frozen at T-01 (`docs/TASKS.md`, contract table).
 * Read by T-03..T-10; written by nobody after wave 0. A change here goes
 * through `docs/BLOCKERS.md`, not through an edit.
 */

/**
 * A client-generated UUID (`crypto.randomUUID()`), assigned when the task is
 * created in the browser and echoed unchanged by the server (`AC-API-8`).
 */
export type TaskId = string;

/**
 * Runtime-only synchronisation state of a task against the API (ADR-0004).
 *
 * - `confirmed` — the server has acknowledged this record, or it was hydrated
 *   from `localStorage`, which is the system of record.
 * - `syncing`   — an optimistic add or delete is in flight (`AC-API-11`).
 * - `failed`    — the last request for this record failed and has not been
 *   rolled back yet.
 *
 * Deliberately not `'pending'`: that word belongs to {@link Filter} and to
 * "status is Pending" in `AC-ADD-1`, which mean *not completed* (ARCH-03).
 * This state is never persisted — see `lib/tasks/schema.ts`.
 */
export type SyncState = "confirmed" | "syncing" | "failed";

/** The list filter (`AC-FILT-1..4`). Held in the URL query string by T-05. */
export type Filter = "all" | "pending" | "completed";

/** Every filter value, in display order, for parsing and rendering. */
export const FILTERS = ["all", "pending", "completed"] as const satisfies readonly Filter[];

/** Narrow an untrusted string (a query parameter) to a {@link Filter}. */
export function isFilter(value: string | null | undefined): value is Filter {
  return (FILTERS as readonly string[]).includes(value ?? "");
}

export interface Task {
  id: TaskId;
  /** Trimmed, 1–200 characters (`AC-ADD-4`, `AC-ADD-5`). */
  title: string;
  /**
   * A calendar day, `YYYY-MM-DD`, compared in the user's local timezone
   * (`AM-12`). Never an instant: a task due "Wednesday" is due all Wednesday.
   */
  dueDate: string;
  completed: boolean;
  /**
   * Client-assigned ISO-8601 timestamp of creation. The tie-breaker in list
   * ordering (`AC-LIST-3`); the server echoes it and never reassigns it.
   */
  createdAt: string;
  sync: SyncState;
}
