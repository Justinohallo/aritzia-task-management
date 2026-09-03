import { initialTasksState, isPersistingAction, tasksReducer } from "@/lib/tasks/reducer";
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

describe("tasksReducer", () => {
  const a = makeTask();
  const b = makeOtherTask();

  it("AC-STATE-1: is a pure function of state and action", () => {
    expect(initialTasksState).toEqual([]);
    const state = [a, b];
    const next = tasksReducer(state, { type: "setCompleted", id: a.id, completed: true });
    expect(state).toEqual([a, b]);
    expect(next).toEqual([{ ...a, completed: true }, b]);
  });

  it("AC-STATE-3: hydrate replaces the whole list", () => {
    expect(tasksReducer([a], { type: "hydrate", tasks: [b] })).toEqual([b]);
    expect(tasksReducer([a], { type: "hydrate", tasks: [] })).toEqual([]);
  });

  it("AC-STATE-1: setCompleted toggles by id", () => {
    let s = tasksReducer([a, b], { type: "setCompleted", id: a.id, completed: true });
    expect(s.map((t) => [t.id, t.completed])).toEqual([
      [a.id, true],
      [b.id, false],
    ]);
    s = tasksReducer(s, { type: "setCompleted", id: b.id, completed: true });
    expect(s.map((t) => t.completed)).toEqual([true, true]);
  });

  it("AC-STATE-1: setCompleted on an unknown id returns the same state", () => {
    const s = [a];
    expect(tasksReducer(s, { type: "setCompleted", id: b.id, completed: true })).toBe(s);
  });

  describe("T-08 optimistic lifecycle", () => {
    const syncing = makeOtherTask({ sync: "syncing" });

    it("AC-API-8: add/optimistic appends the row as syncing before any response, and is idempotent by id", () => {
      const s = tasksReducer([a], { type: "add/optimistic", task: makeOtherTask({ sync: "confirmed" }) });
      expect(s).toEqual([a, syncing]);
      expect(tasksReducer(s, { type: "add/optimistic", task: b })).toBe(s);
    });

    it("AC-API-8: add/confirm reconciles in place by id — same id, same createdAt, same position — and marks it confirmed", () => {
      const s = [syncing, a];
      const echo = { id: b.id, title: b.title, dueDate: b.dueDate, completed: false, createdAt: b.createdAt };
      const next = tasksReducer(s, { type: "add/confirm", id: b.id, task: echo });
      expect(next.map((t) => t.id)).toEqual([b.id, a.id]);
      expect(next[0]).toEqual({ ...b, sync: "confirmed" });
      expect(next[1]).toBe(a);
    });

    it("AC-API-8: add/confirm keeps the local id, createdAt and completed even if the server's echo differed", () => {
      const ticked = { ...syncing, completed: true };
      const drifted = { id: "server-assigned", title: b.title, dueDate: b.dueDate, completed: false, createdAt: "2099-01-01T00:00:00.000Z" };
      const [row] = tasksReducer([ticked], { type: "add/confirm", id: b.id, task: drifted });
      expect(row).toMatchObject({ id: b.id, createdAt: b.createdAt, completed: true, sync: "confirmed" });
    });

    it("add/rollback removes the provisional row", () => {
      const s = tasksReducer([a, syncing], { type: "add/rollback", id: b.id });
      expect(s).toEqual([a]);
      expect(tasksReducer(s, { type: "add/rollback", id: b.id })).toBe(s);
    });

    it("AC-API-9: remove/optimistic drops the row at once; remove/rollback restores the prior record as confirmed", () => {
      const s = [a, b];
      const removed = tasksReducer(s, { type: "remove/optimistic", id: a.id });
      expect(removed).toEqual([b]);
      const restored = tasksReducer(removed, { type: "remove/rollback", task: { ...a, sync: "syncing" } });
      expect(restored).toEqual([b, { ...a, sync: "confirmed" }]);
      // Position is not the reducer's concern: order is derived at render (`AC-LIST-3`).
      expect(tasksReducer(restored, { type: "remove/rollback", task: a })).toBe(restored);
    });

    it("AC-STATE-4: the optimistic apply, confirm and rollback actions persist", () => {
      expect(isPersistingAction({ type: "add/optimistic", task: b })).toBe(true);
      expect(isPersistingAction({ type: "add/confirm", id: b.id, task: b })).toBe(true);
      expect(isPersistingAction({ type: "add/rollback", id: b.id })).toBe(true);
      expect(isPersistingAction({ type: "remove/optimistic", id: a.id })).toBe(true);
      expect(isPersistingAction({ type: "remove/rollback", task: a })).toBe(true);
    });
  });

  it("AC-STATE-4: only the user mutations persist; hydrate never does", () => {
    expect(isPersistingAction({ type: "add/optimistic", task: a })).toBe(true);
    expect(isPersistingAction({ type: "setCompleted", id: a.id, completed: true })).toBe(true);
    expect(isPersistingAction({ type: "remove/optimistic", id: a.id })).toBe(true);
    expect(isPersistingAction({ type: "hydrate", tasks: [a] })).toBe(false);
  });
});
