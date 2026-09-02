import { LiveRegion } from "@/components/ui/live-region";
import { RequireAuth } from "@/lib/auth/guards";
import { AuthProvider } from "@/lib/auth/provider";
import { SessionBar } from "@/lib/auth/session-bar";

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
 */
export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      <RequireAuth>
        <header className="border-b">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 p-4 sm:px-6">
            <p className="font-semibold tracking-tight">Aritzia Task Management</p>
            <SessionBar />
          </div>
        </header>
        <LiveRegion />
        {children}
      </RequireAuth>
    </AuthProvider>
  );
}
