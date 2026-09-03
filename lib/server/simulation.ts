/**
 * Simulated-upstream configuration (ADR-0004, T-06).
 *
 * Read by `lib/server/upstream.ts`. Every source of non-determinism is a
 * field here, so a test injects fixed values and gets the same outcome
 * every run (`AC-API-10`, `AM-3`, `A-5`). Nothing in the simulation calls
 * `Math.random()`.
 */

/** One scripted outcome, consumed by one upstream request. */
export type ScriptedOutcome =
  /** Succeed, subject to the rate limit. */
  | { kind: "ok" }
  /** `429` with this `Retry-After`, regardless of the window's state. */
  | { kind: "rate_limited"; retryAfterSeconds: number }
  /** `500` or `503`, a generic upstream failure (`AC-API-12`). */
  | { kind: "error"; status: 500 | 503 };

/** A fixed window: at most `maxRequests` per `windowMs`, then `429`. */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  /** Whole seconds, emitted as `Retry-After` when the window is exhausted. */
  retryAfterSeconds: number;
}

export interface SimulationConfig {
  /** Fixed latency added to every upstream call. `0` under test. */
  latencyMs: number;
  rateLimit: RateLimitConfig;
  /**
   * Outcomes consumed in order, one per request. Once the script is
   * exhausted every request is `ok` (still subject to the rate limit).
   * Empty in the deployed profile: the limiter alone produces the `429`s.
   */
  script: readonly ScriptedOutcome[];
  /**
   * Clock for the fixed window. Tests inject a controllable one; the
   * upstream defaults to `Date.now` when absent.
   */
  now?: () => number;
}

/**
 * The deployed demo's profile (`AM-3`): visible latency, a limit a reviewer
 * can hit by adding a handful of tasks quickly, no scripted failures.
 * Best-effort on serverless — the in-memory window resets on cold start,
 * as ADR-0004 states.
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  latencyMs: 400,
  rateLimit: { windowMs: 10_000, maxRequests: 5, retryAfterSeconds: 3 },
  script: [],
};
