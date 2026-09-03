/**
 * Retry policy and schedule for the API client (ADR-0004, T-07).
 *
 * Pure functions over {@link RetryConfig}: no timers, no `fetch`, no
 * `Math.random()`. The one random input — the full-jitter draw — comes from
 * `config.random`, so a test injects a fixed sequence and gets the same
 * schedule every run (`AC-API-10`). `lib/api/client.ts` owns the loop that
 * applies this schedule to real responses.
 *
 * Why full jitter: backoff without jitter reschedules a thundering herd
 * rather than dispersing it. Sleeping a uniform draw from `[0, backoff]`
 * spreads a wall of synchronised `429`s across the window — the eCommerce
 * point ADR-0004 makes about product drops.
 */

export interface RetryConfig {
  /** Total attempts including the first. `AC-API-7`: bounded. */
  maxAttempts: number;
  /** Backoff base; attempt `n` waits up to `baseDelayMs * 2^(n-1)`, capped. */
  baseDelayMs: number;
  maxDelayMs: number;
  /** Per-request timeout enforced with `AbortController`. */
  timeoutMs: number;
  /**
   * Source of the full-jitter draw in `[0, 1)`. Production uses
   * `Math.random`; tests inject a fixed sequence so the schedule is
   * reproducible (`AC-API-10`).
   */
  random: () => number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  timeoutMs: 10_000,
  random: Math.random,
};

/** A retry attempt number, `1` being the first *retry* (the second request). */
export type RetryAttempt = number;

/**
 * Exponential backoff with full jitter for retry `attempt` (1-based).
 *
 * The ceiling is `min(maxDelayMs, baseDelayMs * 2^(attempt-1))`; the wait is
 * `random() * ceiling`, so a draw of `0` waits nothing and a draw just under
 * `1` waits the full ceiling. `random` must return a value in `[0, 1)`; the
 * result is clamped so a misbehaving source cannot produce a negative wait
 * or one above the ceiling.
 */
export function backoffMs(attempt: RetryAttempt, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  const ceiling = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** exponent);
  const draw = clamp01(config.random());
  return Math.round(draw * ceiling);
}

/**
 * How long to wait before retry `attempt` after a `429` (`AC-API-6`).
 *
 * The client waits **at least** `Retry-After` — the server's number is a
 * floor, never an estimate to be jittered below — and, past that floor,
 * the jittered exponential backoff. The two are combined with `max` rather
 * than added so that a server asking for a long pause does not also inherit
 * the client's full backoff on top of it.
 */
export function retryDelayMs(
  attempt: RetryAttempt,
  retryAfterSeconds: number | undefined,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const floor = retryAfterSeconds === undefined ? 0 : Math.max(0, retryAfterSeconds) * 1000;
  return Math.max(floor, backoffMs(attempt, config));
}

/**
 * Whether a further attempt is allowed after `attemptsMade` requests have
 * been sent (`AC-API-7`: bounded). `maxAttempts` counts the first request,
 * so `maxAttempts: 4` is one request and at most three retries.
 */
export function canRetry(attemptsMade: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  return attemptsMade < Math.max(1, Math.floor(config.maxAttempts));
}

/**
 * Parse a `Retry-After` value. The contract (`types/api.ts`) promises whole
 * seconds, never an HTTP-date; anything unparseable yields `undefined` so the
 * client falls back to backoff alone rather than treating garbage as zero.
 */
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
