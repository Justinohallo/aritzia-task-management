import { CREDENTIAL_RULE, MIN_PASSWORD_LENGTH, validateCredentials } from "@/lib/auth/credentials";

describe("validateCredentials", () => {
  it("AC-AUTH-2: any non-empty username with a password of the minimum length passes, username trimmed", () => {
    const result = validateCredentials({ username: "  ada  ", password: "x".repeat(MIN_PASSWORD_LENGTH) });
    expect(result).toEqual({ ok: true, username: "ada" });
  });

  it.each([["", "empty"], ["   ", "whitespace-only"]])(
    "AC-AUTH-3: a %j (%s) username fails on the username field",
    (username) => {
      const result = validateCredentials({ username, password: "long enough password" });
      expect(result).toMatchObject({ ok: false, field: "username" });
    },
  );

  it("AC-AUTH-3: a password shorter than the minimum fails on the password field, and the message states the minimum", () => {
    const result = validateCredentials({ username: "ada", password: "x".repeat(MIN_PASSWORD_LENGTH - 1) });
    expect(result).toMatchObject({ ok: false, field: "password" });
    if (result.ok) throw new Error("unreachable");
    expect(result.message).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("AC-AUTH-3: the password is compared as typed, not trimmed", () => {
    const padded = " ".repeat(MIN_PASSWORD_LENGTH);
    expect(validateCredentials({ username: "ada", password: padded })).toEqual({ ok: true, username: "ada" });
  });

  it("AM-11: the rule shown on the page states the minimum length", () => {
    expect(CREDENTIAL_RULE).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
