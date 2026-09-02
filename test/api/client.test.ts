import {
  AbortedError,
  ApiError,
  NetworkError,
  RateLimitedError,
  TimeoutError,
  createApiClient,
  type ApiClientOptions,
} from "@/lib/api/client";
import { handlersFor, ok, rateLimited, serverError, unauthorized } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import type { CreateTaskRequest } from "@/types/api";

const REQUEST: CreateTaskRequest = {
  id: "0f1e2d3c-4b5a-4c6d-8e7f-a0b1c2d3e4f5",
  title: "Ship the client",
  dueDate: "2026-09-03",
  createdAt: "2026-09-02T10:00:00.000Z",
};

/** MSW intercepts the real `fetch`, which in jsdom needs an absolute URL. */
const BASE_URL = "http://localhost";

function fixedRandom(draws: readonly number[]): () => number {
  let i = 0;
  return () => draws[Math.min(i++, draws.length - 1)];
}

/**
 * A client whose every source of time and chance is in hand: a recorded
 * `sleep` that resolves at once, and a fixed jitter sequence (`AC-API-10`).
 */
function build(overrides: ApiClientOptions = {}) {
  const sleeps: number[] = [];
  const client = createApiClient({
    baseUrl: BASE_URL,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 10_000, random: fixedRandom([0]) },
    ...overrides,
  });
  return { client, sleeps };
}

/** Counts requests MSW saw, so retries are asserted on the wire and not inferred. */
function countRequests() {
  let count = 0;
  const listener = () => {
    count += 1;
  };
  server.events.on("request:start", listener);
  return { get: () => count, stop: () => server.events.removeListener("request:start", listener) };
}

describe("the typed client speaks the contract", () => {
  it("createTask posts the body and returns the 201 echo", async () => {
    const { client, sleeps } = build();
    await expect(client.createTask(REQUEST)).resolves.toEqual({ task: { ...REQUEST, completed: false } });
    expect(sleeps).toEqual([]);
  });

  it("deleteTask hits the encoded single-task path and returns the echoed id", async () => {
    const { client } = build();
    await expect(client.deleteTask("a/b c")).resolves.toEqual({ id: "a/b c" });
  });
});

describe("AC-API-6: the client honours Retry-After", () => {
  it("AC-API-6: waits at least Retry-After before retrying, then succeeds", async () => {
    server.use(...handlersFor([rateLimited(2), ok()]));
    const requests = countRequests();
    const { client, sleeps } = build();

    await expect(client.createTask(REQUEST)).resolves.toMatchObject({ task: { id: REQUEST.id } });

    expect(requests.get()).toBe(2);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(2_000);
    requests.stop();
  });

  it("AC-API-6: does not retry immediately — the wait is a real timer, not a microtask", async () => {
    jest.useFakeTimers();
    try {
      server.use(...handlersFor([rateLimited(1), ok()]));
      const requests = countRequests();
      const client = createApiClient({
        baseUrl: BASE_URL,
        retry: { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 10_000, random: fixedRandom([0]) },
      });

      const pending = client.createTask(REQUEST);
      // Let the first request and the 429 complete, without advancing the clock.
      await jest.advanceTimersByTimeAsync(0);
      expect(requests.get()).toBe(1);

      // Short of Retry-After: still nothing on the wire.
      await jest.advanceTimersByTimeAsync(999);
      expect(requests.get()).toBe(1);

      // At Retry-After: the retry goes out and succeeds.
      await jest.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({ task: { id: REQUEST.id } });
      expect(requests.get()).toBe(2);
      requests.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it("AC-API-6: each subsequent 429 waits Retry-After or the jittered backoff, whichever is longer", async () => {
    server.use(...handlersFor([rateLimited(1), rateLimited(1), rateLimited(1), ok()]));
    // Draws of 1 put backoff at its ceiling: 500, 1000, 2000 for retries 1..3.
    const { client, sleeps } = build({
      retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 10_000, random: fixedRandom([1]) },
    });

    await expect(client.deleteTask(REQUEST.id)).resolves.toEqual({ id: REQUEST.id });
    expect(sleeps).toEqual([1_000, 1_000, 2_000]);
  });
});

describe("AC-API-7: retries are bounded and exhaustion surfaces", () => {
  it("AC-API-7: stops after maxAttempts requests and throws RateLimitedError", async () => {
    server.use(...handlersFor([rateLimited(1), rateLimited(1), rateLimited(1), rateLimited(3), ok()]));
    const requests = countRequests();
    const { client, sleeps } = build({
      retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 10_000, random: fixedRandom([0]) },
    });

    const failure = client.createTask(REQUEST);
    await expect(failure).rejects.toBeInstanceOf(RateLimitedError);
    const error = (await failure.catch((e: unknown) => e)) as RateLimitedError;

    expect(requests.get()).toBe(4);
    expect(sleeps).toHaveLength(3);
    expect(error.attempts).toBe(4);
    expect(error.retryAfterSeconds).toBe(3);
    expect(error.code).toBe("rate_limited");
    requests.stop();
  });

  it("AC-API-7: a budget of one makes a single request and never sleeps", async () => {
    server.use(...handlersFor([rateLimited(5), ok()]));
    const requests = countRequests();
    const { client, sleeps } = build({
      retry: { maxAttempts: 1, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 10_000, random: fixedRandom([0]) },
    });

    await expect(client.createTask(REQUEST)).rejects.toBeInstanceOf(RateLimitedError);
    expect(requests.get()).toBe(1);
    expect(sleeps).toEqual([]);
    requests.stop();
  });
});

describe("AC-API-12: rate limiting is distinguishable from other errors", () => {
  it("AC-API-12: a 500 is an ApiError with the upstream_error code, not a RateLimitedError", async () => {
    server.use(...handlersFor([serverError(500)]));
    const { client } = build();

    const failure = client.createTask(REQUEST);
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.not.toBeInstanceOf(RateLimitedError);
    await expect(failure).rejects.toMatchObject({ status: 500, code: "upstream_error" });
  });

  it("AC-API-12: a RateLimitedError is not an ApiError and carries what a retry-shortly message needs", async () => {
    server.use(...handlersFor([rateLimited(2)]));
    const { client } = build({
      retry: { maxAttempts: 1, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 10_000, random: fixedRandom([0]) },
    });

    const failure = client.createTask(REQUEST);
    await expect(failure).rejects.not.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 429, code: "rate_limited", retryAfterSeconds: 2 });
  });
});

describe("non-429 failures are never retried (ADR-0004)", () => {
  it("a 401 surfaces once as an unauthorized ApiError with no sleep", async () => {
    server.use(...handlersFor([unauthorized(), ok()]));
    const requests = countRequests();
    const { client, sleeps } = build();

    await expect(client.createTask(REQUEST)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(requests.get()).toBe(1);
    expect(sleeps).toEqual([]);
    requests.stop();
  });

  it("a 503 surfaces once as an upstream_error ApiError with no sleep", async () => {
    server.use(...handlersFor([serverError(503), ok()]));
    const requests = countRequests();
    const { client, sleeps } = build();

    await expect(client.deleteTask(REQUEST.id)).rejects.toMatchObject({ status: 503, code: "upstream_error" });
    expect(requests.get()).toBe(1);
    expect(sleeps).toEqual([]);
    requests.stop();
  });

  it("a non-JSON error body still surfaces the status, with no code", async () => {
    const { client } = build({
      fetch: async () => new Response("<html>bad gateway</html>", { status: 502 }),
    });
    await expect(client.createTask(REQUEST)).rejects.toMatchObject({ status: 502, code: undefined });
  });
});

describe("AbortController: timeout and caller cancellation", () => {
  /** A fetch that never answers on its own but honours abort, like a stalled server. */
  const stalled: ApiClientOptions["fetch"] = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });

  it("aborts a request that exceeds timeoutMs and throws TimeoutError", async () => {
    jest.useFakeTimers();
    try {
      const { client } = build({
        fetch: stalled,
        retry: { maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 250, random: fixedRandom([0]) },
      });
      const pending = client.createTask(REQUEST);
      const settled = pending.then(
        () => "resolved",
        (e: unknown) => e,
      );

      await jest.advanceTimersByTimeAsync(249);
      await jest.advanceTimersByTimeAsync(1);

      const outcome = await settled;
      expect(outcome).toBeInstanceOf(TimeoutError);
      expect((outcome as TimeoutError).timeoutMs).toBe(250);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a caller's signal aborts the in-flight request and is not retried", async () => {
    const controller = new AbortController();
    const { client, sleeps } = build({ fetch: stalled });

    const pending = client.createTask(REQUEST, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(AbortedError);
    expect(sleeps).toEqual([]);
  });

  it("an already-aborted signal short-circuits before any request is sent", async () => {
    const fetchSpy = jest.fn<Promise<Response>, [string, RequestInit]>();
    const { client } = build({ fetch: fetchSpy });
    const controller = new AbortController();
    controller.abort();

    await expect(client.createTask(REQUEST, { signal: controller.signal })).rejects.toBeInstanceOf(AbortedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a fetch that rejects outright is a NetworkError and is not retried", async () => {
    const fetchSpy = jest.fn<Promise<Response>, [string, RequestInit]>().mockRejectedValue(new TypeError("offline"));
    const { client, sleeps } = build({ fetch: fetchSpy });

    await expect(client.createTask(REQUEST)).rejects.toBeInstanceOf(NetworkError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });
});

describe("AC-API-10: outcomes are reproducible without wall time or Math.random", () => {
  // `Math.random` itself is spied on in test/api/retry.test.ts, where the schedule
  // is computed with no MSW in the loop; MSW draws its own request ids from it.
  it("AC-API-10: two runs of the same script with the same draws sleep identically", async () => {
    const run = async () => {
      server.use(...handlersFor([rateLimited(1), rateLimited(2), ok()]));
      const { client, sleeps } = build({
        retry: {
          maxAttempts: 4,
          baseDelayMs: 500,
          maxDelayMs: 8_000,
          timeoutMs: 10_000,
          random: fixedRandom([0.5, 0.9]),
        },
      });
      await client.createTask(REQUEST);
      server.resetHandlers();
      return sleeps;
    };

    const first = await run();
    const second = await run();
    expect(first).toEqual(second);
    expect(first).toEqual([1_000, 2_000]);
  });
});
