import { RedirectByAuthState } from "@/components/auth/guards";

/**
 * `/` (ADR-0001; `AC-NAV-3`).
 *
 * The root has no content of its own: it sends a signed-in user to `/tasks`
 * and everyone else to `/login`. The decision needs `sessionStorage`, which
 * only the browser can read, so this is a client redirect after mount rather
 * than a server `redirect()`. `<AuthProvider>` is mounted once, in the root
 * layout.
 */
export default function HomePage() {
  return <RedirectByAuthState />;
}
