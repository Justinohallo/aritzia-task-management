"use client";

/**
 * Task state provider (ADR-0002; `AC-STATE-1`, `AC-STATE-3..6`). One
 * `useReducer` behind two contexts, state and dispatch, so a component that
 * only dispatches does not re-render on every change; the contexts are not
 * exported, only the typed hooks below. Hydration happens in an effect
 * after mount, so the first render agrees on server and client and no
 * browser API is touched during render (`AC-STATE-6`). `hydrated` tells
 * consumers whether the list is real yet, so they can show a skeleton
 * instead of a misleading empty state.
 */
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from "react";

import type { TaskAction } from "@/lib/tasks/actions";
import { initialTasksState, isPersistingAction, tasksReducer, type TasksState } from "@/lib/tasks/reducer";
import { readTasks, writeTasks } from "@/lib/tasks/storage";

export type TaskDispatch = (action: TaskAction) => void;

export interface TasksContextValue {
  tasks: TasksState;
  hydrated: boolean; // false until the post-mount read of localStorage has been applied
}

export const TasksStateContext = createContext<TasksContextValue | null>(null); // @internal, read through useTasks()
export const TasksDispatchContext = createContext<TaskDispatch | null>(null); // @internal, read through useTaskDispatch()

export interface TasksProviderProps {
  children: ReactNode;
  storage?: Storage; // override the read/written storage; unset resolves window.localStorage
}

export function TasksProvider({ children, storage }: TasksProviderProps) {
  const [tasks, rawDispatch] = useReducer(tasksReducer, initialTasksState);
  const [hydrated, markHydrated] = useReducer(() => true, false);

  // Set when the action changes user data; hydrate never sets it, so a fail-safe read is never written back over recoverable data (ADR-0002).
  const pendingWrite = useRef(false);

  const dispatch = useCallback<TaskDispatch>((action) => {
    if (isPersistingAction(action)) pendingWrite.current = true;
    rawDispatch(action);
  }, []);

  useEffect(() => {
    rawDispatch({ type: "hydrate", tasks: readTasks(storage) }); // post-mount only: a browser API, kept out of render
    markHydrated();
  }, [storage]);

  useEffect(() => {
    if (!pendingWrite.current) return;
    pendingWrite.current = false;
    writeTasks(tasks, storage);
  }, [tasks, storage]);

  return (
    <TasksStateContext.Provider value={{ tasks, hydrated }}>
      <TasksDispatchContext.Provider value={dispatch}>{children}</TasksDispatchContext.Provider>
    </TasksStateContext.Provider>
  );
}

// --- Typed access: throws a pointed error at the first render outside `<TasksProvider>` ---

function missing(hook: string): never {
  throw new Error(`${hook} must be used within <TasksProvider>. Mount it in a layout above this component.`);
}

function useTasksContext(hook: string): TasksContextValue {
  return useContext(TasksStateContext) ?? missing(hook);
}

export function useTasks(): TasksState {
  return useTasksContext("useTasks").tasks; // empty until hydrated; see useTasksHydrated
}

export function useTasksHydrated(): boolean {
  return useTasksContext("useTasksHydrated").hydrated;
}

/** Stable across renders; safe in effect dependency lists. */
export function useTaskDispatch(): TaskDispatch {
  return useContext(TasksDispatchContext) ?? missing("useTaskDispatch");
}
