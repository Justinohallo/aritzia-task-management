/**
 * @jest-environment node
 */
import { DELETE } from "@/app/api/tasks/[id]/route";
import { POST } from "@/app/api/tasks/route";
import { createTaskHandler, deleteTaskHandler, type HandlerDeps } from "@/lib/server/handlers";
import {
  RETRY_AFTER_HEADER,
  TASKS_ENDPOINT,
  taskEndpoint,
  type ApiErrorBody,
  type CreateTaskRequest,
  type Upstream,
  type UpstreamCredentials,
  type UpstreamErrorStatus,
  type UpstreamResult,
} from "@/types/api";

const SERVER_KEY = "server-environment-key";

const REQUEST: CreateTaskRequest = {
  id: "0f1e2d3c-4b5a-4c6d-8e7f-a0b1c2d3e4f5",
  title: "Ship the Route Handlers",
  dueDate: "2026-09-03",
  createdAt: "2026-09-02T10:00:00.000Z",
};

const ORIGIN = "http://localhost";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${TASKS_ENDPOINT}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function del(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [new Request(`${ORIGIN}${taskEndpoint(id)}`, { method: "DELETE" }), { params: Promise.resolve({ id }) }];
}

/** An upstream that answers with one fixed result and remembers what it was asked. */
function stubUpstream(result: UpstreamResult<unknown>) {
  const calls: { method: "createTask" | "deleteTask"; input: unknown; credentials: UpstreamCredentials }[] = [];
  const upstream: Upstream = {
    async createTask(request, credentials) {
      calls.push({ method: "createTask", input: request, credentials });
      return result as UpstreamResult<never>;
    },
    async deleteTask(id, credentials) {
      calls.push({ method: "deleteTask", input: id, credentials });
      return result as UpstreamResult<never>;
    },
  };
  return { upstream, calls };
}

function failure(status: UpstreamErrorStatus, retryAfterSeconds?: number): UpstreamResult<never> {
  const body: ApiErrorBody = {
    error: {
      code: status === 401 ? "unauthorized" : status === 429 ? "rate_limited" : "upstream_error",
      message: `upstream said ${status}`,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
  };
  return retryAfterSeconds === undefined ? { ok: false, status, body } : { ok: false, status, body, retryAfterSeconds };
}

const CREATED: UpstreamResult<unknown> = { ok: true, status: 201, body: { task: { ...REQUEST, completed: false } } };

function deps(upstream: Upstream, apiKey: string | undefined): HandlerDeps {
  return { upstream, apiKey: () => apiKey };
}

describe("AC-API-4: a Route Handler whose environment lacks the key passes the 401 through", () => {
  it("AC-API-4: the handler presents an undefined key and returns the upstream's 401 unchanged", async () => {
    const stub = stubUpstream(failure(401));
    const response = await createTaskHandler(deps(stub.upstream, undefined))(post(REQUEST));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(failure(401).body);
    expect(stub.calls).toEqual([{ method: "createTask", input: REQUEST, credentials: { apiKey: undefined } }]);
  });

  it("AC-API-4: the same on delete", async () => {
    const stub = stubUpstream(failure(401));
    const response = await deleteTaskHandler(deps(stub.upstream, undefined))(...del(REQUEST.id));

    expect(response.status).toBe(401);
    expect(stub.calls).toEqual([{ method: "deleteTask", input: REQUEST.id, credentials: { apiKey: undefined } }]);
  });
});

describe("AC-API-3: the key the handler presents comes from server environment, never from the request", () => {
  it("AC-API-3: a key smuggled in the body or headers is dropped and the server's key is presented", async () => {
    const stub = stubUpstream(CREATED);
    const handler = createTaskHandler(deps(stub.upstream, SERVER_KEY));
    const response = await handler(
      post({ ...REQUEST, apiKey: "browser-supplied" }, { authorization: "Bearer browser-supplied", "x-api-key": "browser-supplied" }),
    );

    expect(response.status).toBe(201);
    expect(stub.calls).toEqual([{ method: "createTask", input: REQUEST, credentials: { apiKey: SERVER_KEY } }]);
  });

  it("AC-API-3: a request-supplied key does not authenticate a server with no key", async () => {
    const stub = stubUpstream(failure(401));
    const handler = createTaskHandler(deps(stub.upstream, undefined));
    const response = await handler(post({ ...REQUEST, apiKey: SERVER_KEY }, { "x-api-key": SERVER_KEY }));

    expect(response.status).toBe(401);
    expect(stub.calls[0].credentials).toEqual({ apiKey: undefined });
  });
});

describe("AC-API-5: a 429 from the upstream reaches the browser with its Retry-After header", () => {
  it("AC-API-5: status 429, the Retry-After header in whole seconds, and the body mirror", async () => {
    const stub = stubUpstream(failure(429, 3));
    const response = await createTaskHandler(deps(stub.upstream, SERVER_KEY))(post(REQUEST));

    expect(response.status).toBe(429);
    expect(response.headers.get(RETRY_AFTER_HEADER)).toBe("3");
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: expect.any(String), retryAfterSeconds: 3 },
    });
  });

  it("AC-API-5: no Retry-After header on any other status", async () => {
    const stub = stubUpstream(failure(503));
    const response = await createTaskHandler(deps(stub.upstream, SERVER_KEY))(post(REQUEST));
    expect(response.status).toBe(503);
    expect(response.headers.get(RETRY_AFTER_HEADER)).toBeNull();
  });
});

describe("AC-API-4, AC-API-5: the upstream's status and body pass through unchanged", () => {
  it.each<UpstreamErrorStatus>([401, 429, 500, 503])("AC-API-4: %s on create and on delete", async (status) => {
    const result = failure(status, status === 429 ? 1 : undefined);
    const stub = stubUpstream(result);

    const created = await createTaskHandler(deps(stub.upstream, SERVER_KEY))(post(REQUEST));
    expect(created.status).toBe(status);
    expect(await created.json()).toEqual(result.body);

    const deleted = await deleteTaskHandler(deps(stub.upstream, SERVER_KEY))(...del(REQUEST.id));
    expect(deleted.status).toBe(status);
    expect(await deleted.json()).toEqual(result.body);
  });

  it("AC-API-4: a 201 create and a 200 delete pass through with their bodies", async () => {
    const created = await createTaskHandler(deps(stubUpstream(CREATED).upstream, SERVER_KEY))(post(REQUEST));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(CREATED.body);

    const deleted = await deleteTaskHandler(
      deps(stubUpstream({ ok: true, status: 200, body: { id: REQUEST.id } }).upstream, SERVER_KEY),
    )(...del(REQUEST.id));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id: REQUEST.id });
    expect(deleted.headers.get("cache-control")).toBe("no-store");
  });
});

/**
 * AC-API-13: a malformed request is 400 invalid_request and never reaches
 * the upstream. Built in T-06; the describe previously cited B-21.
 */
describe("AC-API-13: the Route Handler rejects a malformed request with 400 invalid_request", () => {
  async function expectInvalid(response: Response, stub: ReturnType<typeof stubUpstream>) {
    expect(response.status).toBe(400);
    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toEqual(expect.any(String));
    expect(stub.calls).toEqual([]);
  }

  it.each<[string, unknown]>([
    ["a body that is not JSON", "{not json"],
    ["a body that is not an object", "[]"],
    ["a missing title", { ...REQUEST, title: undefined }],
    ["an empty title", { ...REQUEST, title: "" }],
    ["a title over the limit", { ...REQUEST, title: "x".repeat(201) }],
    ["an id that is not a UUID", { ...REQUEST, id: "task-1" }],
    ["a due date that is not YYYY-MM-DD", { ...REQUEST, dueDate: "03/09/2026" }],
    ["a createdAt that is not an ISO timestamp", { ...REQUEST, createdAt: "yesterday" }],
  ])("rejects %s with 400 and never calls the upstream", async (_label, body) => {
    const stub = stubUpstream(CREATED);
    await expectInvalid(await createTaskHandler(deps(stub.upstream, SERVER_KEY))(post(body)), stub);
  });

  it("rejects a delete whose id is not a UUID with 400 and never calls the upstream", async () => {
    const stub = stubUpstream(CREATED);
    await expectInvalid(await deleteTaskHandler(deps(stub.upstream, SERVER_KEY))(...del("not-a-uuid")), stub);
  });
});

describe("AC-API-4: the deployed bindings read the key from server environment", () => {
  const saved = process.env.TASKS_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.TASKS_API_KEY;
    else process.env.TASKS_API_KEY = saved;
  });

  it("AC-API-4: with TASKS_API_KEY unset, POST /api/tasks answers 401", async () => {
    delete process.env.TASKS_API_KEY;
    const response = await POST(post(REQUEST));
    expect(response.status).toBe(401);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("unauthorized");
  });

  it("AC-API-4: with TASKS_API_KEY set, POST answers 201 and DELETE answers 200", async () => {
    process.env.TASKS_API_KEY = SERVER_KEY;
    const created = await POST(post(REQUEST));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(CREATED.body);

    const deleted = await DELETE(...del(REQUEST.id));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id: REQUEST.id });
  });
});
