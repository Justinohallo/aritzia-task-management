"use client";

/**
 * The site nav bar (`AC-NAV-1`, `AC-NAV-2`): links to the presentation and
 * the technical walkthrough, plus one link that follows auth status —
 * `/tasks` once signed in, `/login` otherwise. Reads `useAuth()` directly
 * rather than taking a prop, so `/login` and the protected layout mount it
 * the same way. Rendered while `status` is `"unknown"` (pre-mount) with
 * that third link hidden, since neither destination is correct yet.
 */
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/provider";
import { LOGIN_PATH, TASKS_PATH } from "@/components/auth/guards";

const DEEP_DIVE_URL = "https://github.com/Justinohallo/aritzia-task-management/blob/main/docs/deep-dive/README.md";

const linkButtonClassName = "pointer-coarse:h-11 pointer-coarse:px-4";

export function SiteNav() {
  const { status } = useAuth();

  return (
    <nav aria-label="Site" className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      <Button asChild variant="ghost" size="sm" className={linkButtonClassName}>
        <a href={DEEP_DIVE_URL} target="_blank" rel="noopener noreferrer">
          Technical Walkthrough
        </a>
      </Button>
      <Button asChild variant="ghost" size="sm" className={linkButtonClassName}>
        <Link href="/presentation">Presentation</Link>
      </Button>
      {status === "authenticated" ? (
        <Button asChild variant="ghost" size="sm" className={linkButtonClassName}>
          <Link href={TASKS_PATH}>Tasks</Link>
        </Button>
      ) : status === "unauthenticated" ? (
        <Button asChild variant="ghost" size="sm" className={linkButtonClassName}>
          <Link href={LOGIN_PATH}>Log in</Link>
        </Button>
      ) : null}
    </nav>
  );
}
