/**
 * Add-task validation — T-04 (`AC-ADD-2..5`, `AC-ADD-7`; `AM-4`, `AM-12`).
 *
 * Pure functions, no React. The field schemas are the ones frozen in
 * `lib/tasks/schema.ts`, composed rather than restated, so the form and the
 * persistence layer cannot disagree about what a valid task is. What this
 * module adds is the form's side of the contract: trimming (`AC-ADD-4`), a
 * message per failing branch, and both fields reported at once so a user
 * fixes one round of errors, not two.
 *
 * Overdue is a display concern (`AM-4`): a past due date is accepted here
 * and {@link isOverdue} is the one comparison the list uses to mark it
 * (`AC-ADD-7`, `AC-LIST-4`). It compares calendar days in the user's local
 * timezone, never instants (`AM-12`).
 */
import { TASK_TITLE_MAX_LENGTH, dueDateSchema, taskTitleSchema } from "@/lib/tasks/schema";

export { TASK_TITLE_MAX_LENGTH };

/** What the form collects, as typed. */
export interface TaskInput {
  title: string;
  dueDate: string;
}

export type TaskField = keyof TaskInput;

/** Trimmed and checked; safe to build a `Task` from. */
export interface ValidTaskInput {
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

/**
 * Validate what the form holds. The title is trimmed before any rule runs,
 * so whitespace-only is empty (`AC-ADD-4`) and the length bound applies to
 * what will be stored (`AC-ADD-5`). Every failing field is reported; the
 * first rule to fail on a field is the one shown.
 */
export function validateTaskInput(input: TaskInput): TaskValidation {
  const errors: TaskFieldErrors = {};

  const title = input.title.trim();
  if (title.length === 0) {
    errors.title = TITLE_REQUIRED_MESSAGE;
  } else if (title.length > TASK_TITLE_MAX_LENGTH) {
    errors.title = TITLE_TOO_LONG_MESSAGE;
  } else if (!taskTitleSchema.safeParse(title).success) {
    // Unreachable while the two rules above mirror the schema; kept so a
    // future schema rule cannot pass the form silently.
    errors.title = TITLE_REQUIRED_MESSAGE;
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

/** Today as a `YYYY-MM-DD` calendar day in the user's local timezone (`AM-12`). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Whether a due date has passed. Strictly before today: a task due today is
 * due all day, not overdue (`AM-12`). Both arguments are `YYYY-MM-DD`, which
 * orders lexically, so no `Date` is constructed and no timezone can shift
 * the answer. Completion is the caller's concern (`AC-LIST-4` marks pending
 * tasks only).
 */
export function isOverdue(dueDate: string, today: string = localToday()): boolean {
  return dueDate < today;
}
