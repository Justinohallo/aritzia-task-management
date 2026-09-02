/**
 * @jest-environment node
 */
import { AUTH_STORAGE_VERSION, clearSession, readSession, writeSession } from "@/lib/auth/session";

describe("sessionStorage adapter on the server", () => {
  it("AC-AUTH-7: with no window there is no session, and nothing throws", () => {
    expect(typeof window).toBe("undefined");
    expect(readSession()).toBeNull();
    expect(
      writeSession({ version: AUTH_STORAGE_VERSION, username: "ada", authenticatedAt: "2026-09-02T09:00:00.000Z" }),
    ).toBe(false);
    expect(() => clearSession()).not.toThrow();
  });
});
