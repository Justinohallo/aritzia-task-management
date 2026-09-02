/**
 * `localStorage` adapter — T-03 (ADR-0002; `AC-STATE-3..6`, `AC-AUTH-10`).
 *
 * The one place the application touches `localStorage`. Everything read back
 * is untrusted input and goes through `persistedEnvelopeSchema`; on any
 * failure — no storage, malformed JSON, the wrong shape, an unknown version —
 * the result is an empty list, never a throw and never a partial list
 * (`AC-STATE-5`). Nothing here runs at module load, so importing this file
 * on the server is safe (`AC-STATE-6`); the caller decides when to read.
 */
import { STORAGE_KEY, STORAGE_VERSION, persistedEnvelopeSchema } from "@/lib/tasks/schema";
import type { PersistedEnvelope, PersistedTask } from "@/lib/tasks/schema";
import type { Task } from "@/types/task";

/**
 * The storage to use. `undefined` on the server, or in a browser that throws
 * on access (Safari with storage disabled does). Resolved lazily, per call.
 */
function defaultStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Strip runtime-only state: the persisted task carries no `sync`. */
export function toPersistedTask(task: Task): PersistedTask {
  const { id, title, dueDate, completed, createdAt } = task;
  return { id, title, dueDate, completed, createdAt };
}

/** Every hydrated task is `confirmed`: `localStorage` is the system of record. */
export function fromPersistedTask(task: PersistedTask): Task {
  return { ...task, sync: "confirmed" };
}

export function toEnvelope(tasks: readonly Task[]): PersistedEnvelope {
  return { version: STORAGE_VERSION, tasks: tasks.map(toPersistedTask) };
}

/**
 * Parse whatever a raw stored string holds. Exposed so the fail-safe cases
 * can be tested without a DOM. Returns `[]` unless the value is a complete,
 * valid, current-version envelope.
 */
export function parseStoredTasks(raw: string | null | undefined): Task[] {
  if (raw == null) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = persistedEnvelopeSchema.safeParse(json);
  if (!result.success) return [];
  return result.data.tasks.map(fromPersistedTask);
}

/**
 * Read the task list. Never throws. Call after mount, never during render.
 */
export function readTasks(storage: Storage | undefined = defaultStorage()): Task[] {
  if (!storage) return [];
  try {
    return parseStoredTasks(storage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

/**
 * Write the task list as a versioned envelope. Returns whether the write
 * succeeded: a full or disabled storage is reported, not thrown, because
 * failing to persist must never take the in-memory list down with it.
 */
export function writeTasks(
  tasks: readonly Task[],
  storage: Storage | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(toEnvelope(tasks)));
    return true;
  } catch {
    return false;
  }
}
