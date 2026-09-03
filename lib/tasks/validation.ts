/**
 * Add-task validation (`AC-ADD-2..5`, `AC-ADD-7`). Pure functions, no
 * React; the field schemas in `lib/tasks/schema.ts` are composed rather
 * than restated. This module adds the form's side: trimming (`AC-ADD-4`),
 * a message per failing branch, and both fields reported at once so a user
 * fixes one round of errors, not two. A past due date is accepted, and
 * {@link isOverdue} is the one comparison the list uses to mark it
 * (`AC-ADD-7`, `AC-LIST-4`), by calendar day in the local timezone.
 */
import { TASK_TITLE_MAX_LENGTH, dueDateSchema, taskTitleSchema } from "@/lib/tasks/schema";

export { TASK_TITLE_MAX_LENGTH };

export interface TaskInput { // what the form collects, as typed
  title: string;
  dueDate: string;
}

export type TaskField = keyof TaskInput;

export interface ValidTaskInput { // trimmed and checked; safe to build a Task from
  title: string;
  dueDate: string;
}

export type TaskFieldErrors = Partial<Record<TaskField, string>>;

export type TaskValidation =
  | { ok: true; value: ValidTaskInput }
  | { ok: false; errors: TaskFieldErrors };

export const TITLE_REQUIRED_MESSAGE = "Enter a title.";
export const TITLE_TOO_LONG_MESSAGE = `Keep the title to ${TASK_TITLE_MAX_LENGTH} characters or fewer.`;
export const DUE_DATE_REQUIRED_MESSAGE = "Choose a due date.";
export const DUE_DATE_INVALID_MESSAGE = "Enter a valid date.";

/** Validate what the form holds; the title is trimmed first, so whitespace-only is empty (`AC-ADD-4`) and the bound applies to what is stored (`AC-ADD-5`). */
export function validateTaskInput(input: TaskInput): TaskValidation {
  const errors: TaskFieldErrors = {};

  const title = input.title.trim();
  if (title.length === 0) {
    errors.title = TITLE_REQUIRED_MESSAGE;
  } else if (title.length > TASK_TITLE_MAX_LENGTH) {
    errors.title = TITLE_TOO_LONG_MESSAGE;
  } else if (!taskTitleSchema.safeParse(title).success) {
    errors.title = TITLE_REQUIRED_MESSAGE; // unreachable while the two rules above mirror the schema; guards a future schema change
  }

  const dueDate = input.dueDate.trim();
  if (dueDate.length === 0) {
    errors.dueDate = DUE_DATE_REQUIRED_MESSAGE;
  } else if (!dueDateSchema.safeParse(dueDate).success) {
    errors.dueDate = DUE_DATE_INVALID_MESSAGE;
  }

  if (errors.title !== undefined || errors.dueDate !== undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { title, dueDate } };
}

/** Today as a `YYYY-MM-DD` calendar day in the user's local timezone. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Strictly before today (a task due today isn't overdue); both arguments are `YYYY-MM-DD`, ordering lexically so no timezone can shift the answer. */
export function isOverdue(dueDate: string, today: string = localToday()): boolean {
  return dueDate < today;
}
