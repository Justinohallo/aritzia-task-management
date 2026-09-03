/**
 * The credential rule (ADR-0005; `AC-AUTH-2`, `AC-AUTH-3`). There is no
 * user store, so "login" is a gate, not an identity check: any non-empty
 * username passes with a password of a stated minimum length. Exported as
 * text so the login page can show it and a reviewer is never locked out.
 * Validation is client-side and authenticates nobody (ADR-0005).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const CREDENTIAL_RULE = `Any username works, with a password of at least ${MIN_PASSWORD_LENGTH} characters.`; // shown on the login page

export interface Credentials {
  username: string;
  password: string;
}

export type CredentialField = keyof Credentials;

export type CredentialCheck =
  | { ok: true; username: string }
  | { ok: false; field: CredentialField; message: string };

/** Check a credential pair against the rule; the username is trimmed, the password compared as typed. Returns the first failing field. */
export function validateCredentials(input: Credentials): CredentialCheck {
  const username = input.username.trim();
  if (username.length === 0) {
    return { ok: false, field: "username", message: "Enter a username." };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      field: "password",
      message: `Enter a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { ok: true, username };
}
