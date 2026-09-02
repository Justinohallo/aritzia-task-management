import { RedirectByAuthState } from "@/lib/auth/guards";
import { AuthProvider } from "@/lib/auth/provider";

/**
 * `/` — T-02 (ADR-0001; `AC-NAV-3`).
 *
 * The root has no content of its own: it sends a signed-in user to `/tasks`
 * and everyone else to `/login`. The decision needs `sessionStorage`, which
 * only the browser can read, so this is a client redirect after mount rather
 * than a server `redirect()`.
 */
export default function HomePage() {
  return (
    <AuthProvider>
      <RedirectByAuthState />
    </AuthProvider>
  );
}
