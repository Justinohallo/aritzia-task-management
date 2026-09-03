/**
 * Retry policy and schedule for the API client (ADR-0004). Pure functions
 * over {@link RetryConfig}; the full-jitter draw comes from `config.random`
 * so a test gets a reproducible schedule (`AC-API-10`). Full jitter, not
 * plain backoff, because a uniform draw disperses a thundering herd of
 * synchronised `429`s instead of rescheduling it as one.
 */

export interface RetryConfig {
  maxAttempts: number; // including the first, bounded (AC-API-7)
  baseDelayMs: number; // attempt n waits up to baseDelayMs * 2^(n-1), capped
  maxDelayMs: number;
  timeoutMs: number; // per-request, enforced with AbortController
  random: () => number; // full-jitter draw in [0, 1); tests inject a fixed sequence (AC-API-10)
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  timeoutMs: 10_000,
  random: Math.random,
};

export type RetryAttempt = number; // 1 is the first retry (the second request)

// Ceiling is min(maxDelayMs, baseDelayMs * 2^(attempt-1)); wait is random() * ceiling, clamped
// so a misbehaving source can't produce a negative wait or one above the ceiling.
export function backoffMs(attempt: RetryAttempt, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const ceiling = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** exponent);
  const draw = clamp01(config.random());
  return Math.round(draw * ceiling);
}

// At least Retry-After after a 429 (AC-API-6) — a floor, never jittered below — combined
// with max rather than added, so a long server pause doesn't also inherit the full backoff.
export function retryDelayMs(
  attempt: RetryAttempt,
  retryAfterSeconds: number | undefined,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const floor = retryAfterSeconds === undefined ? 0 : Math.max(0, retryAfterSeconds) * 1000;
  return Math.max(floor, backoffMs(attempt, config));
}

/** Whether a further attempt is allowed after `attemptsMade` requests (`AC-API-7`); `maxAttempts` counts the first request. */
export function canRetry(attemptsMade: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  return attemptsMade < Math.max(1, Math.floor(config.maxAttempts));
}

/** Parse a `Retry-After` value (whole seconds, per the contract); unparseable yields `undefined` rather than a garbage zero. */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (header === null || header === undefined) return undefined;
  const trimmed = header.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}
