"use client";

/**
 * The task list — T-05 (`AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`,
 * `AC-DEL-1`, `AC-DEL-3..4`).
 *
 * Order is derived at render — due date ascending, then creation time
 * ascending (`AC-LIST-3`, `AM-5`) — and never stored, so a restored record
 * lands back in place with no index to get wrong. The filter comes from
 * the URL through `useTaskFilter()` (`AC-FILT-4`). Three states are told
 * apart on purpose: not yet hydrated (a skeleton, so a misleading "no
 * tasks" never flashes), no tasks at all (`AC-LIST-2`), and tasks that the
 * active filter hides (`AC-FILT-5`).
 *
 * A completion change under a filter removes the row from view, and that
 * removal is announced through the one live region (`AC-FILT-6`) — this
 * component creates none of its own. Completion is local: the brief's API
 * is called on addition and removal only.
 *
 * Wave 3 (T-08): delete goes through the optimistic mutation in
 * `lib/tasks/mutations.ts` (`AC-API-2`, `AC-API-9`). The row is gone
 * before the request is sent, so the in-flight indicator lives here, above
 * the list, naming the task being deleted (`AC-API-11`); the live region
 * says the same. A final failure restores the row — its position follows
 * from the derived order — and its message is shown here too.
 *
 * Wave 4 (T-09): a row that leaves the view — deleted, or completed under
 * a filter that hides it — takes the keyboard user's focus with it, and the
 * browser drops it on `<body>`: not trapped, but lost, and the next Tab
 * starts from the top of the page. Before the row goes, the neighbouring
 * row's matching control is chosen; after the render that removes the row,
 * focus lands there, or on the active filter when no row is left
 * (`AC-A11Y-4`). Focus is moved only when it was inside the leaving row, so
 * a pointer user's focus is left where it is.
 *
 * `app/(protected)/tasks/page.tsx` imports `{ TaskList }` from here; the
 * export name is the T-01 contract. `useSearchParams` needs a Suspense
 * boundary above it for static rendering, so this file supplies its own.
 */
import { Loader2Icon } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { TaskFilters, FILTER_LABELS, matchesFilter, useTaskFilter } from "@/components/tasks/task-filters";
import { TaskItem } from "@/components/tasks/task-item";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnnounce } from "@/components/ui/live-region";
import { useTaskDispatch, useTasks, useTasksHydrated } from "@/lib/tasks/hooks";
import { useTaskMutations } from "@/lib/tasks/mutations";
import type { Filter, Task } from "@/types/task";

/** `AC-LIST-3`: due date ascending, ties broken by creation time ascending. Stable; does not mutate. */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** The two focusable controls in a row, by their `data-control` name (`task-item.tsx`). */
type RowControl = "completed" | "delete";

/** Where focus should go once a row has left the view. */
interface FocusIntent {
  /** The row that is leaving; the intent is spent once it is gone. */
  leavingId: string;
  /** The neighbouring row to land on, or `null` when there is none. */
  neighbourId: string | null;
  control: RowControl;
}

/**
 * The row to land on when `index` leaves `visible`: the next one, else the
 * previous — so repeated Delete walks down the list, and the last row
 * hands back to the one above it.
 */
export function neighbourOf(visible: readonly Task[], index: number): Task | null {
  return visible[index + 1] ?? visible[index - 1] ?? null;
}

export function TaskList() {
  return (
    <section aria-labelledby="task-list-heading" className="flex flex-col gap-4">
      <h2 id="task-list-heading" className="sr-only">
        Your tasks
      </h2>
      <Suspense fallback={<ListSkeleton />}>
        <TaskListBody />
      </Suspense>
    </section>
  );
}

function TaskListBody() {
  const tasks = useTasks();
  const hydrated = useTasksHydrated();
  const dispatch = useTaskDispatch();
  const announce = useAnnounce();
  const { deleteTask } = useTaskMutations();
  const [filter, setFilter] = useTaskFilter();
  /** Deletes in flight, in the order they were started (`AC-API-11`). */
  const [deleting, setDeleting] = useState<readonly Task[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const visible = sortTasks(tasks.filter((task) => matchesFilter(filter, task.completed)));

  const sectionRef = useRef<HTMLDivElement>(null);
  const focusIntent = useRef<FocusIntent | null>(null);

  /**
   * Record where focus should go when `task` is about to leave the view.
   * Nothing is moved yet: the row is still on screen, and the effect
   * below moves focus once the render that removes it has committed.
   */
  const planFocus = useCallback(
    (task: Task, control: RowControl) => {
      const root = sectionRef.current;
      const row = root?.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
      // Only a keyboard user's focus is on the row; leave a pointer user's alone.
      if (!row || !row.contains(document.activeElement)) return;
      const index = visible.findIndex((t) => t.id === task.id);
      focusIntent.current = { leavingId: task.id, neighbourId: neighbourOf(visible, index)?.id ?? null, control };
    },
    [visible],
  );

  useEffect(() => {
    const intent = focusIntent.current;
    const root = sectionRef.current;
    if (!intent || !root) return;
    // Still on screen — a delete that was declined, or a filter change
    // that kept it. The intent stands until the row actually goes.
    if (root.querySelector(`[data-task-id="${intent.leavingId}"]`)) return;
    focusIntent.current = null;

    const neighbour =
      intent.neighbourId === null
        ? null
        : root.querySelector<HTMLElement>(`[data-task-id="${intent.neighbourId}"] [data-control="${intent.control}"]`);
    // A neighbour's delete may be disabled while its own create is in
    // flight (`AC-API-11`); its checkbox never is.
    const target =
      neighbour && !neighbour.matches(":disabled")
        ? neighbour
        : root.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    target?.focus();
  });

  const onCompletedChange = useCallback(
    (task: Task, completed: boolean) => {
      // Under a filter the row leaves the view; say so, or a screen-reader
      // user is left on a control that has vanished (`AC-FILT-6`), and
      // move focus with it (`AC-A11Y-4`).
      const leavesView = !matchesFilter(filter, completed);
      if (leavesView) planFocus(task, "completed");
      dispatch({ type: "setCompleted", id: task.id, completed });
      const state = completed ? "complete" : "incomplete";
      announce(
        leavesView
          ? `${task.title} marked ${state} and removed from the ${FILTER_LABELS[filter]} list.`
          : `${task.title} marked ${state}.`,
      );
    },
    [announce, dispatch, filter, planFocus],
  );

  const onDelete = useCallback(
    async (task: Task) => {
      setFailure(null);
      planFocus(task, "delete");
      setDeleting((current) => [...current, task]);
      const outcome = await deleteTask(task);
      setDeleting((current) => current.filter((t) => t.id !== task.id));
      if (!outcome.ok) setFailure(outcome.failure.message);
    },
    [deleteTask, planFocus],
  );

  return (
    <div ref={sectionRef} className="contents">
      <TaskFilters value={filter} onChange={setFilter} />
      {deleting.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="task-list-deleting">
          <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
          {deleting.length === 1 ? `Deleting "${deleting[0].title}"…` : `Deleting ${deleting.length} tasks…`}
        </p>
      ) : null}
      {failure ? (
        <p className="text-sm text-destructive" data-testid="task-list-failure">
          {failure}
        </p>
      ) : null}
      {!hydrated ? (
        <ListSkeleton />
      ) : tasks.length === 0 ? (
        <EmptyState title="No tasks yet" body="Add your first task above to get started." />
      ) : visible.length === 0 ? (
        <FilteredEmptyState filter={filter} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label={`${FILTER_LABELS[filter]} tasks`}>
          {visible.map((task) => (
            <TaskItem key={task.id} task={task} onCompletedChange={onCompletedChange} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/** `AC-FILT-5`: names the filter, and reads differently from the no-tasks state. */
function FilteredEmptyState({ filter }: { filter: Filter }) {
  const label = FILTER_LABELS[filter];
  return (
    <EmptyState
      title={`No ${label.toLowerCase()} tasks`}
      body={`You have tasks, but none match the ${label} filter. Choose All to see every task.`}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
