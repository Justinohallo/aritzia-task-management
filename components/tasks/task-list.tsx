/**
 * Stub. T-05 replaces this file with the list, filter, complete and delete
 * controls (`AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`, `AC-DEL-1..4`).
 * The export name is the contract: `app/(protected)/tasks/page.tsx` imports
 * `{ TaskList }` from here and is not edited after T-01.
 */
export function TaskList() {
  return (
    <section aria-labelledby="task-list-heading">
      <h2 id="task-list-heading" className="sr-only">
        Your tasks
      </h2>
      <p className="text-muted-foreground text-sm">The task list arrives with T-05.</p>
    </section>
  );
}
