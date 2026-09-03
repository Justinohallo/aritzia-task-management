/**
 * Task domain types — frozen at T-01 (`docs/TASKS.md`, contract table).
 * `Task` itself is derived from `lib/tasks/schema.ts`'s `persistedTaskSchema`
 * (T-20, ARCH-07): that schema is the one statement of a task's fields.
 */
import type { PersistedTask } from "@/lib/tasks/schema";

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
 *
 * Deliberately not `'pending'`: that word belongs to {@link Filter} and to
 * "status is Pending" in `AC-ADD-1`, which mean *not completed* (ARCH-03).
 * This state is never persisted — see `lib/tasks/schema.ts`.
 */
export type SyncState = "confirmed" | "syncing";

/** The list filter (`AC-FILT-1..4`). Held in the URL query string by T-05. */
export type Filter = "all" | "pending" | "completed";

/** Every filter value, in display order, for parsing and rendering. */
export const FILTERS = ["all", "pending", "completed"] as const satisfies readonly Filter[];

/** Narrow an untrusted string (a query parameter) to a {@link Filter}. */
export function isFilter(value: string | null | undefined): value is Filter {
  return (FILTERS as readonly string[]).includes(value ?? "");
}

/** A task's persisted fields, plus its runtime-only sync state. */
export type Task = PersistedTask & { sync: SyncState };
