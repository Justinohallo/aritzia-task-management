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
 * Wave 2: no API yet. A valid task is dispatched straight to the reducer as
 * `confirmed` and the provider persists it. T-08 replaces the dispatch with
 * the optimistic create and adds the in-flight state (`AC-ADD-8`).
 *
 * `app/(protected)/tasks/page.tsx` imports `{ TaskForm }` from here; the
 * export name is the T-01 contract.
 */
import { useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTaskDispatch } from "@/lib/tasks/hooks";
import {
  validateTaskInput,
  type TaskField,
  type TaskFieldErrors,
  type ValidTaskInput,
} from "@/lib/tasks/validation";
import type { Task } from "@/types/task";

/** A new, pending, locally confirmed task (wave 2; see `lib/tasks/actions.ts`). */
function newTask(value: ValidTaskInput): Task {
  return {
    id: crypto.randomUUID(),
    title: value.title,
    dueDate: value.dueDate,
    completed: false,
    createdAt: new Date().toISOString(),
    sync: "confirmed",
  };
}

export function TaskForm() {
  const dispatch = useTaskDispatch();
  const id = useId();
  const titleId = `${id}-title`;
  const dueDateId = `${id}-due-date`;
  const errorId = (field: TaskField) => `${id}-${field}-error`;

  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<TaskFieldErrors>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateTaskInput({ title, dueDate });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    dispatch({ type: "add", task: newTask(result.value) });
    setErrors({});
    setTitle("");
    setDueDate("");
    titleRef.current?.focus();
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
            aria-invalid={invalid("dueDate")}
            aria-describedby={describedBy("dueDate")}
          />
          {errors.dueDate ? (
            <p id={errorId("dueDate")} className="text-sm text-destructive">
              {errors.dueDate}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="self-start">
          Add task
        </Button>
      </form>
    </section>
  );
}
