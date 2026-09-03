import { TaskForm } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";

/**
 * The tasks page shell. It renders the add-task form above the task list
 * and nothing else; route protection is the protected layout's job
 * (`AC-NAV-4`).
 *
 * One column up to the `lg` breakpoint, where the form moves into a
 * fixed-width left column that stays in view while the list scrolls on the
 * right — the extra desktop width is used, not stretched (`AC-UI-3`). The
 * DOM order is unchanged, so the form still precedes the list for a reader
 * and for the keyboard (`AC-A11Y-4`); only the grid placement differs.
 * `min-w-0` on both columns lets a long, unbroken title wrap inside its
 * column instead of widening the page (`AC-UI-1`).
 */
export default function TasksPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 sm:p-6 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:gap-y-8 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight lg:col-span-2">Tasks</h1>
      <div className="min-w-0 lg:sticky lg:top-6">
        <TaskForm />
      </div>
      <div className="min-w-0">
        <TaskList />
      </div>
    </main>
  );
}
