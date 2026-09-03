"use client";

/**
 * Auth state provider (ADR-0005; `AC-AUTH-2..9`). One provider over
 * `sessionStorage`, the session-scoped half of the brief's two storage
 * lifetimes (`AC-AUTH-10`; the task list's provider covers `localStorage`).
 * `sessionStorage` is the source of truth: read once in an effect after
 * mount — so the first render agrees on server and client — then mirrored
 * on every change. Until that read happens the status is `unknown`, and
 * the guards in `components/auth/guards.tsx` render nothing for it
 * (`AC-AUTH-7`). Mounted once, in `app/layout.tsx`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

import { validateCredentials, type CredentialField, type Credentials } from "@/lib/auth/credentials";
import { AUTH_STORAGE_VERSION, clearSession, readSession, writeSession, type AuthRecord } from "@/lib/auth/session";

export type AuthStatus = "unknown" | "authenticated" | "unauthenticated"; // unknown until the post-mount sessionStorage read

export type LoginResult =
  | { ok: true }
  | { ok: false; field?: CredentialField; message: string }; // field: which one to mark invalid, when it's a field's failure

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthRecord | null; // null unless status is authenticated
  login: (credentials: Credentials) => LoginResult; // writes nothing on failure (AC-AUTH-3) or the password (AC-AUTH-9)
  logout: () => void; // removes the record from sessionStorage (AC-AUTH-6)
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  storage?: Storage; // override the read/written storage; unset resolves window.sessionStorage
  now?: () => Date; // clock for authenticatedAt; tests inject a fixed one
}

// `undefined` = not read yet; `null` = read, and there is no session.
type RecordState = AuthRecord | null | undefined;

function recordReducer(_state: RecordState, next: AuthRecord | null): RecordState {
  return next;
}

export function AuthProvider({ children, storage, now = () => new Date() }: AuthProviderProps) {
  const [record, setRecord] = useReducer(recordReducer, undefined);

  useEffect(() => {
    setRecord(readSession(storage)); // post-mount only: a browser API, kept out of render
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

/** The only sanctioned way to read or change auth state; throws a pointed error at the first render outside `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth must be used within <AuthProvider>. Mount it in the route segment's layout or page.");
  }
  return value;
}
