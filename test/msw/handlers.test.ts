import { RETRY_AFTER_HEADER, TASKS_ENDPOINT, taskEndpoint, type ApiErrorBody, type CreateTaskRequest, type CreateTaskResponse } from "@/types/api";
import { handlersFor, ok, rateLimited } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

const request: CreateTaskRequest = {
  id: "0f1a3d5e-3b2c-4c8d-9e6f-1a2b3c4d5e6f",
  title: "Write the contract tests",
  dueDate: "2026-09-02",
  createdAt: "2026-09-01T20:00:00.000Z",
};

/**
 * Proves the network boundary of the test toolchain — jsdom, MSW and the
 * real `fetch` — and the echo semantics of the default handlers, which the
 * client and mutation tests build on. These are not the criteria tests for
 * `AC-API-*`.
 */
describe("MSW handlers for the API contract", () => {
  it("default create handler echoes the client's id and createdAt with 201", async () => {
    const response = await fetch(TASKS_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as CreateTaskResponse;
    expect(body.task).toEqual({ ...request, completed: false });
  });

  it("default delete handler acknowledges with the id", async () => {
    const response = await fetch(taskEndpoint(request.id), { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: request.id });
  });

  it("handlersFor(script) plays the script in order across endpoints, then succeeds", async () => {
    server.use(...handlersFor([rateLimited(2), rateLimited(1), ok()]));

    const first = await fetch(TASKS_ENDPOINT, { method: "POST", body: JSON.stringify(request) });
    expect(first.status).toBe(429);
    expect(first.headers.get(RETRY_AFTER_HEADER)).toBe("2");
    const firstBody = (await first.json()) as ApiErrorBody;
    expect(firstBody.error).toEqual({ code: "rate_limited", message: expect.any(String), retryAfterSeconds: 2 });

    const second = await fetch(taskEndpoint(request.id), { method: "DELETE" });
    expect(second.status).toBe(429);
    expect(second.headers.get(RETRY_AFTER_HEADER)).toBe("1");

    const third = await fetch(TASKS_ENDPOINT, { method: "POST", body: JSON.stringify(request) });
    expect(third.status).toBe(201);

    const beyond = await fetch(taskEndpoint(request.id), { method: "DELETE" });
    expect(beyond.status).toBe(200);
  });
});
