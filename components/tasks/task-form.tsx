"use client";

/**
 * The add-task form (ADR-0002, ADR-0003; `AC-ADD-1..7`). Validation lives
 * in `lib/tasks/validation.ts`; this component renders the outcome — each
 * failing field marked `aria-invalid` and described by its own inline
 * error (`AC-ADD-2`, `AC-ADD-3`, `AC-A11Y-2`), the browser's own validation
 * off (`noValidate`) so every rule and message come from the one module.
 *
 * A valid task goes through the optimistic create in
 * `lib/tasks/mutations.ts` (`AC-API-1`, `AC-API-8`): the fields clear and
 * focus returns to the title as soon as the row is applied, but the submit
 * control stays disabled until the request settles (`AC-ADD-8`,
 * `AC-API-11`). A final failure is shown inline and the emptied fields are
 * refilled so the task can be resubmitted (`AC-API-7`, `AC-API-12`).
 *
 * On a coarse pointer the fields and submit control grow to 44px (`AC-UI-2`).
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

// A new, pending task; id and createdAt are assigned here, in the browser, and echoed by the server (AC-API-8).
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
  const inFlight = useRef(false); // sync half of the double-submit guard (AC-ADD-8): a second Enter before re-render lands here

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
      // Refill a field untouched since, so the failed task can be resubmitted rather than retyped.
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
            // iOS WebKit shows nothing in an empty date field; globals.css draws a placeholder while this is present.
            data-empty={dueDate === "" ? "" : undefined}
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
