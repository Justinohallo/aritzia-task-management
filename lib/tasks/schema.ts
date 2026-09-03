/**
 * Persistence schema. The field schemas are the single statement of what a
 * valid task is, composed by form and request validation rather than
 * restated. Whatever sits in a user's `localStorage` from three deploys ago
 * is untrusted input (`AC-STATE-5`, ADR-0002); everything read back goes
 * through {@link persistedEnvelopeSchema}, and on failure the list is empty.
 */
import { z } from "zod";

export const STORAGE_KEY = "aritzia.tasks";
export const STORAGE_VERSION = 1; // bump with a migration when the shape changes; a mismatch fails safe to empty
export const TASK_TITLE_MAX_LENGTH = 200; // AC-ADD-5: bounded, the limit stated in the error

// --- Field schemas ---

export const taskIdSchema = z.uuid(); // client-generated
export const taskTitleSchema = z.string().min(1).max(TASK_TITLE_MAX_LENGTH); // already-trimmed; trimming is the form's job (AC-ADD-4)
export const dueDateSchema = z.iso.date(); // YYYY-MM-DD
export const isoTimestampSchema = z.iso.datetime(); // as new Date().toISOString() produces

// --- The persisted envelope: { version, tasks } ---

// A task as written to localStorage. It omits sync (runtime-only; every hydrated task is
// confirmed, since an in-flight write that never confirmed is still the user's task).
export const persistedTaskSchema = z.object({
  id: taskIdSchema,
  title: taskTitleSchema,
  dueDate: dueDateSchema,
  completed: z.boolean(),
  createdAt: isoTimestampSchema, // tie-breaker in list ordering (AC-LIST-3)
});

export const persistedEnvelopeSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  tasks: z.array(persistedTaskSchema),
});

export type PersistedTask = z.infer<typeof persistedTaskSchema>;
export type PersistedEnvelope = z.infer<typeof persistedEnvelopeSchema>;
