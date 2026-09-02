"use client";

/**
 * Typed access to task state — T-03 (ADR-0002; `AC-STATE-1`).
 *
 * The only sanctioned way to read or change tasks. Each hook throws a
 * pointed error outside `<TasksProvider>`, which is where a missing
 * provider should surface: at the first render, with the fix in the message.
 */
import { useContext } from "react";

import {
  TasksDispatchContext,
  TasksStateContext,
  type TaskDispatch,
  type TasksContextValue,
} from "@/lib/tasks/provider";
import type { TasksState } from "@/lib/tasks/reducer";

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
