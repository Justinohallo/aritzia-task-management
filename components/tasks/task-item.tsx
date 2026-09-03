"use client";

/**
 * One row of the task list (`AC-LIST-1`, `AC-LIST-4`, `AC-DONE-1..2`,
 * `AC-DEL-1`, `AC-DEL-3..4`). The checkbox's accessible state *is* the
 * task's completion state (`AC-DONE-1`); overdue is a word and icon, never
 * a colour alone (`AC-LIST-4`); delete is a real button, no confirmation
 * dialog (`AC-DEL-3`, `AC-DEL-4`).
 *
 * A row whose create is in flight shows "Saving…", `aria-busy`, and a
 * disabled delete until the server has the record (`AC-API-11`) — the
 * word, not the spinner, is what assistive technology reads.
 * `data-task-id`/`data-control` are how `task-list.tsx` finds where to put
 * keyboard focus when a row leaves the view (`AC-A11Y-4`).
 *
 * `wrap-anywhere` stops a long unbroken title pushing the row past a 320px
 * viewport (`AC-UI-1`; `break-words` doesn't, since a flex item's
 * min-content width ignores it). On a coarse pointer the checkbox and
 * delete control grow to a 44px hit area (`AC-UI-2`).
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

/** A `YYYY-MM-DD` day, formatted for the user's locale; built from the parts, never parsed (parsing reads it as UTC midnight). */
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
      data-task-id={task.id}
      data-completed={task.completed}
      data-overdue={overdue}
      data-sync={task.sync}
      aria-busy={syncing || undefined}
    >
      <Checkbox
        id={`${id}-completed`}
        data-control="completed"
        className="relative mt-1 before:absolute before:-inset-3.5 before:content-[''] pointer-coarse:mt-3"
        checked={task.completed}
        aria-labelledby={titleId}
        onCheckedChange={(checked) => onCompletedChange(task, checked === true)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label
          id={titleId}
          htmlFor={`${id}-completed`}
          className={cn(
            "min-w-0 cursor-pointer text-sm font-medium wrap-anywhere pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center",
            task.completed && "text-muted-foreground line-through",
          )}
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
        data-control="delete"
        className="shrink-0 pointer-coarse:size-11 pointer-coarse:-my-1.5 pointer-coarse:-mr-1.5"
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
