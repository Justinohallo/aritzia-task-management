/**
 * The simulated third-party API (ADR-0004), in-process and server-only,
 * called only from the Route Handlers under `app/api/**`. Persists
 * nothing: `localStorage` remains the system of record. Per call, in
 * order: latency → key check (`401`, `AC-API-4`) → the next
 * {@link ScriptedOutcome}, if any, winning outright → the fixed window
 * (exhausted → `429` with `Retry-After`, `AC-API-5`) → success, echoing
 * `id`/`createdAt` (`AC-API-8`). The registered key comes from the same
 * server environment the Route Handler presents from, so a server that
 * lacks it rejects every request until configured.
 */
import { timingSafeEqual } from "node:crypto";

import { readApiKey } from "@/lib/server/env";
import { DEFAULT_SIMULATION_CONFIG, type RateLimitConfig, type SimulationConfig } from "@/lib/server/simulation";
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
  registeredKey: () => string | undefined; // read on every call so an env change needs no restart; undefined rejects every request
  sleep?: (ms: number) => Promise<void>; // tests inject a stub that records the delay and resolves at once (AC-API-10)
}

// --- Pieces ---

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Constant-time comparison; a length mismatch is a mismatch, not a leak.
function keysMatch(presented: string, registered: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(registered, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// A fixed window, opening on its first request and resetting windowMs later — legible over accurate (ADR-0004).
function fixedWindow(limit: RateLimitConfig, now: () => number) {
  let openedAt: number | undefined;
  let used = 0;

  return {
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

// --- The upstream ---

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

// --- The deployed instance ---

let instance: Upstream | undefined;

/** One upstream per server process on the deployed profile, so the rate-limit window is shared; resets on a cold start (ADR-0004). */
export function getUpstream(): Upstream {
  instance ??= createUpstream({ config: DEFAULT_SIMULATION_CONFIG, registeredKey: readApiKey });
  return instance;
}
