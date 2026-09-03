/**
 * The auth record and its `sessionStorage` adapter (ADR-0005; `AC-AUTH-2`,
 * `AC-AUTH-4..6`, `AC-AUTH-9`), the one place the application touches
 * `sessionStorage`. What is stored is a record that a login happened, who
 * and when, never the credential itself — no password field, and unknown
 * keys are stripped on read. Everything read back is untrusted input and
 * goes through {@link authRecordSchema}; on any failure the answer is "not
 * signed in", never a throw. Nothing runs at module load, so importing
 * this file on the server is safe; the caller decides when to read.
 */
import { z } from "zod";

export const AUTH_STORAGE_KEY = "aritzia.auth";
export const AUTH_STORAGE_VERSION = 1; // bump when the shape changes; a mismatch reads as signed out

export const authRecordSchema = z.object({
  version: z.literal(AUTH_STORAGE_VERSION),
  username: z.string().min(1), // as entered, trimmed; shown in the UI, never a secret
  authenticatedAt: z.iso.datetime(),
});

export type AuthRecord = z.infer<typeof authRecordSchema>;

// The storage to use; undefined on the server or where access throws (Safari with storage disabled). Resolved lazily, per call.
function defaultStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Parse a raw stored string, testable without a DOM; `null` unless it is a complete, valid, current-version record. */
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

export function readSession(storage: Storage | undefined = defaultStorage()): AuthRecord | null {
  if (!storage) return null;
  try {
    return parseAuthRecord(storage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Write the session record; a disabled or full storage is reported, not thrown, so the caller can warn the reload won't keep it. */
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
    // a storage that cannot be cleared held nothing readable
  }
}
