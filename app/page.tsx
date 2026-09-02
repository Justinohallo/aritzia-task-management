import Link from "next/link";

/**
 * Placeholder root page from the T-01 scaffold. T-02 replaces this file with
 * the auth-state redirect (`AC-NAV-3`); nothing here is contract.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Aritzia Task Management</h1>
      <p className="text-muted-foreground">
        The scaffold is in place. Log in and the task list arrive with the next wave.
      </p>
      <Link href="/tasks" className="underline underline-offset-4">
        Go to tasks
      </Link>
    </main>
  );
}
