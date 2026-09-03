// Simulated-upstream configuration (ADR-0004), read by lib/server/upstream.ts. Every source
// of non-determinism is a field here, so a test gets the same outcome every run (AC-API-10, A-5).

// One scripted outcome per upstream request: succeed subject to the rate limit,
// force a 429 regardless of window state, or a generic 500/503 (AC-API-12).
export type ScriptedOutcome =
  | { kind: "ok" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "error"; status: 500 | 503 };

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  retryAfterSeconds: number; // whole seconds, emitted as Retry-After when exhausted
}

export interface SimulationConfig {
  latencyMs: number; // added to every call; 0 under test
  rateLimit: RateLimitConfig;
  script: readonly ScriptedOutcome[]; // consumed in order; exhausted means ok, still rate-limited
  now?: () => number; // clock for the window; tests inject one, the upstream defaults to Date.now
}

/**
 * The deployed demo's profile: visible latency, a limit a reviewer can hit
 * by adding a handful of tasks quickly, no scripted failures. Best-effort
 * on serverless — the in-memory window resets on cold start (ADR-0004).
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  latencyMs: 400,
  rateLimit: { windowMs: 10_000, maxRequests: 5, retryAfterSeconds: 3 },
  script: [],
};
