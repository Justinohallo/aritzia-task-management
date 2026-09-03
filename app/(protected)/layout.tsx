import { LiveRegion } from "@/components/ui/live-region";
import { RequireAuth } from "@/components/auth/guards";
import { SessionBar } from "@/components/auth/session-bar";
import { TasksProvider } from "@/components/tasks/provider";

/**
 * The protected layout (ADR-0001, ADR-0005). Every route under
 * `app/(protected)/` renders through this one layout, so the guard is
 * shared, not copied (`AC-NAV-4`); `<RequireAuth>` renders nothing until
 * the session has been read, then the page or a redirect to `/login`
 * (`AC-AUTH-7`). `<LiveRegion />` and `<TasksProvider>` mount here, once,
 * inside the guard — the list is per-app and a client component, so it
 * sits inside the guard (`AC-STATE-1`).
 */
export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireAuth>
      <TasksProvider>
        <header className="border-b">
          {/* Tracks the page's max width at every breakpoint (`AC-UI-3`) and wraps rather than overflows at 320px (`AC-UI-1`). */}
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 sm:px-6 lg:max-w-5xl lg:px-8">
            <p className="min-w-0 font-semibold tracking-tight">Aritzia Task Management</p>
            <SessionBar />
          </div>
        </header>
        <LiveRegion />
        {children}
      </TasksProvider>
    </RequireAuth>
  );
}
