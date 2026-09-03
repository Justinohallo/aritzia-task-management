"use client";

/**
 * Task state provider — T-03 (ADR-0002; `AC-STATE-1`, `AC-STATE-3..6`).
 *
 * One `useReducer` behind two contexts, state and dispatch, so a component
 * that only dispatches does not re-render on every change. The contexts are
 * not exported: components go through the typed hooks below.
 *
 * Hydration happens in an effect, after mount. The first render — on the
 * server and on the client — sees the same empty list, so the markup
 * agrees and no browser API is touched during render (`AC-STATE-6`).
 * `hydrated` tells consumers whether the list is real yet, so they can show
 * a skeleton instead of a misleading empty state.
 */
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from "react";

import type { TaskAction } from "@/lib/tasks/actions";
import { initialTasksState, isPersistingAction, tasksReducer, type TasksState } from "@/lib/tasks/reducer";
import { readTasks, writeTasks } from "@/lib/tasks/storage";

export type TaskDispatch = (action: TaskAction) => void;

export interface TasksContextValue {
  tasks: TasksState;
  /** `false` until the post-mount read of `localStorage` has been applied. */
  hydrated: boolean;
}

/** @internal Read through `useTasks()`; never import this directly. */
export const TasksStateContext = createContext<TasksContextValue | null>(null);
/** @internal Read through `useTaskDispatch()`; never import this directly. */
export const TasksDispatchContext = createContext<TaskDispatch | null>(null);

export interface TasksProviderProps {
  children: ReactNode;
  /**
   * Override the storage read and written. Tests inject a stub; the app
   * leaves it unset and the adapter resolves `window.localStorage` itself.
   */
  storage?: Storage;
}

export function TasksProvider({ children, storage }: TasksProviderProps) {
  const [tasks, rawDispatch] = useReducer(tasksReducer, initialTasksState);
  const [hydrated, markHydrated] = useReducer(() => true, false);

  // Set by the wrapped dispatch when the action changes user data; consumed
  // by the effect below once the reducer has produced the new state. Hydrate
  // never sets it, so a fail-safe read is never written back over the user's
  // recoverable data (ADR-0002).
  const pendingWrite = useRef(false);

  const dispatch = useCallback<TaskDispatch>((action) => {
    if (isPersistingAction(action)) pendingWrite.current = true;
    rawDispatch(action);
  }, []);

  useEffect(() => {
    // Post-mount only: the read is a browser API and must stay out of render.
    rawDispatch({ type: "hydrate", tasks: readTasks(storage) });
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

// ---------------------------------------------------------------------------
// Typed access — the only sanctioned way to read or change tasks. Each hook
// throws a pointed error outside `<TasksProvider>`, which is where a missing
// provider should surface: at the first render, with the fix in the message.
// ---------------------------------------------------------------------------

function missing(hook: string): never {
  throw new Error(`${hook} must be used within <TasksProvider>. Mount it in a layout above this component.`);
}

function useTasksContext(hook: string): TasksContextValue {
  return useContext(TasksStateContext) ?? missing(hook);
}

/** The task list. Empty until hydrated; see {@link useTasksHydrated}. */
export function useTasks(): TasksState {
  return useTasksContext("useTasks").tasks;
}

/** Whether the post-mount read of `localStorage` has been applied. */
export function useTasksHydrated(): boolean {
  return useTasksContext("useTasksHydrated").hydrated;
}

/** Stable across renders; safe in effect dependency lists. */
export function useTaskDispatch(): TaskDispatch {
  return useContext(TasksDispatchContext) ?? missing("useTaskDispatch");
}
