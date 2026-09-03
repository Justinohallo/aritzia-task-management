/**
 * @jest-environment node
 */
import type { ScriptedOutcome, SimulationConfig } from "@/lib/server/simulation";
import { createUpstream, type UpstreamOptions } from "@/lib/server/upstream";
import type { CreateTaskRequest, UpstreamResult } from "@/types/api";

const KEY = "registered-test-key";
const WRONG_KEY = "registered-test-kex";

const REQUEST: CreateTaskRequest = {
  id: "0f1e2d3c-4b5a-4c6d-8e7f-a0b1c2d3e4f5",
  title: "Ship the Route Handlers",
  dueDate: "2026-09-03",
  createdAt: "2026-09-02T10:00:00.000Z",
};

/** A clock the test advances by hand: no test here waits on wall time. */
function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

/** An upstream on a deterministic config, with the clock and the sleeps in hand. */
function build(config: Partial<SimulationConfig> = {}, options: Partial<UpstreamOptions> = {}) {
  const clock = fakeClock();
  const sleeps: number[] = [];
  const upstream = createUpstream({
    config: {
      latencyMs: 0,
      rateLimit: { windowMs: 10_000, maxRequests: 3, retryAfterSeconds: 2 },
      script: [],
      now: clock.now,
      ...config,
    },
    registeredKey: () => KEY,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  return { upstream, clock, sleeps };
}

const withKey = { apiKey: KEY };
const status = (r: UpstreamResult<unknown>) => r.status;

let random: jest.SpyInstance<number, []>;
beforeAll(() => {
  random = jest.spyOn(Math, "random");
});
afterAll(() => {
  random.mockRestore();
});

describe("AC-API-4: the upstream rejects unauthenticated requests", () => {
  it("AC-API-4: a missing key is a 401 with the unauthorized code", async () => {
    const { upstream } = build();
    const result = await upstream.createTask(REQUEST, { apiKey: undefined });
    expect(result).toEqual({
      ok: false,
      status: 401,
      body: { error: { code: "unauthorized", message: expect.any(String) } },
    });
  });

  it("AC-API-4: a wrong key is a 401, on create and on delete", async () => {
    const { upstream } = build();
    expect(status(await upstream.createTask(REQUEST, { apiKey: WRONG_KEY }))).toBe(401);
    expect(status(await upstream.deleteTask(REQUEST.id, { apiKey: WRONG_KEY }))).toBe(401);
  });

  it("AC-API-4: with no key registered, no presented key is accepted", async () => {
    const { upstream } = build({}, { registeredKey: () => undefined });
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(401);
  });

  it("AC-API-4: the 401 body never contains the registered key", async () => {
    const { upstream } = build();
    const result = await upstream.createTask(REQUEST, { apiKey: WRONG_KEY });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("AC-API-4: no mutation occurs — a 401 consumes neither the script nor the allowance", async () => {
    const script: ScriptedOutcome[] = [{ kind: "error", status: 503 }];
    const { upstream } = build({ rateLimit: { windowMs: 10_000, maxRequests: 1, retryAfterSeconds: 2 }, script });

    expect(status(await upstream.createTask(REQUEST, { apiKey: undefined }))).toBe(401);
    // The scripted outcome is still first in line: the 401 did not consume it.
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(503);
    // The single unit of allowance is still there: neither the 401 nor the
    // scripted failure spent it.
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(429);
  });

  it("AC-API-4: with the registered key, create is a 201 echoing the client's id and createdAt", async () => {
    const { upstream } = build();
    const result = await upstream.createTask(REQUEST, withKey);
    expect(result).toEqual({
      ok: true,
      status: 201,
      body: { task: { ...REQUEST, completed: false } },
    });
  });

  it("AC-API-4: with the registered key, delete is a 200 echoing the id", async () => {
    const { upstream } = build();
    expect(await upstream.deleteTask(REQUEST.id, withKey)).toEqual({ ok: true, status: 200, body: { id: REQUEST.id } });
  });
});

describe("AC-API-5: the upstream rate-limits on a fixed window", () => {
  it("AC-API-5: the request after the allowance is a 429 carrying Retry-After", async () => {
    const { upstream } = build();
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);
    expect(status(await upstream.deleteTask(REQUEST.id, withKey))).toBe(200);
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);

    const limited = await upstream.createTask(REQUEST, withKey);
    expect(limited).toEqual({
      ok: false,
      status: 429,
      retryAfterSeconds: 2,
      body: { error: { code: "rate_limited", message: expect.stringContaining("2s"), retryAfterSeconds: 2 } },
    });
  });

  it("AC-API-5: the allowance is shared across create and delete, and a 429 does not spend it", async () => {
    const { upstream } = build({ rateLimit: { windowMs: 10_000, maxRequests: 2, retryAfterSeconds: 1 } });
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);
    expect(status(await upstream.deleteTask(REQUEST.id, withKey))).toBe(200);
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(429);
    expect(status(await upstream.deleteTask(REQUEST.id, withKey))).toBe(429);
  });

  it("AC-API-5: the window resets after windowMs on the injected clock", async () => {
    const { upstream, clock } = build({ rateLimit: { windowMs: 10_000, maxRequests: 1, retryAfterSeconds: 3 } });
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);
    clock.advance(9_999);
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(429);
    clock.advance(1);
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);
  });

  it("AC-API-5: a scripted 429 carries its own Retry-After regardless of the window", async () => {
    const { upstream } = build({ script: [{ kind: "rate_limited", retryAfterSeconds: 7 }] });
    const limited = await upstream.createTask(REQUEST, withKey);
    expect(limited).toMatchObject({ ok: false, status: 429, retryAfterSeconds: 7 });
    // The window was untouched by the scripted 429: the full allowance remains.
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);
  });
});

describe("AC-API-10: failure and latency are deterministic under test", () => {
  const SCRIPT: readonly ScriptedOutcome[] = [
    { kind: "error", status: 500 },
    { kind: "rate_limited", retryAfterSeconds: 1 },
    { kind: "error", status: 503 },
    { kind: "ok" },
  ];

  async function run(): Promise<UpstreamResult<unknown>[]> {
    const { upstream } = build({ script: SCRIPT, rateLimit: { windowMs: 10_000, maxRequests: 1, retryAfterSeconds: 4 } });
    const out: UpstreamResult<unknown>[] = [];
    for (let i = 0; i < 6; i += 1) out.push(await upstream.createTask(REQUEST, withKey));
    return out;
  }

  it("AC-API-10: a scripted failure sequence plays back in order and is identical across runs", async () => {
    const first = await run();
    expect(first.map(status)).toEqual([500, 429, 503, 201, 429, 429]);
    expect(await run()).toEqual(first);
  });

  it("AC-API-10: once the script is exhausted every request is ok, subject to the window", async () => {
    const { upstream } = build({ script: [{ kind: "error", status: 500 }] });
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(500);
    expect(status(await upstream.createTask(REQUEST, withKey))).toBe(201);
  });

  it("AC-API-10: the configured latency is spent on every call, the 401s included", async () => {
    const { upstream, sleeps } = build({ latencyMs: 400 });
    await upstream.createTask(REQUEST, withKey);
    await upstream.createTask(REQUEST, { apiKey: undefined });
    await upstream.deleteTask(REQUEST.id, withKey);
    expect(sleeps).toEqual([400, 400, 400]);
  });

  it("AC-API-10: zero latency spends no timer at all", async () => {
    const { upstream, sleeps } = build({ latencyMs: 0 });
    await upstream.createTask(REQUEST, withKey);
    expect(sleeps).toEqual([]);
  });

  it("AC-API-10: the default latency mechanism is a timer, driven here by fake timers", async () => {
    jest.useFakeTimers();
    try {
      const { upstream } = build({ latencyMs: 400 }, { sleep: undefined });
      let settled = false;
      const pending = upstream.createTask(REQUEST, withKey).then((r) => {
        settled = true;
        return r;
      });
      await jest.advanceTimersByTimeAsync(399);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      expect(status(await pending)).toBe(201);
    } finally {
      jest.useRealTimers();
    }
  });

  it("AC-API-10: nothing in the simulation called Math.random", () => {
    expect(random).not.toHaveBeenCalled();
  });
});
