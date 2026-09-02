import type { TaskAction } from "@/lib/tasks/actions";
import { initialTasksState, isPersistingAction, tasksReducer } from "@/lib/tasks/reducer";

import { makeOtherTask, makeTask } from "./fixtures";

describe("tasksReducer", () => {
  const a = makeTask();
  const b = makeOtherTask();

  it("AC-STATE-1: starts empty and is a pure function of state and action", () => {
    expect(initialTasksState).toEqual([]);
    const state = [a];
    const next = tasksReducer(state, { type: "add", task: b });
    expect(state).toEqual([a]);
    expect(next).toEqual([a, b]);
  });

  it("AC-STATE-3: hydrate replaces the whole list", () => {
    expect(tasksReducer([a], { type: "hydrate", tasks: [b] })).toEqual([b]);
    expect(tasksReducer([a], { type: "hydrate", tasks: [] })).toEqual([]);
  });

  it("AC-STATE-1: add appends; setCompleted toggles by id; remove drops by id", () => {
    let s = tasksReducer(initialTasksState, { type: "add", task: a });
    s = tasksReducer(s, { type: "add", task: b });
    s = tasksReducer(s, { type: "setCompleted", id: a.id, completed: true });
    expect(s.map((t) => [t.id, t.completed])).toEqual([
      [a.id, true],
      [b.id, false],
    ]);
    s = tasksReducer(s, { type: "remove", id: a.id });
    expect(s).toEqual([b]);
  });

  it("AC-STATE-1: setCompleted and remove on an unknown id return the same state", () => {
    const s = [a];
    expect(tasksReducer(s, { type: "setCompleted", id: b.id, completed: true })).toBe(s);
    expect(tasksReducer(s, { type: "remove", id: b.id })).toBe(s);
  });

  it("AC-STATE-1: the T-08 optimistic cases are handled as no-ops in wave 1", () => {
    const s = [a];
    const t08: TaskAction[] = [
      { type: "add/optimistic", task: b },
      { type: "add/confirm", id: a.id, task: a },
      { type: "add/rollback", id: a.id },
      { type: "remove/optimistic", id: a.id },
      { type: "remove/rollback", task: b },
      { type: "sync/set", id: a.id, sync: "failed" },
    ];
    for (const action of t08) expect(tasksReducer(s, action)).toBe(s);
  });

  it("AC-STATE-4: only the user mutations persist; hydrate never does", () => {
    expect(isPersistingAction({ type: "add", task: a })).toBe(true);
    expect(isPersistingAction({ type: "setCompleted", id: a.id, completed: true })).toBe(true);
    expect(isPersistingAction({ type: "remove", id: a.id })).toBe(true);
    expect(isPersistingAction({ type: "hydrate", tasks: [a] })).toBe(false);
  });
});
