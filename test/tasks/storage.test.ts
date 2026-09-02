import { STORAGE_KEY, STORAGE_VERSION } from "@/lib/tasks/schema";
import { parseStoredTasks, readTasks, toEnvelope, writeTasks } from "@/lib/tasks/storage";
import type { Task } from "@/types/task";

/** A valid task; override fields per case. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "0f1e2d3c-4b5a-4c6d-8e7f-a0b1c2d3e4f5",
    title: "Write the reducer tests",
    dueDate: "2026-09-03",
    completed: false,
    createdAt: "2026-09-02T10:00:00.000Z",
    sync: "confirmed",
    ...overrides,
  };
}

/** A second, distinct task. */
function makeOtherTask(overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d",
    title: "Ship the provider",
    dueDate: "2026-09-04",
    createdAt: "2026-09-02T11:00:00.000Z",
    ...overrides,
  });
}

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

describe("storage adapter", () => {
  describe("AC-STATE-3: reads a valid envelope back as tasks", () => {
    it("AC-STATE-3: restores every task, each marked confirmed", () => {
      const stored = JSON.stringify(toEnvelope([makeTask(), makeOtherTask({ completed: true })]));
      const tasks = readTasks(memoryStorage({ [STORAGE_KEY]: stored }));
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.title)).toEqual(["Write the reducer tests", "Ship the provider"]);
      expect(tasks[1].completed).toBe(true);
      expect(tasks.every((t) => t.sync === "confirmed")).toBe(true);
    });

    it("AC-STATE-3: a stray persisted `sync` is ignored, not trusted", () => {
      const raw = JSON.stringify({
        version: STORAGE_VERSION,
        tasks: [{ ...makeTask(), sync: "syncing" }],
      });
      expect(parseStoredTasks(raw)[0].sync).toBe("confirmed");
    });

    it("AC-STATE-3: an absent key reads as an empty list", () => {
      expect(readTasks(memoryStorage())).toEqual([]);
    });
  });

  describe("AC-STATE-5: corrupt stored state fails safe to an empty list", () => {
    it.each([
      ["malformed JSON", "{not json"],
      ["a JSON string", JSON.stringify("tasks")],
      ["a bare array (last month's shape)", JSON.stringify([makeTask()])],
      ["valid JSON, wrong shape", JSON.stringify({ items: [makeTask()] })],
      ["an unknown version", JSON.stringify({ version: STORAGE_VERSION + 1, tasks: [makeTask()] })],
      ["a missing version", JSON.stringify({ tasks: [makeTask()] })],
    ])("AC-STATE-5: %s renders an empty list rather than throwing", (_label, raw) => {
      expect(() => parseStoredTasks(raw)).not.toThrow();
      expect(parseStoredTasks(raw)).toEqual([]);
    });

    it("AC-STATE-5: one invalid task empties the whole list, never a partial list", () => {
      const raw = JSON.stringify({
        version: STORAGE_VERSION,
        tasks: [makeTask(), { ...makeOtherTask(), dueDate: "tomorrow" }],
      });
      expect(parseStoredTasks(raw)).toEqual([]);
    });

    it("AC-STATE-5: a storage whose getItem throws reads as empty", () => {
      const broken = memoryStorage();
      broken.getItem = () => {
        throw new Error("SecurityError");
      };
      expect(readTasks(broken)).toEqual([]);
    });
  });

  describe("AC-STATE-4: writes a versioned envelope", () => {
    it("AC-STATE-4: the written value round-trips and omits sync", () => {
      const storage = memoryStorage();
      expect(writeTasks([makeTask({ sync: "syncing" })], storage)).toBe(true);
      const raw = storage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const json = JSON.parse(raw as string);
      expect(json.version).toBe(STORAGE_VERSION);
      expect(json.tasks[0]).not.toHaveProperty("sync");
      expect(readTasks(storage)).toEqual([makeTask({ sync: "confirmed" })]);
    });

    it("AC-STATE-4: a storage that refuses the write reports false, never throws", () => {
      const full = memoryStorage();
      full.setItem = () => {
        throw new Error("QuotaExceededError");
      };
      expect(() => writeTasks([makeTask()], full)).not.toThrow();
      expect(writeTasks([makeTask()], full)).toBe(false);
    });
  });
});
