import { ApiError, NetworkError, RateLimitedError, TimeoutError, type ApiClient } from "@/lib/api/client";
import type { TaskAction } from "@/lib/tasks/actions";
import { createTask, deleteTask, describeFailure, toCreateRequest, type MutationDeps } from "@/lib/tasks/mutations";
import type { Task } from "@/types/task";

const task: Task = {
  id: "0f1e2d3c-4b5a-4c6d-8e7f-a0b1c2d3e4f5",
  title: "Order the lookbook",
  dueDate: "2026-09-10",
  completed: false,
  createdAt: "2026-09-02T10:00:00.000Z",
  sync: "syncing",
};

type Announced = { message: string; assertive: boolean };

/**
 * The sequence under test, with nothing rendered: every dispatch and every
 * announcement is recorded in order, and the client is a script.
 */
function harness(client: Partial<ApiClient>) {
  const actions: TaskAction[] = [];
  const announced: Announced[] = [];
  const deps: MutationDeps = {
    dispatch: (action) => {
      actions.push(action);
    },
    announce: (message, options) => {
      announced.push({ message, assertive: options?.assertive ?? false });
    },
    client: {
      createTask: () => Promise.reject(new Error("createTask not scripted")),
      deleteTask: () => Promise.reject(new Error("deleteTask not scripted")),
      ...client,
    },
  };
  return { deps, actions, announced, types: () => actions.map((a) => a.type) };
}

describe("createTask — apply → call → reconcile / rollback", () => {
  it("AC-API-8: applies the row before the request is sent, then reconciles by id on success", async () => {
    const seen: string[] = [];
    const h = harness({
      createTask: async (request) => {
        seen.push(`request:${request.id}`);
        expect(h.types()).toEqual(["add/optimistic"]);
        return { task: { ...request, completed: false } };
      },
    });

    const result = await createTask(h.deps, task);

    expect(result).toEqual({ ok: true });
    expect(seen).toEqual([`request:${task.id}`]);
    expect(h.actions).toEqual([
      { type: "add/optimistic", task },
      { type: "add/confirm", id: task.id, task: { ...toCreateRequest(task), completed: false } },
    ]);
  });

  it("AC-API-1: the request carries exactly the contract's fields — no sync state, no completed", () => {
    expect(toCreateRequest(task)).toEqual({ id: task.id, title: task.title, dueDate: task.dueDate, createdAt: task.createdAt });
  });

  it("AC-API-11: announces the in-flight state politely, then the outcome", async () => {
    const h = harness({ createTask: async (request) => ({ task: { ...request, completed: false } }) });
    await createTask(h.deps, task);
    expect(h.announced).toEqual([
      { message: 'Adding "Order the lookbook"…', assertive: false },
      { message: '"Order the lookbook" added.', assertive: false },
    ]);
  });

  it("AC-API-7: when the retry budget is exhausted the row is marked failed, rolled back, and rate limiting is named", async () => {
    const h = harness({ createTask: () => Promise.reject(new RateLimitedError(3, 4)) });

    const result = await createTask(h.deps, task);

    expect(h.types()).toEqual(["add/optimistic", "sync/set", "add/rollback"]);
    expect(h.actions[1]).toEqual({ type: "sync/set", id: task.id, sync: "failed" });
    expect(h.actions[2]).toEqual({ type: "add/rollback", id: task.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.failure.kind).toBe("rate_limited");
    expect(result.failure.message).toMatch(/rate limit/i);
    expect(h.announced[1]).toEqual({ message: result.failure.message, assertive: true });
  });

  it("AC-API-12: a generic failure is rolled back with a message that does not name rate limiting", async () => {
    const h = harness({ createTask: () => Promise.reject(new ApiError(500, { error: { code: "upstream_error", message: "boom" } })) });

    const result = await createTask(h.deps, task);

    expect(h.types()).toEqual(["add/optimistic", "sync/set", "add/rollback"]);
    if (result.ok) throw new Error("unreachable");
    expect(result.failure.kind).toBe("generic");
    expect(result.failure.message).not.toMatch(/rate limit/i);
    expect(h.announced[1].assertive).toBe(true);
  });
});

describe("deleteTask — apply → call → rollback", () => {
  it("AC-API-9: removes the row before the request is sent, and restores the prior record on final failure", async () => {
    const h = harness({
      deleteTask: async () => {
        expect(h.types()).toEqual(["remove/optimistic"]);
        throw new ApiError(503, { error: { code: "upstream_error", message: "down" } });
      },
    });

    const result = await deleteTask(h.deps, task);

    expect(h.actions).toEqual([
      { type: "remove/optimistic", id: task.id },
      { type: "remove/rollback", task },
    ]);
    if (result.ok) throw new Error("unreachable");
    expect(result.failure.kind).toBe("generic");
    expect(h.announced).toEqual([
      { message: 'Deleting "Order the lookbook"…', assertive: false },
      { message: result.failure.message, assertive: true },
    ]);
    expect(result.failure.message).toMatch(/put back/i);
  });

  it("AC-API-2, AC-DEL-2: on success nothing is reconciled and the deletion is announced", async () => {
    const ids: string[] = [];
    const h = harness({
      deleteTask: async (id) => {
        ids.push(id);
        return { id };
      },
    });

    await expect(deleteTask(h.deps, task)).resolves.toEqual({ ok: true });

    expect(ids).toEqual([task.id]);
    expect(h.types()).toEqual(["remove/optimistic"]);
    expect(h.announced.at(-1)).toEqual({ message: '"Order the lookbook" deleted.', assertive: false });
  });

  it("AC-API-7: an exhausted retry budget on delete restores the row and names rate limiting", async () => {
    const h = harness({ deleteTask: () => Promise.reject(new RateLimitedError(undefined, 4)) });
    const result = await deleteTask(h.deps, task);
    expect(h.types()).toEqual(["remove/optimistic", "remove/rollback"]);
    if (result.ok) throw new Error("unreachable");
    expect(result.failure.kind).toBe("rate_limited");
  });
});

describe("describeFailure", () => {
  it("AC-API-12: the rate-limit message differs from the generic one, names the cause, and says to retry shortly", () => {
    const limited = describeFailure("add", task, new RateLimitedError(3, 4));
    const generic = describeFailure("add", task, new ApiError(500, undefined));

    expect(limited.kind).toBe("rate_limited");
    expect(generic.kind).toBe("generic");
    expect(limited.message).not.toBe(generic.message);
    expect(limited.message).toMatch(/rate limiting/i);
    expect(limited.message).toMatch(/try again in about 3 seconds/i);
    expect(generic.message).not.toMatch(/rate limit/i);
  });

  it("AC-API-12: without a Retry-After the rate-limit message still says to retry in a few seconds", () => {
    expect(describeFailure("delete", task, new RateLimitedError(undefined, 4)).message).toMatch(/try again in a few seconds/i);
  });

  it("AC-API-12: timeouts, network failures and unknown errors are all generic", () => {
    for (const error of [new TimeoutError(10_000), new NetworkError(new TypeError("offline")), "not even an Error"]) {
      const failure = describeFailure("delete", task, error);
      expect(failure.kind).toBe("generic");
      expect(failure.error).toBe(error);
    }
  });
});
