/**
 * The typed API client (ADR-0004, T-07).
 *
 * `fetch` against the Route Handlers in `types/api.ts`, with:
 *
 *   - a per-request timeout enforced with `AbortController`, chained to any
 *     caller-supplied signal;
 *   - on `429`: wait at least `Retry-After`, then exponential backoff with
 *     full jitter (`AC-API-6`), within a bounded budget (`AC-API-7`);
 *   - no retry of any other status. A `400` or `401` is a caller or server
 *     configuration error and a retry only repeats it; a `5xx` is the
 *     simulation's scripted failure, surfaced as-is so T-08 can message it
 *     generically (`AC-API-12`);
 *   - exhaustion surfaced as {@link RateLimitedError}, carrying the last
 *     `Retry-After`, distinct from every other failure.
 *
 * This module renders nothing and rolls nothing back — the optimistic apply,
 * reconcile and rollback are `lib/tasks/mutations.ts` (T-08). Every source of
 * non-determinism is injected through {@link ApiClientOptions}: the `fetch`,
 * the `sleep`, and the jitter draw inside `retry.random` (`AC-API-10`).
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

// ---------------------------------------------------------------------------
// Errors — one class per outcome T-08 must tell apart
// ---------------------------------------------------------------------------

/** Base of every failure the client throws. `instanceof` is the contract. */
export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The server answered with an error status the client does not retry. */
export class ApiError extends ApiClientError {
  readonly status: number;
  readonly code: ApiErrorCode | undefined;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.error.message ?? `Request failed with status ${status}`);
    this.status = status;
    this.code = body?.error.code;
  }
}

/**
 * The retry budget ran out on `429`s (`AC-API-7`). Distinct from
 * {@link ApiError} so the message shown can name rate limiting and say the
 * action can be retried shortly (`AC-API-12`). `retryAfterSeconds` is the
 * last value the server sent, if any.
 */
export class RateLimitedError extends ApiClientError {
  readonly status = 429 as const;
  readonly code = "rate_limited" as const;
  readonly retryAfterSeconds: number | undefined;
  /** Requests sent, including the first. */
  readonly attempts: number;

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

/** The request exceeded `timeoutMs` and was aborted by the client. */
export class TimeoutError extends ApiClientError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

/** The caller's own signal aborted the request. Never retried. */
export class AbortedError extends ApiClientError {
  constructor() {
    super("Request aborted");
  }
}

/** `fetch` itself rejected: no response at all. Never retried. */
export class NetworkError extends ApiClientError {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Network request failed");
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** Defaults to the global `fetch`, looked up per call so MSW can intercept it. */
  fetch?: FetchLike;
  /** Retry policy; partial overrides merge onto `DEFAULT_RETRY_CONFIG`. */
  retry?: Partial<RetryConfig>;
  /**
   * How a retry wait is spent. Defaults to a real timer; tests inject a stub
   * that records the delay and resolves at once (`AC-API-10`).
   */
  sleep?: (ms: number) => Promise<void>;
  /** Base URL prefixed to every path. Empty in the browser; tests may set it. */
  baseUrl?: string;
}

export interface RequestOptions {
  /** A caller-supplied signal, chained with the timeout's. */
  signal?: AbortSignal;
}

export interface ApiClient {
  /** `POST /api/tasks` → `201`; the response echoes `request.id` and `createdAt`. */
  createTask(request: CreateTaskRequest, options?: RequestOptions): Promise<CreateTaskResponse>;
  /** `DELETE /api/tasks/:id` → `200`; the response echoes `id`. */
  deleteTask(id: TaskId, options?: RequestOptions): Promise<DeleteTaskResponse>;
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

  /** One request with the timeout and the caller's signal both able to abort it. */
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

/** The default client: global `fetch`, real timers, `Math.random` jitter. */
export const apiClient: ApiClient = createApiClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortedError();
}

/** The error body if it is one; a non-JSON or malformed body is `undefined`. */
async function readErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    const parsed: unknown = await response.json();
    if (isApiErrorBody(parsed)) return parsed;
  } catch {
    // A body that is not JSON carries no code; the status alone is reported.
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
