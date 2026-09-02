/**
 * The auth record and its `sessionStorage` adapter — T-02 (ADR-0005;
 * `AC-AUTH-2`, `AC-AUTH-4..6`, `AC-AUTH-9`).
 *
 * The one place the application touches `sessionStorage`. The brief puts
 * the session here on purpose, and ADR-0005 says why that is not a
 * production pattern; this module follows the brief and keeps the surface
 * small enough to swap for a cookie later.
 *
 * What is stored is a **record that a login happened** — who and when —
 * and never the credential itself. The schema has no password field, and
 * unknown keys are stripped on read, so nothing this module writes can
 * carry one (`AC-AUTH-9`).
 *
 * Everything read back is untrusted input and goes through
 * {@link authRecordSchema}; on any failure the answer is "not signed in",
 * never a throw. Nothing runs at module load, so importing this file on the
 * server is safe; the caller decides when to read (after mount, never during
 * render).
 */
import { z } from "zod";

/** `sessionStorage` key for the auth record. */
export const AUTH_STORAGE_KEY = "aritzia.auth";

/** Bump when the record's shape changes. A mismatch reads as signed out. */
export const AUTH_STORAGE_VERSION = 1;

export const authRecordSchema = z.object({
  version: z.literal(AUTH_STORAGE_VERSION),
  /** The username as entered, trimmed. Shown in the UI; never a secret. */
  username: z.string().min(1),
  /** ISO-8601 timestamp of the login. */
  authenticatedAt: z.iso.datetime(),
});

export type AuthRecord = z.infer<typeof authRecordSchema>;

/**
 * The storage to use. `undefined` on the server, or in a browser that throws
 * on access (Safari with storage disabled does). Resolved lazily, per call.
 */
function defaultStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Parse whatever a raw stored string holds. Exposed so the fail-safe cases
 * can be tested without a DOM. Returns `null` unless the value is a
 * complete, valid, current-version record.
 */
export function parseAuthRecord(raw: string | null | undefined): AuthRecord | null {
  if (raw == null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = authRecordSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** Read the current session. Never throws. Call after mount, never during render. */
export function readSession(storage: Storage | undefined = defaultStorage()): AuthRecord | null {
  if (!storage) return null;
  try {
    return parseAuthRecord(storage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Write the session record. Returns whether the write succeeded: a disabled
 * or full storage is reported, not thrown, so the caller can tell the user
 * the session will not survive a reload rather than pretending it will.
 */
export function writeSession(
  record: AuthRecord,
  storage: Storage | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Remove the session record (`AC-AUTH-6`). Never throws. */
export function clearSession(storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Nothing to do: a storage that cannot be cleared held nothing readable.
  }
}
