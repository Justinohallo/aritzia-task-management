import { act, renderHook } from "@testing-library/react";

import { AuthProvider, useAuth } from "@/components/auth/provider";
import { AUTH_STORAGE_KEY, AUTH_STORAGE_VERSION, writeSession } from "@/lib/auth/session";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

const NOW = new Date("2026-09-02T09:00:00.000Z");

function renderAuth(storage: Storage) {
  return renderHook(useAuth, {
    wrapper: ({ children }) => (
      <AuthProvider storage={storage} now={() => NOW}>
        {children}
      </AuthProvider>
    ),
  });
}

describe("AuthProvider", () => {
  it("throws a pointed error outside the provider", () => {
    const silence = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useAuth())).toThrow(/useAuth must be used within <AuthProvider>/);
    } finally {
      silence.mockRestore();
    }
  });

  it("AC-AUTH-7: status is unknown during the first render and resolves only after the post-mount read", () => {
    const storage = memoryStorage();
    const getItem = jest.spyOn(storage, "getItem");
    const seen: string[] = [];
    function Probe() {
      const { status } = useAuth();
      seen.push(status);
      return null;
    }
    renderHook(() => null, {
      wrapper: ({ children }) => (
        <AuthProvider storage={storage}>
          <Probe />
          {children}
        </AuthProvider>
      ),
    });
    expect(seen[0]).toBe("unknown");
    expect(seen[seen.length - 1]).toBe("unauthenticated");
    expect(getItem).toHaveBeenCalledWith(AUTH_STORAGE_KEY);
  });

  it("AC-AUTH-4: a record already in storage is read on mount as an authenticated session", () => {
    const storage = memoryStorage();
    writeSession({ version: AUTH_STORAGE_VERSION, username: "ada", authenticatedAt: NOW.toISOString() }, storage);
    const { result } = renderAuth(storage);
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.username).toBe("ada");
  });

  it("AC-AUTH-2: a valid login writes the record and flips status to authenticated", () => {
    const storage = memoryStorage();
    const { result } = renderAuth(storage);
    let outcome;
    act(() => {
      outcome = result.current.login({ username: " ada ", password: "correct horse" });
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.status).toBe("authenticated");
    expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY) as string)).toEqual({
      version: AUTH_STORAGE_VERSION,
      username: "ada",
      authenticatedAt: NOW.toISOString(),
    });
  });

  it("AC-AUTH-3: an invalid login returns the failing field and writes nothing", () => {
    const storage = memoryStorage();
    const setItem = jest.spyOn(storage, "setItem");
    const { result } = renderAuth(storage);
    let outcome;
    act(() => {
      outcome = result.current.login({ username: "ada", password: "short" });
    });
    expect(outcome).toMatchObject({ ok: false, field: "password" });
    expect(result.current.status).toBe("unauthenticated");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("AC-AUTH-2: a storage that refuses the write leaves the user signed out with an explanation", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    const { result } = renderAuth(storage);
    let outcome;
    act(() => {
      outcome = result.current.login({ username: "ada", password: "correct horse" });
    });
    expect(outcome).toMatchObject({ ok: false, message: expect.stringMatching(/session storage/i) });
    expect(result.current.status).toBe("unauthenticated");
  });

  it("AC-AUTH-6: logout removes the record and flips status to unauthenticated", () => {
    const storage = memoryStorage();
    const { result } = renderAuth(storage);
    act(() => void result.current.login({ username: "ada", password: "correct horse" }));
    act(() => result.current.logout());
    expect(result.current.status).toBe("unauthenticated");
    expect(result.current.user).toBeNull();
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("AC-AUTH-9: the password is never passed to storage in any form", () => {
    const password = "S3cret-passphrase!";
    const storage = memoryStorage();
    const { result } = renderAuth(storage);
    act(() => void result.current.login({ username: "ada", password }));
    const everything = [storage.getItem(AUTH_STORAGE_KEY) as string];
    const forms = [password, Buffer.from(password).toString("base64"), encodeURIComponent(password), password.toLowerCase()];
    for (const stored of everything) for (const form of forms) expect(stored).not.toContain(form);
  });
});
