/**
 * The credential rule — T-02 (ADR-0005, `AM-11`; `AC-AUTH-2`, `AC-AUTH-3`).
 *
 * There is no user store and the brief does not ask for one, so "login" is a
 * gate, not an identity check. Any non-empty username passes, with a
 * password of a stated minimum length. The rule is exported as text so the
 * login page can show it and a reviewer is never locked out of the demo.
 *
 * Validation is client-side and authenticates nobody. ADR-0005 says so at
 * length; the login page says so in one sentence.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** The rule as shown on the login page. */
export const CREDENTIAL_RULE = `Any username works, with a password of at least ${MIN_PASSWORD_LENGTH} characters.`;

export interface Credentials {
  username: string;
  password: string;
}

export type CredentialField = keyof Credentials;

export type CredentialCheck =
  | { ok: true; username: string }
  | { ok: false; field: CredentialField; message: string };

/**
 * Check a submitted credential pair against the rule. The username is
 * trimmed; the password is compared as typed, because a password is what
 * the user typed. Returns the first failing field so the form can mark it.
 */
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
