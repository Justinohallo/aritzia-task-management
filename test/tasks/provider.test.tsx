import { act, render, renderHook, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";

import { useTaskDispatch, useTasks, useTasksHydrated } from "@/lib/tasks/hooks";
import { TasksProvider } from "@/lib/tasks/provider";
import { STORAGE_KEY } from "@/lib/tasks/schema";
import { toEnvelope } from "@/lib/tasks/storage";
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

function List() {
  const tasks = useTasks();
  const hydrated = useTasksHydrated();
  return (
    <ul data-hydrated={hydrated}>
      {tasks.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}

function useTasksApi() {
  return { tasks: useTasks(), hydrated: useTasksHydrated(), dispatch: useTaskDispatch() };
}

function renderApi(storage: Storage) {
  return renderHook(useTasksApi, {
    wrapper: ({ children }) => <TasksProvider storage={storage}>{children}</TasksProvider>,
  });
}

function seeded(tasks: Task[]): Storage {
  return memoryStorage({ [STORAGE_KEY]: JSON.stringify(toEnvelope(tasks)) });
}

describe("TasksProvider", () => {
  it("AC-STATE-1: components read state and dispatch through the typed hooks", () => {
    const { result } = renderApi(memoryStorage());
    expect(result.current.tasks).toEqual([]);
    act(() => result.current.dispatch({ type: "add/optimistic", task: makeTask() }));
    expect(result.current.tasks.map((t) => t.title)).toEqual(["Write the reducer tests"]);
  });

  it("AC-STATE-1: the hooks throw a pointed error outside the provider", () => {
    const silence = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useTasks())).toThrow(/useTasks must be used within <TasksProvider>/);
      expect(() => renderHook(() => useTaskDispatch())).toThrow(/useTaskDispatch must be used within/);
      expect(() => renderHook(() => useTasksHydrated())).toThrow(/useTasksHydrated must be used within/);
    } finally {
      silence.mockRestore();
    }
  });

  it("AC-STATE-1: dispatch is referentially stable across state changes", () => {
    const { result } = renderApi(memoryStorage());
    const first = result.current.dispatch;
    act(() => first({ type: "add/optimistic", task: makeTask() }));
    expect(result.current.dispatch).toBe(first);
  });

  it("AC-STATE-2: package.json names no full-fledged store", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const forbidden = /redux|zustand|mobx|recoil|jotai/i;
    expect(names.filter((n) => forbidden.test(n))).toEqual([]);
  });

  it("AC-STATE-3: a valid stored list is restored into state on mount", () => {
    render(
      <TasksProvider storage={seeded([makeTask(), makeOtherTask()])}>
        <List />
      </TasksProvider>,
    );
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Write the reducer tests",
      "Ship the provider",
    ]);
    expect(screen.getByRole("list")).toHaveAttribute("data-hydrated", "true");
  });

  it("AC-STATE-4: add, complete and delete are each written to storage", () => {
    const storage = memoryStorage();
    const setItem = jest.spyOn(storage, "setItem");
    const { result } = renderApi(storage);
    const task = makeTask();
    const stored = () => JSON.parse(storage.getItem(STORAGE_KEY) as string).tasks;

    act(() => result.current.dispatch({ type: "add/optimistic", task }));
    expect(stored()).toEqual([expect.objectContaining({ id: task.id, completed: false })]);

    act(() => result.current.dispatch({ type: "setCompleted", id: task.id, completed: true }));
    expect(stored()).toEqual([expect.objectContaining({ id: task.id, completed: true })]);

    act(() => result.current.dispatch({ type: "remove/optimistic", id: task.id }));
    expect(stored()).toEqual([]);
    expect(setItem).toHaveBeenCalledTimes(3);
  });

  it("AC-STATE-4: hydration itself never writes back to storage", () => {
    const storage = seeded([makeTask()]);
    const setItem = jest.spyOn(storage, "setItem");
    renderApi(storage);
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["valid JSON, wrong shape", JSON.stringify({ items: [makeTask()] })],
    ["an unknown version", JSON.stringify({ version: 999, tasks: [makeTask()] })],
  ])("AC-STATE-5: with %s in storage the app renders an empty list without throwing", (_l, raw) => {
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    expect(() =>
      render(
        <TasksProvider storage={storage}>
          <List />
        </TasksProvider>,
      ),
    ).not.toThrow();
    expect(screen.queryAllByRole("listitem")).toEqual([]);
    expect(screen.getByRole("list")).toHaveAttribute("data-hydrated", "true");
    // The fail-safe read is not written back: the corrupt value stays recoverable.
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("AC-STATE-6: server rendering touches no storage and matches the first client render", () => {
    const storage = seeded([makeTask()]);
    const getItem = jest.spyOn(storage, "getItem");
    const tree = (
      <TasksProvider storage={storage}>
        <List />
      </TasksProvider>
    );

    const html = renderToString(tree);
    expect(getItem).not.toHaveBeenCalled();
    expect(html).toContain('data-hydrated="false"');
    expect(html).not.toContain("<li");

    // Hydrating the server markup on the client reports no mismatch, then
    // the post-mount read fills the list in.
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);
      render(tree, { container, hydrate: true });
      expect(errors).not.toHaveBeenCalled();
      expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
      expect(container.querySelectorAll("li")).toHaveLength(1);
      container.remove();
    } finally {
      errors.mockRestore();
    }
  });

  it("AC-STATE-6: reading window.localStorage happens after mount, not during render", () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem");
    let readsDuringRender = 0;
    function Probe() {
      readsDuringRender = getItem.mock.calls.length;
      return null;
    }
    try {
      render(
        <TasksProvider>
          <Probe />
        </TasksProvider>,
      );
      expect(readsDuringRender).toBe(0);
      expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
    } finally {
      getItem.mockRestore();
    }
  });

  it("AC-AUTH-10: the task list outlives the session — logout, log back in, tasks remain", () => {
    // Session one: authenticated, create tasks.
    window.sessionStorage.setItem("auth", "session-one");
    const first = renderApi(undefined as unknown as Storage);
    act(() => first.result.current.dispatch({ type: "add/optimistic", task: makeTask() }));
    act(() => first.result.current.dispatch({ type: "add/optimistic", task: makeOtherTask() }));
    first.unmount();

    // Logout: the session-scoped store is cleared; the semi-persistent one is not.
    window.sessionStorage.clear();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    // Log back in, fresh mount.
    window.sessionStorage.setItem("auth", "session-two");
    const second = renderApi(undefined as unknown as Storage);
    expect(second.result.current.tasks.map((t) => t.title)).toEqual([
      "Write the reducer tests",
      "Ship the provider",
    ]);
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
});
