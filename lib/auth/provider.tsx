"use client";

/**
 * Auth state provider — T-02 (ADR-0005; `AC-AUTH-2..9`).
 *
 * One provider over `sessionStorage`, the session-scoped half of the brief's
 * two storage lifetimes (`AC-AUTH-10`; the task list is T-03's provider over
 * `localStorage`). `sessionStorage` is the source of truth: the provider
 * reads it once after mount and then mirrors every change it makes.
 *
 * The read happens in an effect, after mount, for the same reason T-03's
 * does: the first render on the server and on the client must agree, and
 * no browser API is touched during render. Until that read has happened the
 * status is `unknown`, and the guards in `lib/auth/guards.tsx` render
 * nothing for it — which is what `AC-AUTH-7` requires of a protected route.
 *
 * Mounted once, in `app/layout.tsx` (T-20): every route reads the same
 * instance, so navigating between them cannot disagree about auth state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

import { validateCredentials, type CredentialField, type Credentials } from "@/lib/auth/credentials";
import { AUTH_STORAGE_VERSION, clearSession, readSession, writeSession, type AuthRecord } from "@/lib/auth/session";

/** `unknown` until the post-mount read of `sessionStorage` has been applied. */
export type AuthStatus = "unknown" | "authenticated" | "unauthenticated";

export type LoginResult =
  | { ok: true }
  | {
      ok: false;
      /** The field to mark invalid, when the failure is a field's. */
      field?: CredentialField;
      message: string;
    };

export interface AuthContextValue {
  status: AuthStatus;
  /** The signed-in user's record; `null` unless `status` is `authenticated`. */
  user: AuthRecord | null;
  /**
   * Validate the credentials and, if they pass, start a session. Writes
   * nothing on failure (`AC-AUTH-3`) and never stores the password
   * (`AC-AUTH-9`). Navigation is the caller's job.
   */
  login: (credentials: Credentials) => LoginResult;
  /** End the session: the record is removed from `sessionStorage` (`AC-AUTH-6`). */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  /**
   * Override the storage read and written. Tests inject a stub; the app
   * leaves it unset and the adapter resolves `window.sessionStorage` itself.
   */
  storage?: Storage;
  /** Clock for `authenticatedAt`. Tests inject a fixed one. */
  now?: () => Date;
}

// `undefined` = not read yet; `null` = read, and there is no session.
type RecordState = AuthRecord | null | undefined;

function recordReducer(_state: RecordState, next: AuthRecord | null): RecordState {
  return next;
}

export function AuthProvider({ children, storage, now = () => new Date() }: AuthProviderProps) {
  const [record, setRecord] = useReducer(recordReducer, undefined);

  useEffect(() => {
    // Post-mount only: the read is a browser API and must stay out of render.
    setRecord(readSession(storage));
  }, [storage]);

  const login = useCallback<AuthContextValue["login"]>(
    (credentials) => {
      const check = validateCredentials(credentials);
      if (!check.ok) return { ok: false, field: check.field, message: check.message };

      const next: AuthRecord = {
        version: AUTH_STORAGE_VERSION,
        username: check.username,
        authenticatedAt: now().toISOString(),
      };
      if (!writeSession(next, storage)) {
        return {
          ok: false,
          message: "This browser is not allowing session storage, so you cannot be signed in. Enable it and try again.",
        };
      }
      setRecord(next);
      return { ok: true };
    },
    [now, storage],
  );

  const logout = useCallback(() => {
    clearSession(storage);
    setRecord(null);
  }, [storage]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: record === undefined ? "unknown" : record ? "authenticated" : "unauthenticated",
      user: record ?? null,
      login,
      logout,
    }),
    [record, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The only sanctioned way to read or change auth state. Throws a pointed
 * error outside `<AuthProvider>`, where a missing provider should surface:
 * at the first render, with the fix in the message.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used within <AuthProvider>. Mount it in the route segment's layout or page.");
  }
  return value;
}
