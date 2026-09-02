import { TaskForm } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";

/**
 * The tasks page shell (T-01 contract). It renders the add-task form above the
 * task list and nothing else. T-04 replaces `components/tasks/task-form.tsx`
 * and T-05 replaces `components/tasks/task-list.tsx`; neither touches this
 * file. Route protection is the protected layout's job (T-02, `AC-NAV-4`).
 */
export default function TasksPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
      <TaskForm />
      <TaskList />
    </main>
  );
}
