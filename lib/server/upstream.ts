/**
 * The simulated third-party API (ADR-0004, as amended by ARCH-03).
 *
 * In-process, server-only, behind the {@link Upstream} interface frozen in
 * `types/api.ts`. It is the service the brief describes — the one that
 * "requires a private key" and rate-limits — and the Route Handlers under
 * `app/api/**` are its only caller. It persists nothing: `localStorage`
 * remains the system of record.
 *
 * Per call, in order:
 *
 *   1. latency   — `config.latencyMs`, added to every call, `0` under test
 *   2. key       — absent or wrong → `401`, and nothing below runs (`AC-API-4`)
 *   3. script    — the next {@link ScriptedOutcome}, if any, wins outright:
 *                  a scripted `429` ignores the window, a scripted `5xx`
 *                  consumes no allowance
 *   4. window    — a fixed window of `maxRequests` per `windowMs`; exhausted
 *                  → `429` with `Retry-After` (`AC-API-5`)
 *   5. success   — `201` echoing the client's `id` and `createdAt` on create,
 *                  `200` echoing the `id` on delete (`AC-API-8`'s contract)
 *
 * Every source of non-determinism is injected: the clock via `config.now`,
 * the latency mechanism via {@link UpstreamOptions.sleep}, the failures via
 * `config.script`. Nothing here calls `Math.random()` (`AC-API-10`).
 *
 * The registered key — what a real upstream would hold in the account the
 * key was issued to — is provisioned from the same server environment the
 * Route Handler presents from. That is the honest shape for a simulation
 * with one deployment and one credential: a server whose environment lacks
 * the key has, by the same token, no key registered anywhere, and every
 * request is a `401` until it is configured (`AC-API-4`).
 */
import { timingSafeEqual } from "node:crypto";

import { DEFAULT_SIMULATION_CONFIG, type RateLimitConfig, type SimulationConfig } from "@/lib/api/config";
import { readApiKey } from "@/lib/server/env";
import type {
  ApiErrorBody,
  CreateTaskRequest,
  CreateTaskResponse,
  DeleteTaskResponse,
  Upstream,
  UpstreamCredentials,
  UpstreamErrorStatus,
  UpstreamFailure,
  UpstreamResult,
} from "@/types/api";
import type { TaskId } from "@/types/task";

export interface UpstreamOptions {
  config: SimulationConfig;
  /**
   * The key the upstream accepts, read on every call so a change in the
   * server environment is seen without a restart. `undefined` means no key
   * is registered and every request is rejected.
   */
  registeredKey: () => string | undefined;
  /**
   * How latency is spent. Defaults to a real timer; tests inject a stub that
   * records the requested delay and resolves at once (`AC-API-10`).
   */
  sleep?: (ms: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Constant-time comparison; a length mismatch is a mismatch, not a leak. */
function keysMatch(presented: string, registered: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(registered, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A fixed window that opens on its first request and resets `windowMs`
 * later. Legible over accurate — a token bucket is the production choice, and
 * ADR-0004 records why it was not taken.
 */
function fixedWindow(limit: RateLimitConfig, now: () => number) {
  let openedAt: number | undefined;
  let used = 0;

  return {
    /** Spend one unit of allowance; `false` when the window is exhausted. */
    take(): boolean {
      const t = now();
      if (openedAt === undefined || t - openedAt >= limit.windowMs) {
        openedAt = t;
        used = 0;
      }
      if (used >= limit.maxRequests) return false;
      used += 1;
      return true;
    },
  };
}

function failure(status: UpstreamErrorStatus, message: string, retryAfterSeconds?: number): UpstreamFailure {
  const code: ApiErrorBody["error"]["code"] =
    status === 401 ? "unauthorized" : status === 429 ? "rate_limited" : "upstream_error";
  const body: ApiErrorBody = {
    error: retryAfterSeconds === undefined ? { code, message } : { code, message, retryAfterSeconds },
  };
  return retryAfterSeconds === undefined ? { ok: false, status, body } : { ok: false, status, body, retryAfterSeconds };
}

const unauthorized = (): UpstreamFailure => failure(401, "Missing or invalid API key");
const rateLimited = (retryAfterSeconds: number): UpstreamFailure =>
  failure(429, `Rate limited; retry after ${retryAfterSeconds}s`, retryAfterSeconds);
const upstreamError = (status: 500 | 503): UpstreamFailure => failure(status, "The upstream service failed");

// ---------------------------------------------------------------------------
// The upstream
// ---------------------------------------------------------------------------

export function createUpstream(options: UpstreamOptions): Upstream {
  const { config, registeredKey } = options;
  const sleep = options.sleep ?? realSleep;
  const window = fixedWindow(config.rateLimit, config.now ?? Date.now);
  const script = [...config.script];

  function authenticated(credentials: UpstreamCredentials): boolean {
    const registered = registeredKey();
    if (credentials.apiKey === undefined || registered === undefined) return false;
    return keysMatch(credentials.apiKey, registered);
  }

  async function call<TBody>(
    credentials: UpstreamCredentials,
    status: 200 | 201,
    body: () => TBody,
  ): Promise<UpstreamResult<TBody>> {
    if (config.latencyMs > 0) await sleep(config.latencyMs);
    if (!authenticated(credentials)) return unauthorized();

    const scripted = script.shift();
    if (scripted?.kind === "rate_limited") return rateLimited(scripted.retryAfterSeconds);
    if (scripted?.kind === "error") return upstreamError(scripted.status);

    if (!window.take()) return rateLimited(config.rateLimit.retryAfterSeconds);
    return { ok: true, status, body: body() };
  }

  return {
    createTask(request: CreateTaskRequest, credentials: UpstreamCredentials) {
      return call<CreateTaskResponse>(credentials, 201, () => ({
        task: {
          id: request.id,
          title: request.title,
          dueDate: request.dueDate,
          completed: false,
          createdAt: request.createdAt,
        },
      }));
    },
    deleteTask(id: TaskId, credentials: UpstreamCredentials) {
      return call<DeleteTaskResponse>(credentials, 200, () => ({ id }));
    },
  };
}

// ---------------------------------------------------------------------------
// The deployed instance
// ---------------------------------------------------------------------------

let instance: Upstream | undefined;

/**
 * One upstream per server process, on the deployed profile
 * (`DEFAULT_SIMULATION_CONFIG`, `AM-3`), so the rate-limit window is shared
 * across requests. In-memory, so it resets on a serverless cold start —
 * best-effort, as ADR-0004 states; a production limiter lives in shared
 * storage or at the edge.
 */
export function getUpstream(): Upstream {
  instance ??= createUpstream({ config: DEFAULT_SIMULATION_CONFIG, registeredKey: readApiKey });
  return instance;
}
