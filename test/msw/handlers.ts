/**
 * MSW handlers for `types/api.ts` — frozen at T-01 (`docs/TASKS.md`).
 *
 * {@link handlers} are the defaults, registered by `test/msw/server.ts` for
 * every test: create echoes, delete acknowledges. {@link handlersFor} builds
 * a scripted sequence — a `429` with a chosen `Retry-After`, then a `201`, … —
 * so T-07 and T-08 drive repeated rate limits through `server.use(...)`
 * without editing this file (ARCH-03, B-10).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import {
  RETRY_AFTER_HEADER,
  TASKS_ENDPOINT,
  type ApiErrorBody,
  type ApiErrorCode,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type DeleteTaskResponse,
  type UpstreamErrorStatus,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Scripted responses
// ---------------------------------------------------------------------------

export type ScriptedResponse =
  /** The default success: `201` echo on create, `200` on delete. */
  | { status: "ok" }
  | { status: 429; retryAfterSeconds: number }
  | { status: 401 }
  | { status: 500 | 503 };

/** Convenience constructors, so scripts read as sentences. */
export const ok = (): ScriptedResponse => ({ status: "ok" });
export const rateLimited = (retryAfterSeconds: number): ScriptedResponse => ({
  status: 429,
  retryAfterSeconds,
});
export const unauthorized = (): ScriptedResponse => ({ status: 401 });
export const serverError = (status: 500 | 503 = 500): ScriptedResponse => ({ status });

const ERROR_CODES: Record<UpstreamErrorStatus, ApiErrorCode> = {
  401: "unauthorized",
  429: "rate_limited",
  500: "upstream_error",
  503: "upstream_error",
};

function errorBody(status: UpstreamErrorStatus, retryAfterSeconds?: number): ApiErrorBody {
  const code = ERROR_CODES[status];
  const message =
    code === "rate_limited"
      ? `Rate limited; retry after ${retryAfterSeconds ?? 0}s`
      : code === "unauthorized"
        ? "The server is not configured with a valid API key"
        : "The upstream service failed";
  return {
    error: retryAfterSeconds === undefined ? { code, message } : { code, message, retryAfterSeconds },
  };
}

function errorResponse(scripted: Exclude<ScriptedResponse, { status: "ok" }>) {
  if (scripted.status === 429) {
    return HttpResponse.json(errorBody(429, scripted.retryAfterSeconds), {
      status: 429,
      headers: { [RETRY_AFTER_HEADER]: String(scripted.retryAfterSeconds) },
    });
  }
  return HttpResponse.json(errorBody(scripted.status), { status: scripted.status });
}

// ---------------------------------------------------------------------------
// Success responses — the contract's echo semantics
// ---------------------------------------------------------------------------

function created(request: CreateTaskRequest) {
  const body: CreateTaskResponse = {
    task: {
      id: request.id,
      title: request.title,
      dueDate: request.dueDate,
      createdAt: request.createdAt,
      completed: false,
    },
  };
  return HttpResponse.json(body, { status: 201 });
}

function deleted(id: string) {
  const body: DeleteTaskResponse = { id };
  return HttpResponse.json(body, { status: 200 });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handlers that follow `script` in order, one entry per request across both
 * endpoints, then succeed once the script is exhausted. Register with
 * `server.use(...handlersFor([rateLimited(2), rateLimited(1), ok()]))`.
 */
export function handlersFor(script: readonly ScriptedResponse[]): HttpHandler[] {
  const queue = [...script];
  const next = (): ScriptedResponse => queue.shift() ?? ok();

  return [
    http.post(TASKS_ENDPOINT, async ({ request }) => {
      const scripted = next();
      if (scripted.status !== "ok") return errorResponse(scripted);
      return created((await request.json()) as CreateTaskRequest);
    }),
    http.delete(`${TASKS_ENDPOINT}/:id`, ({ params }) => {
      const scripted = next();
      if (scripted.status !== "ok") return errorResponse(scripted);
      return deleted(String(params.id));
    }),
  ];
}

/** The defaults: every request succeeds. */
export const handlers: HttpHandler[] = handlersFor([]);
