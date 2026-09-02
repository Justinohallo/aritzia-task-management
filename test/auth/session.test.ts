import {
  AUTH_STORAGE_KEY,
  AUTH_STORAGE_VERSION,
  clearSession,
  parseAuthRecord,
  readSession,
  writeSession,
  type AuthRecord,
} from "@/lib/auth/session";

/** An in-memory `Storage` so tests can inject and inspect writes. */
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

const record: AuthRecord = {
  version: AUTH_STORAGE_VERSION,
  username: "ada",
  authenticatedAt: "2026-09-02T09:00:00.000Z",
};

describe("sessionStorage adapter", () => {
  it("AC-AUTH-2: writes the auth record under the auth key and reads it back", () => {
    const storage = memoryStorage();
    expect(writeSession(record, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY) as string)).toEqual(record);
    expect(readSession(storage)).toEqual(record);
  });

  it("AC-AUTH-6: clearing removes the record and a later read reports no session", () => {
    const storage = memoryStorage();
    writeSession(record, storage);
    clearSession(storage);
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(readSession(storage)).toBeNull();
  });

  it("AC-AUTH-9: the record has no credential field, and a stray one is stripped on read", () => {
    expect(Object.keys(record).sort()).toEqual(["authenticatedAt", "username", "version"]);
    const smuggled = JSON.stringify({ ...record, password: "hunter22" });
    expect(parseAuthRecord(smuggled)).toEqual(record);
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["valid JSON, wrong shape", JSON.stringify({ user: "ada" })],
    ["an unknown version", JSON.stringify({ ...record, version: 999 })],
    ["an empty username", JSON.stringify({ ...record, username: "" })],
    ["a non-ISO timestamp", JSON.stringify({ ...record, authenticatedAt: "yesterday" })],
  ])("AC-AUTH-7: %s in storage reads as no session, without throwing", (_label, raw) => {
    expect(() => parseAuthRecord(raw)).not.toThrow();
    expect(parseAuthRecord(raw)).toBeNull();
    expect(readSession(memoryStorage({ [AUTH_STORAGE_KEY]: raw }))).toBeNull();
  });

  it("AC-AUTH-2: a storage that refuses the write is reported, not thrown", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    expect(writeSession(record, storage)).toBe(false);
    expect(() => clearSession(storage)).not.toThrow();
  });

  it("AC-AUTH-5: the adapter defaults to window.sessionStorage, never localStorage", () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    writeSession(record);
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(readSession()).toEqual(record);
    clearSession();
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });
});
