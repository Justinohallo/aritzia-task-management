"use client";

/**
 * Optimistic mutations — T-08 (ADR-0004; `AC-API-1..2`, `AC-API-7..9`,
 * `AC-API-11..12`, `AC-ADD-8`, `AC-DEL-2`).
 *
 * One function per mutation, each the whole apply → call → reconcile /
 * rollback sequence, so the components stay thin and the ordering is
 * testable without rendering. Everything a sequence touches is injected
 * through {@link MutationDeps}: the reducer's `dispatch`, the typed API
 * `client` (ADR-0004, T-07) and the one `announce` (`components/ui/live-region.tsx`).
 *
 *   createTask:  add/optimistic ─▶ POST ─┬─ 201 ─▶ add/confirm      (`AC-API-8`)
 *                                        └─ fail ─▶ add/rollback     (`AC-API-7`)
 *   deleteTask:  remove/optimistic ─▶ DELETE ─┬─ 200 ─▶ (nothing to reconcile)
 *                                             └─ fail ─▶ remove/rollback (`AC-API-9`)
 *
 * The in-flight state, the outcome and every failure are announced through
 * the live region, so assistive technology hears what the row shows
 * (`AC-API-11`, `AC-DEL-2`). A failure after the retry budget is spent is a
 * {@link RateLimitedError}, and its message names rate limiting and says
 * the action can be retried shortly; every other failure is worded
 * generically (`AC-API-7`, `AC-API-12`). Neither function throws: the
 * result says what happened, and the component decides what to show.
 *
 * {@link useTaskMutations} binds the two to the provider's dispatch, the
 * announcer and the default client. Tests substitute the client through
 * {@link ApiClientContext} — a client with an instant `sleep` and a fixed
 * jitter draw — so a rate-limit test runs in milliseconds (`AC-API-10`).
 */
import { createContext, useContext, useMemo } from "react";

import { useAnnounce, type Announce } from "@/components/ui/live-region";
import { RateLimitedError, apiClient, type ApiClient } from "@/lib/api/client";
import { useTaskDispatch } from "@/lib/tasks/hooks";
import type { TaskDispatch } from "@/lib/tasks/provider";
import type { CreateTaskRequest } from "@/types/api";
import type { Task } from "@/types/task";

// ---------------------------------------------------------------------------
// Results and messages
// ---------------------------------------------------------------------------

export type FailureKind = "rate_limited" | "generic";

export interface MutationFailure {
  kind: FailureKind;
  /** Safe to show; the same text the live region announced. */
  message: string;
  /** The underlying error, for logging. Never shown. */
  error: unknown;
}

export type MutationResult = { ok: true } | { ok: false; failure: MutationFailure };

export type MutationVerb = "add" | "delete";

/**
 * The message for a failed mutation. A {@link RateLimitedError} — the retry
 * budget spent on `429`s — names rate limiting and says when to try again;
 * anything else (`5xx`, `401`, a timeout, no network) is generic, and does
 * not claim to know why (`AC-API-12`).
 */
export function describeFailure(verb: MutationVerb, task: Task, error: unknown): MutationFailure {
  const attempted = verb === "add" ? `add "${task.title}"` : `delete "${task.title}"`;
  const rolledBack = verb === "add" ? "It was not saved." : "It has been put back in the list.";

  if (error instanceof RateLimitedError) {
    const when =
      error.retryAfterSeconds === undefined
        ? "Try again in a few seconds."
        : `Try again in about ${Math.max(1, Math.ceil(error.retryAfterSeconds))} seconds.`;
    return {
      kind: "rate_limited",
      message: `Could not ${attempted}: the server is rate limiting requests. ${rolledBack} ${when}`,
      error,
    };
  }

  return {
    kind: "generic",
    message: `Could not ${attempted}: the request failed. ${rolledBack} Please try again.`,
    error,
  };
}

// ---------------------------------------------------------------------------
// The sequences
// ---------------------------------------------------------------------------

export interface MutationDeps {
  dispatch: TaskDispatch;
  client: ApiClient;
  announce: Announce;
}

/** The wire request for a task: exactly the contract's fields, nothing runtime. */
export function toCreateRequest(task: Task): CreateTaskRequest {
  return { id: task.id, title: task.title, dueDate: task.dueDate, createdAt: task.createdAt };
}

/**
 * Optimistic create (`AC-API-1`, `AC-API-8`). The row appears as `syncing`
 * before the request is sent, is reconciled by `id` on `201`, and is
 * removed on final failure (`AC-API-7`). Never throws.
 */
export async function createTask({ dispatch, client, announce }: MutationDeps, task: Task): Promise<MutationResult> {
  dispatch({ type: "add/optimistic", task });
  announce(`Adding "${task.title}"…`);

  try {
    const response = await client.createTask(toCreateRequest(task));
    dispatch({ type: "add/confirm", id: task.id, task: response.task });
    announce(`"${task.title}" added.`);
    return { ok: true };
  } catch (error) {
    const failure = describeFailure("add", task, error);
    dispatch({ type: "add/rollback", id: task.id });
    announce(failure.message, { assertive: true });
    return { ok: false, failure };
  }
}

/**
 * Optimistic delete (`AC-API-2`, `AC-API-9`). The row disappears before the
 * request is sent; on final failure the prior record — held here, not in
 * the reducer — is restored, and its position follows from `AC-LIST-3`.
 * Success is announced (`AC-DEL-2`). Never throws.
 */
export async function deleteTask({ dispatch, client, announce }: MutationDeps, task: Task): Promise<MutationResult> {
  dispatch({ type: "remove/optimistic", id: task.id });
  announce(`Deleting "${task.title}"…`);

  try {
    await client.deleteTask(task.id);
    announce(`"${task.title}" deleted.`);
    return { ok: true };
  } catch (error) {
    const failure = describeFailure("delete", task, error);
    dispatch({ type: "remove/rollback", task });
    announce(failure.message, { assertive: true });
    return { ok: false, failure };
  }
}

// ---------------------------------------------------------------------------
// Binding to React
// ---------------------------------------------------------------------------

/**
 * The client the components call. Defaults to the real one, so the app
 * mounts no provider; a test wraps its tree in this context with a client
 * whose timers and jitter are in hand.
 */
export const ApiClientContext = createContext<ApiClient>(apiClient);

export interface TaskMutations {
  createTask: (task: Task) => Promise<MutationResult>;
  deleteTask: (task: Task) => Promise<MutationResult>;
}

/** The two sequences, bound to this tree's dispatch, client and announcer. Stable across renders. */
export function useTaskMutations(): TaskMutations {
  const dispatch = useTaskDispatch();
  const client = useContext(ApiClientContext);
  const announce = useAnnounce();

  return useMemo(() => {
    const deps: MutationDeps = { dispatch, client, announce };
    return {
      createTask: (task) => createTask(deps, task),
      deleteTask: (task) => deleteTask(deps, task),
    };
  }, [dispatch, client, announce]);
}
