/**
 * HTTP contract for the simulated API — frozen at T-01 (`docs/TASKS.md`).
 * Read by T-06 (Route Handlers and upstream), T-07 (client) and T-08
 * (optimistic mutations). Types and constants only; no behaviour.
 *
 * Shape, per ADR-0004 as amended by ARCH-03:
 *
 *   browser ──fetch──▶ Route Handler (holds the key) ──call──▶ Upstream (demands it)
 *
 * The browser's request carries **no key field and no key header**
 * (`AC-API-3`). The Route Handler reads the key from server environment and
 * presents it to the in-process {@link Upstream}, then passes the upstream's
 * status and body through unchanged (`AC-API-4`).
 *
 * Request-body validation lives with the Route Handler (T-06). Build it from
 * the field schemas exported by `lib/tasks/schema.ts` rather than redeclaring
 * the rules, so the API and the persistence layer agree on what a task is.
 */
import type { Task, TaskId } from "@/types/task";

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/**
 * The server's representation of a task: everything the client persists and
 * nothing about sync. `SyncState` is a client runtime concern and never
 * crosses the wire.
 */
export type ApiTask = Omit<Task, "sync">;

/** `POST /api/tasks` and `DELETE /api/tasks/:id`. */
export const TASKS_ENDPOINT = "/api/tasks";

/** Path for the single-task endpoint; `id` is URL-encoded. */
export function taskEndpoint(id: TaskId): string {
  return `${TASKS_ENDPOINT}/${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------
// POST /api/tasks — create
// ---------------------------------------------------------------------------

/**
 * The browser's create request. `id` and `createdAt` are client-generated
 * and the server **echoes** both, assigning nothing, so the optimistic row
 * keeps its key and its sort position on reconcile (`AC-API-8`). A new task
 * is always incomplete, so `completed` is not sent.
 */
export interface CreateTaskRequest {
  id: TaskId;
  title: string;
  /** `YYYY-MM-DD` */
  dueDate: string;
  /** ISO-8601 */
  createdAt: string;
}

/** `201 Created`. `task.id` and `task.createdAt` equal the request's. */
export interface CreateTaskResponse {
  task: ApiTask;
}

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id — delete
// ---------------------------------------------------------------------------

/** `200 OK`. Echoes the deleted id so the client reconciles by identity. */
export interface DeleteTaskResponse {
  id: TaskId;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Error codes, one per failure the brief and the criteria name.
 *
 * - `invalid_request` — `400`, the Route Handler rejected the body. Never retried.
 * - `unauthorized`    — `401`, the upstream rejected a missing or wrong key
 *   (`AC-API-4`). A configuration error on the server; never retried.
 * - `rate_limited`    — `429`, the upstream's fixed-window allowance is
 *   exhausted (`AC-API-5`). Carries `Retry-After`; retried with backoff and
 *   full jitter (`AC-API-6`), within a bounded budget (`AC-API-7`).
 * - `upstream_error`  — `500`/`503`, a scripted failure from the simulation
 *   config (`AC-API-10`). Generic failure, distinguishable from rate limiting
 *   (`AC-API-12`).
 */
export type ApiErrorCode = "invalid_request" | "unauthorized" | "rate_limited" | "upstream_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Human-readable, safe to show. Never contains the key. */
    message: string;
    /**
     * Present on `rate_limited` only; mirrors the `Retry-After` header in
     * whole seconds so a client that cannot read headers still has it.
     */
    retryAfterSeconds?: number;
  };
}

/** Statuses the Route Handler itself produces before calling the upstream. */
export type RouteHandlerErrorStatus = 400;

/** Statuses the upstream produces; passed through unchanged by the Route Handler. */
export type UpstreamErrorStatus = 401 | 429 | 500 | 503;

export type ApiErrorStatus = RouteHandlerErrorStatus | UpstreamErrorStatus;

/**
 * The `Retry-After` contract (`AC-API-5`, `AC-API-6`): on `429` the response
 * carries this header with a **delay in whole seconds** (never an HTTP-date).
 * The client waits at least that long before its first retry, then backs off
 * exponentially with full jitter.
 */
export const RETRY_AFTER_HEADER = "Retry-After";

// ---------------------------------------------------------------------------
// The upstream — the third-party API the brief describes
// ---------------------------------------------------------------------------

/**
 * What the Route Handler presents to the upstream. `apiKey` is `undefined`
 * when the server environment lacks the key, which the upstream answers with
 * `401` and the Route Handler passes through to the browser (`AC-API-4`).
 */
export interface UpstreamCredentials {
  apiKey: string | undefined;
}

export type UpstreamSuccess<TBody> = {
  ok: true;
  status: 200 | 201;
  body: TBody;
};

export type UpstreamFailure = {
  ok: false;
  status: UpstreamErrorStatus;
  body: ApiErrorBody;
  /** Set on `429`; the Route Handler emits it as the `Retry-After` header. */
  retryAfterSeconds?: number;
};

export type UpstreamResult<TBody> = UpstreamSuccess<TBody> | UpstreamFailure;

/**
 * Implemented by `lib/server/upstream.ts` (T-06) and called only from Route
 * Handlers, on the server. It persists nothing: `localStorage` remains the
 * system of record. Latency, the rate-limit window and scripted failures come
 * from `lib/api/config.ts` — never from `Math.random()` (`AC-API-10`).
 */
export interface Upstream {
  /** `201` on success, echoing `request.id` and `request.createdAt`. */
  createTask(
    request: CreateTaskRequest,
    credentials: UpstreamCredentials,
  ): Promise<UpstreamResult<CreateTaskResponse>>;
  /** `200` on success, echoing `id`. */
  deleteTask(id: TaskId, credentials: UpstreamCredentials): Promise<UpstreamResult<DeleteTaskResponse>>;
}
