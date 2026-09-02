"use client";

/**
 * Who is signed in, and the way out — T-02 (`AC-AUTH-6`).
 *
 * Rendered inside {@link RequireAuth}, so `user` is always set here. Logging
 * out only clears the session; the guard sees the status change and does the
 * redirect, so there is one redirect mechanism, not two.
 */
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/provider";

export function SessionBar() {
  const { user, logout } = useAuth();
  return (
    <div className="flex items-center gap-3 text-sm">
      {user ? (
        <span className="text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.username}</span>
        </span>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
