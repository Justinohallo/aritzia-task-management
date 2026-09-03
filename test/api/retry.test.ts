import {
  backoffMs,
  canRetry,
  parseRetryAfter,
  retryDelayMs,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "@/lib/api/retry";

/** A jitter source that replays a fixed sequence: the schedule is a pure function of it. */
function fixedRandom(draws: readonly number[]): () => number {
  let i = 0;
  return () => draws[Math.min(i++, draws.length - 1)];
}

function config(overrides: Partial<RetryConfig> = {}): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 500, maxDelayMs: 8_000, maxAttempts: 4, ...overrides };
}

describe("AC-API-6: the schedule honours Retry-After", () => {
  it("AC-API-6: the wait is never below Retry-After, whatever the jitter draws", () => {
    const zero = config({ random: fixedRandom([0]) });
    expect(retryDelayMs(1, 2, zero)).toBe(2_000);
    expect(retryDelayMs(3, 2, zero)).toBe(2_000);
  });

  it("AC-API-6: past the Retry-After floor the jittered backoff applies", () => {
    const nearOne = config({ random: fixedRandom([0.999]) });
    // attempt 3 ceiling is 500 * 2^2 = 2000; draw 0.999 → 1998 < 3000 floor
    expect(retryDelayMs(3, 3, nearOne)).toBe(3_000);
    // attempt 4 ceiling is 4000; draw 0.999 → 3996 > 3000 floor
    expect(retryDelayMs(4, 3, nearOne)).toBe(3_996);
  });

  it("AC-API-6: without a Retry-After the wait is the backoff alone", () => {
    expect(retryDelayMs(1, undefined, config({ random: fixedRandom([0.5]) }))).toBe(250);
  });
});

describe("AC-API-6: full jitter is a uniform draw in [0, backoff]", () => {
  it("AC-API-6: the ceiling doubles per attempt and is capped at maxDelayMs", () => {
    const max = config({ random: fixedRandom([1]) });
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffMs(n, max))).toEqual([500, 1_000, 2_000, 4_000, 8_000, 8_000]);
  });

  it("AC-API-6: a draw of 0 waits nothing and a draw scales the ceiling linearly", () => {
    expect(backoffMs(2, config({ random: fixedRandom([0]) }))).toBe(0);
    expect(backoffMs(2, config({ random: fixedRandom([0.25]) }))).toBe(250);
  });

  it("AC-API-6: a misbehaving random source is clamped into [0, 1]", () => {
    expect(backoffMs(1, config({ random: fixedRandom([-3]) }))).toBe(0);
    expect(backoffMs(1, config({ random: fixedRandom([7]) }))).toBe(500);
    expect(backoffMs(1, config({ random: () => Number.NaN }))).toBe(0);
  });
});

describe("AC-API-7: the retry budget is bounded", () => {
  it("AC-API-7: maxAttempts counts the first request", () => {
    const c = config({ maxAttempts: 4 });
    expect(canRetry(1, c)).toBe(true);
    expect(canRetry(3, c)).toBe(true);
    expect(canRetry(4, c)).toBe(false);
  });

  it("AC-API-7: a budget below one still allows exactly one request", () => {
    expect(canRetry(1, config({ maxAttempts: 0 }))).toBe(false);
  });
});

describe("AC-API-10: the schedule is reproducible", () => {
  it("AC-API-10: the same injected draws produce the same schedule, without Math.random", () => {
    const random = jest.spyOn(Math, "random");
    const draws = [0.1, 0.9, 0.5];
    const run = () => [1, 2, 3].map((n) => retryDelayMs(n, 1, config({ random: fixedRandom(draws) })));
    expect(run()).toEqual(run());
    expect(run()).toEqual([1_000, 1_000, 1_000]);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});

describe("Retry-After parsing follows the whole-seconds contract", () => {
  it("parses whole and fractional seconds and rejects anything else", () => {
    expect(parseRetryAfter("3")).toBe(3);
    expect(parseRetryAfter(" 1.5 ")).toBe(1.5);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter("Wed, 21 Oct 2015 07:28:00 GMT")).toBeUndefined();
    expect(parseRetryAfter("-1")).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });
});
