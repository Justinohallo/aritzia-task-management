"use client";

/**
 * One row of the task list — T-05 (`AC-LIST-1`, `AC-LIST-4`, `AC-DONE-1..2`,
 * `AC-DEL-1`, `AC-DEL-3..4`).
 *
 * The completion control is a checkbox labelled by the title, so its
 * accessible state *is* the task's completion state (`AC-DONE-1`). Overdue
 * is a word and an icon, never a colour alone (`AC-LIST-4`, `AM-4`), and it
 * applies to pending tasks only: a late task that is done is just done.
 * Delete is a real button — focusable, labelled with the task's title, and
 * activated by Enter or Space like every native button (`AC-DEL-4`) — and it acts
 * at once: no confirmation dialog (`AC-DEL-3`, `AM-7`).
 *
 * Wave 3 (T-08): a row whose create is in flight (`sync: 'syncing'`) says
 * so — a "Saving…" badge with a spinner, `aria-busy` on the row, and its
 * delete control disabled until the server has the record (`AC-API-11`).
 * The word, not the spinner, is what assistive technology reads. The row
 * itself never talks to the network; `task-list.tsx` runs the mutations.
 */
import { AlertCircleIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/tasks/validation";
import type { Task } from "@/types/task";

export interface TaskItemProps {
  task: Task;
  onCompletedChange: (task: Task, completed: boolean) => void;
  onDelete: (task: Task) => void;
}

/**
 * A `YYYY-MM-DD` calendar day, formatted for display in the user's locale.
 * The `Date` is built from the parts, never parsed from the string: parsing
 * a bare date reads it as UTC midnight and shifts it a day west of
 * Greenwich (`AM-12`).
 */
export function formatDueDate(dueDate: string, locale?: string): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  if (!year || !month || !day) return dueDate;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TaskItem({ task, onCompletedChange, onDelete }: TaskItemProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const overdue = !task.completed && isOverdue(task.dueDate);
  const syncing = task.sync === "syncing";

  return (
    <li
      className={cn("flex items-start gap-3 rounded-md border bg-card p-3 text-card-foreground", task.completed && "bg-muted/40")}
      data-completed={task.completed}
      data-overdue={overdue}
      data-sync={task.sync}
      aria-busy={syncing || undefined}
    >
      <Checkbox
        id={`${id}-completed`}
        className="mt-1"
        checked={task.completed}
        aria-labelledby={titleId}
        onCheckedChange={(checked) => onCompletedChange(task, checked === true)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label
          id={titleId}
          htmlFor={`${id}-completed`}
          className={cn("cursor-pointer text-sm font-medium break-words", task.completed && "text-muted-foreground line-through")}
        >
          {task.title}
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Due <time dateTime={task.dueDate}>{formatDueDate(task.dueDate)}</time>
          </span>
          <Badge variant={task.completed ? "secondary" : "outline"}>{task.completed ? "Completed" : "Pending"}</Badge>
          {overdue ? (
            <Badge variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              Overdue
            </Badge>
          ) : null}
          {syncing ? (
            <Badge variant="outline">
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Saving…
            </Badge>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${task.title}`}
        title={syncing ? "Saving…" : "Delete"}
        disabled={syncing}
        onClick={() => onDelete(task)}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </li>
  );
}
