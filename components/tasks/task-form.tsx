"use client";

/**
 * The add-task form — T-04 (ADR-0002, ADR-0003; `AC-ADD-1..7`).
 *
 * Validation lives in `lib/tasks/validation.ts`; this component renders the
 * outcome. Each failing field is marked `aria-invalid` and described by its
 * own inline error (`AC-ADD-2`, `AC-ADD-3`, `AC-A11Y-2`). The browser's own
 * validation is off (`noValidate`) so every rule and every message come from
 * the one module, and a past date is accepted (`AC-ADD-7`, `AM-4`).
 *
 * Wave 3 (T-08): a valid task goes through the optimistic create in
 * `lib/tasks/mutations.ts` (`AC-API-1`, `AC-API-8`). The fields clear and
 * focus returns to the title as soon as the row is applied — the user can
 * start typing the next task — but the submit control is disabled, and
 * says so, until the request settles (`AC-ADD-8`, `AC-API-11`). A final
 * failure is shown inline under the form, and the emptied fields are
 * refilled so the task can be resubmitted; the live region has already
 * announced the same message (`AC-API-7`, `AC-API-12`).
 *
 * `app/(protected)/tasks/page.tsx` imports `{ TaskForm }` from here; the
 * export name is the T-01 contract.
 *
 * Wave 4 (T-10, `AC-UI-2`): on a coarse pointer the fields and the submit
 * control grow to 44px; with a mouse they keep the primitive's default
 * height. Layout classes only — the semantics are T-09's.
 */
import { Loader2Icon } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTaskMutations } from "@/lib/tasks/mutations";
import {
  validateTaskInput,
  type TaskField,
  type TaskFieldErrors,
  type ValidTaskInput,
} from "@/lib/tasks/validation";
import type { Task } from "@/types/task";

/**
 * A new, pending task. `id` and `createdAt` are assigned here, in the
 * browser, and echoed by the server (`AC-API-8`). The sync state is set by
 * the reducer when the row is applied.
 */
function newTask(value: ValidTaskInput): Task {
  return {
    id: crypto.randomUUID(),
    title: value.title,
    dueDate: value.dueDate,
    completed: false,
    createdAt: new Date().toISOString(),
    sync: "syncing",
  };
}

export function TaskForm() {
  const { createTask } = useTaskMutations();
  const id = useId();
  const titleId = `${id}-title`;
  const dueDateId = `${id}-due-date`;
  const errorId = (field: TaskField) => `${id}-${field}-error`;
  const failureId = `${id}-failure`;

  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<TaskFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The synchronous half of the double-submit guard (`AC-ADD-8`): a second
  // Enter before React has re-rendered the disabled button lands here.
  const inFlight = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const result = validateTaskInput({ title, dueDate });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    const task = newTask(result.value);
    inFlight.current = true;
    setSubmitting(true);
    setFailure(null);
    setErrors({});
    setTitle("");
    setDueDate("");
    titleRef.current?.focus();

    const outcome = await createTask(task);

    inFlight.current = false;
    setSubmitting(false);
    if (!outcome.ok) {
      setFailure(outcome.failure.message);
      // Refill a field the user has not started on since, so the failed
      // task can be resubmitted rather than retyped.
      setTitle((current) => (current === "" ? task.title : current));
      setDueDate((current) => (current === "" ? task.dueDate : current));
    }
  }

  const invalid = (field: TaskField) => (errors[field] ? true : undefined);
  const describedBy = (field: TaskField) => (errors[field] ? errorId(field) : undefined);

  return (
    <section aria-labelledby="task-form-heading">
      <h2 id="task-form-heading" className="sr-only">
        Add a task
      </h2>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={titleId}>Title</Label>
          <Input
            ref={titleRef}
            id={titleId}
            name="title"
            type="text"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="pointer-coarse:h-11"
            aria-invalid={invalid("title")}
            aria-describedby={describedBy("title")}
          />
          {errors.title ? (
            <p id={errorId("title")} className="text-sm text-destructive">
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={dueDateId}>Due date</Label>
          <Input
            id={dueDateId}
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="pointer-coarse:h-11"
            aria-invalid={invalid("dueDate")}
            aria-describedby={describedBy("dueDate")}
          />
          {errors.dueDate ? (
            <p id={errorId("dueDate")} className="text-sm text-destructive">
              {errors.dueDate}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="self-start pointer-coarse:h-11 pointer-coarse:px-6" disabled={submitting} aria-describedby={failure ? failureId : undefined}>
          {submitting ? (
            <>
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Adding…
            </>
          ) : (
            "Add task"
          )}
        </Button>
        {failure ? (
          <p id={failureId} className="text-sm text-destructive" data-testid="task-form-failure">
            {failure}
          </p>
        ) : null}
      </form>
    </section>
  );
}
