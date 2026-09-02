"use client";

/**
 * Route guards — T-02 (ADR-0001, ADR-0005; `AC-AUTH-5`, `AC-AUTH-7`,
 * `AC-AUTH-8`, `AC-NAV-3`, `AC-NAV-4`).
 *
 * Protection is a **client-side guard, not middleware**: the session lives
 * in `sessionStorage`, which is never sent to the server, so there is
 * nothing for `middleware.ts` to read (ADR-0001, "sharp edge"). The guard
 * redirects; it does not authorise. ADR-0005 states what that is worth.
 *
 * One mechanism, three uses, all reading `useAuth()`:
 *
 * - {@link RequireAuth} — the protected layout. Renders **nothing** until
 *   the session has been read, so no task data paints before the redirect
 *   (`AC-AUTH-7`). Every route under `app/(protected)/` is covered by the
 *   one layout, which is what `AC-NAV-4` means by centralised.
 * - {@link RedirectIfAuthenticated} — the login page (`AC-AUTH-8`). Renders
 *   its children while the session is unknown, so the form is server-rendered
 *   and appears at once for the common, signed-out case.
 * - {@link RedirectByAuthState} — the root page (`AC-NAV-3`).
 */
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth/provider";

export const LOGIN_PATH = "/login";
export const TASKS_PATH = "/tasks";

/** `router.replace(to)` once `to` is set: a redirect leaves nothing in history to go back to. */
function useRedirect(to: string | null): void {
  const router = useRouter();
  useEffect(() => {
    if (to !== null) router.replace(to);
  }, [router, to]);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  useRedirect(status === "unauthenticated" ? LOGIN_PATH : null);
  return status === "authenticated" ? children : null;
}

export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  useRedirect(status === "authenticated" ? TASKS_PATH : null);
  return status === "authenticated" ? null : children;
}

export function RedirectByAuthState() {
  const { status } = useAuth();
  useRedirect(status === "unknown" ? null : status === "authenticated" ? TASKS_PATH : LOGIN_PATH);
  return null;
}
