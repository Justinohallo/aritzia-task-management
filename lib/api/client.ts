/**
 * The typed API client (ADR-0004). `fetch` against the Route Handlers in
 * `types/api.ts`, with a per-request timeout chained to any caller signal;
 * on `429`, wait at least `Retry-After` then jittered backoff (`AC-API-6`)
 * within a bounded budget (`AC-API-7`); no retry of any other status, since
 * a `400`/`401` only repeats and a `5xx` is surfaced as-is for the caller
 * to message generically (`AC-API-12`); exhaustion surfaces as
 * {@link RateLimitedError}, distinct from every other failure.
 *
 * This module renders nothing and rolls nothing back — that is
 * `lib/tasks/mutations.ts`. Every source of non-determinism is injected
 * through {@link ApiClientOptions} (`AC-API-10`).
 */
import { canRetry, parseRetryAfter, retryDelayMs, DEFAULT_RETRY_CONFIG, type RetryConfig } from "@/lib/api/retry";
import {
  RETRY_AFTER_HEADER,
  TASKS_ENDPOINT,
  taskEndpoint,
  type ApiErrorBody,
  type ApiErrorCode,
  type CreateTaskRequest,
  type CreateTaskResponse,
  type DeleteTaskResponse,
} from "@/types/api";
import type { TaskId } from "@/types/task";

// --- Errors — one class per outcome the caller must tell apart ---

export class ApiClientError extends Error { // base of every failure the client throws; instanceof is the contract
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ApiError extends ApiClientError { // an error status the client does not retry
  readonly status: number;
  readonly code: ApiErrorCode | undefined;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error.message ?? `Request failed with status ${status}`);
    this.status = status;
    this.code = body?.error.code;
  }
}

/** The retry budget ran out on `429`s (`AC-API-7`); distinct from {@link ApiError} so the message can name rate limiting (`AC-API-12`). */
export class RateLimitedError extends ApiClientError {
  readonly status = 429 as const;
  readonly code = "rate_limited" as const;
  readonly retryAfterSeconds: number | undefined;
  readonly attempts: number; // including the first request

  constructor(retryAfterSeconds: number | undefined, attempts: number) {
    super(
      retryAfterSeconds === undefined
        ? `Rate limited after ${attempts} attempts`
        : `Rate limited after ${attempts} attempts; retry after ${retryAfterSeconds}s`,
    );
    this.retryAfterSeconds = retryAfterSeconds;
    this.attempts = attempts;
  }
}

export class TimeoutError extends ApiClientError { // exceeded timeoutMs; aborted by the client
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

export class AbortedError extends ApiClientError { // the caller's own signal aborted the request; never retried
  constructor() {
    super("Request aborted");
  }
}

export class NetworkError extends ApiClientError { // fetch itself rejected, no response at all; never retried
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Network request failed");
    this.cause = cause;
  }
}

// --- Client ---

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  fetch?: FetchLike; // defaults to the global fetch, looked up per call so MSW can intercept it
  retry?: Partial<RetryConfig>; // partial overrides merge onto DEFAULT_RETRY_CONFIG
  sleep?: (ms: number) => Promise<void>; // tests inject a stub that records the delay and resolves at once (AC-API-10)
  baseUrl?: string; // prefixed to every path; empty in the browser, tests may set it
}

export interface RequestOptions {
  signal?: AbortSignal; // caller-supplied, chained with the timeout's
}

export interface ApiClient {
  createTask(request: CreateTaskRequest, options?: RequestOptions): Promise<CreateTaskResponse>; // POST /api/tasks -> 201, echoes id/createdAt
  deleteTask(id: TaskId, options?: RequestOptions): Promise<DeleteTaskResponse>; // DELETE /api/tasks/:id -> 200, echoes id
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const config: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retry };
  const sleep = options.sleep ?? realSleep;
  const baseUrl = options.baseUrl ?? "";
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, init: RequestInit, requestOptions: RequestOptions): Promise<T> {
    let attempts = 0;
    let lastRetryAfter: number | undefined;

    for (;;) {
      throwIfAborted(requestOptions.signal);
      attempts += 1;

      const response = await send(`${baseUrl}${path}`, init, requestOptions.signal);

      if (response.ok) {
        return (await response.json()) as T;
      }

      const body = await readErrorBody(response);

      if (response.status !== 429) {
        throw new ApiError(response.status, body);
      }

      lastRetryAfter = parseRetryAfter(response.headers.get(RETRY_AFTER_HEADER)) ?? body?.error.retryAfterSeconds;

      if (!canRetry(attempts, config)) {
        throw new RateLimitedError(lastRetryAfter, attempts);
      }

      await sleep(retryDelayMs(attempts, lastRetryAfter, config));
    }
  }

  async function send(url: string, init: RequestInit, outer: AbortSignal | undefined): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs);
    const forward = () => controller.abort();
    outer?.addEventListener("abort", forward, { once: true });

    try {
      return await doFetch(url, { ...init, signal: controller.signal });
    } catch (cause) {
      if (timedOut) throw new TimeoutError(config.timeoutMs);
      if (outer?.aborted) throw new AbortedError();
      throw new NetworkError(cause);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", forward);
    }
  }

  return {
    createTask(body, requestOptions = {}) {
      return request<CreateTaskResponse>(
        TASKS_ENDPOINT,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        requestOptions,
      );
    },
    deleteTask(id, requestOptions = {}) {
      return request<DeleteTaskResponse>(taskEndpoint(id), { method: "DELETE" }, requestOptions);
    },
  };
}

export const apiClient: ApiClient = createApiClient(); // global fetch, real timers, Math.random jitter

// --- Helpers ---

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortedError();
}

async function readErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    const parsed: unknown = await response.json();
    if (isApiErrorBody(parsed)) return parsed;
  } catch {
    // not JSON: no code, the status alone is reported
  }
  return undefined;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}
