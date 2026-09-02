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
 * component creates none of its own. Wave 2: complete and delete are local
 * dispatches; T-08 replaces them with the optimistic mutations.
 *
 * `app/(protected)/tasks/page.tsx` imports `{ TaskList }` from here; the
 * export name is the T-01 contract. `useSearchParams` needs a Suspense
 * boundary above it for static rendering, so this file supplies its own.
 */
import { Suspense, useCallback } from "react";

import { TaskFilters, FILTER_LABELS, matchesFilter, useTaskFilter } from "@/components/tasks/task-filters";
import { TaskItem } from "@/components/tasks/task-item";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnnounce } from "@/components/ui/live-region";
import { useTaskDispatch, useTasks, useTasksHydrated } from "@/lib/tasks/hooks";
import type { Filter, Task } from "@/types/task";

/** `AC-LIST-3`: due date ascending, ties broken by creation time ascending. Stable; does not mutate. */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
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
  const [filter, setFilter] = useTaskFilter();

  const onCompletedChange = useCallback(
    (task: Task, completed: boolean) => {
      dispatch({ type: "setCompleted", id: task.id, completed });
      const state = completed ? "complete" : "incomplete";
      // Under a filter the row leaves the view; say so, or a screen-reader
      // user is left on a control that has vanished (`AC-FILT-6`).
      const leavesView = !matchesFilter(filter, completed);
      announce(
        leavesView
          ? `${task.title} marked ${state} and removed from the ${FILTER_LABELS[filter]} list.`
          : `${task.title} marked ${state}.`,
      );
    },
    [announce, dispatch, filter],
  );

  const onDelete = useCallback(
    (task: Task) => {
      dispatch({ type: "remove", id: task.id });
    },
    [dispatch],
  );

  const visible = sortTasks(tasks.filter((task) => matchesFilter(filter, task.completed)));

  return (
    <>
      <TaskFilters value={filter} onChange={setFilter} />
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
    </>
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
