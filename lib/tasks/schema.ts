/**
 * Persistence schema — frozen at T-01 (`docs/TASKS.md`, contract table).
 *
 * Read by T-03 (storage adapter) and T-08. The field schemas are also the
 * single statement of what a valid task is, so T-04's form validation and
 * T-06's request validation compose them rather than restate the rules.
 *
 * Whatever sits in a user's `localStorage` from three deploys ago is
 * untrusted input (`AC-STATE-5`, ADR-0002). Everything read back goes
 * through {@link persistedEnvelopeSchema}; on failure the list is empty.
 */
import { z } from "zod";

/** `localStorage` key for the task envelope. */
export const STORAGE_KEY = "aritzia.tasks";

/**
 * Bump when the persisted shape changes, and add a migration in the storage
 * adapter. A mismatched version reads as invalid and fails safe to empty.
 */
export const STORAGE_VERSION = 1;

/** `AC-ADD-5`: titles are bounded, and the limit is stated in the error. */
export const TASK_TITLE_MAX_LENGTH = 200;

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

/** A client-generated UUID. */
export const taskIdSchema = z.uuid();

/**
 * Already-trimmed, 1–200 characters. Trimming is the form's job (`AC-ADD-4`);
 * this schema validates the stored value and does not transform it.
 */
export const taskTitleSchema = z.string().min(1).max(TASK_TITLE_MAX_LENGTH);

/** A calendar day, `YYYY-MM-DD` (`AM-12`). */
export const dueDateSchema = z.iso.date();

/** An ISO-8601 timestamp with offset, as `new Date().toISOString()` produces. */
export const isoTimestampSchema = z.iso.datetime();

// ---------------------------------------------------------------------------
// The persisted envelope: { version, tasks }
// ---------------------------------------------------------------------------

/**
 * A task as written to `localStorage`. It **omits `sync`**: sync state is
 * runtime-only, and every hydrated task is `confirmed`. `localStorage` is
 * the system of record — an in-flight write that never confirmed is still
 * the user's task. Unknown keys (including a stray `sync`) are stripped,
 * not rejected.
 */
export const persistedTaskSchema = z.object({
  id: taskIdSchema,
  title: taskTitleSchema,
  dueDate: dueDateSchema,
  completed: z.boolean(),
  /** Tie-breaker in list ordering (`AC-LIST-3`). */
  createdAt: isoTimestampSchema,
});

export const persistedEnvelopeSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  tasks: z.array(persistedTaskSchema),
});

export type PersistedTask = z.infer<typeof persistedTaskSchema>;
export type PersistedEnvelope = z.infer<typeof persistedEnvelopeSchema>;
