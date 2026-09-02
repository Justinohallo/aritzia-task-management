import { LiveRegion } from "@/components/ui/live-region";
import { RequireAuth } from "@/lib/auth/guards";
import { AuthProvider } from "@/lib/auth/provider";
import { SessionBar } from "@/lib/auth/session-bar";
import { TasksProvider } from "@/lib/tasks/provider";

/**
 * The protected layout — T-02 (ADR-0001, ADR-0005; `AC-AUTH-4..7`,
 * `AC-NAV-2`, `AC-NAV-4`).
 *
 * Every route under `app/(protected)/` renders through this one layout, so
 * adding an authenticated route means adding a page here and nothing else:
 * the guard is shared, not copied (`AC-NAV-4`). `<RequireAuth>` renders
 * nothing until the session has been read, then either the page or a
 * redirect to `/login` (`AC-AUTH-7`).
 *
 * `<LiveRegion />` is mounted here, once, inside the guard: it is the one
 * announcement mechanism for every later task (T-01 contract, B-07).
 *
 * `<TasksProvider>` is mounted here, once, inside the guard (B-20): the
 * list is per-app, not per-page, and it is a client component so it sits
 * inside the auth guard (`AC-STATE-1`).
 */
export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      <RequireAuth>
        <TasksProvider>
          <header className="border-b">
            {/* T-10: the header tracks the page's max width at every breakpoint (`AC-UI-3`) and wraps rather than overflows at 320px (`AC-UI-1`). */}
            <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 sm:px-6 lg:max-w-5xl lg:px-8">
              <p className="min-w-0 font-semibold tracking-tight">Aritzia Task Management</p>
              <SessionBar />
            </div>
          </header>
          <LiveRegion />
          {children}
        </TasksProvider>
      </RequireAuth>
    </AuthProvider>
  );
}
