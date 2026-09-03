"use client";

/**
 * Route guards (ADR-0001, ADR-0005; `AC-AUTH-5`, `AC-AUTH-7`, `AC-AUTH-8`,
 * `AC-NAV-3`, `AC-NAV-4`). Client-side, not middleware — the session lives
 * in `sessionStorage`, never sent to the server, so redirecting is all a
 * guard can do; it does not authorise. Three uses, all reading
 * `useAuth()`: {@link RequireAuth} for the protected layout, rendering
 * nothing until the session is read (`AC-AUTH-7`); {@link RedirectIfAuthenticated}
 * for the login page, rendering children while unknown (`AC-AUTH-8`);
 * {@link RedirectByAuthState} for the root page.
 */
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/components/auth/provider";

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
