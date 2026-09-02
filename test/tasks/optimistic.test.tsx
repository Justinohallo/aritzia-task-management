import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { http, HttpResponse } from "msw";

import { TaskForm } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";
import { LiveRegion } from "@/components/ui/live-region";
import { createApiClient, type ApiClient } from "@/lib/api/client";
import { ApiClientContext } from "@/lib/tasks/mutations";
import { TasksProvider } from "@/lib/tasks/provider";
import { STORAGE_KEY, STORAGE_VERSION } from "@/lib/tasks/schema";
import { handlersFor, rateLimited, serverError } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import { TASKS_ENDPOINT, type ApiErrorBody, type CreateTaskRequest, type CreateTaskResponse } from "@/types/api";
import type { Task } from "@/types/task";

/**
 * T-08 — the optimistic lifecycle as the user sees it: form, list and the
 * one live region mounted together, the network intercepted by MSW so the
 * real `fetch` path runs (ADR-0006). The client under test has an instant
 * `sleep` and a fixed jitter draw, so a scripted run of `429`s exhausts the
 * retry budget in milliseconds and the outcome is the same every run
 * (`AC-API-10`).
 */
const mockRouter = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/tasks",
  useSearchParams: () => new URLSearchParams(),
}));

const MAX_ATTEMPTS = 4;

/** Every timer and every draw in hand; the budget is one request and three retries. */
function testClient(): ApiClient {
  return createApiClient({
    sleep: async () => {},
    retry: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: 500, maxDelayMs: 8_000, timeoutMs: 10_000, random: () => 0 },
  });
}

function task(overrides: Partial<Task> & Pick<Task, "title">): Task {
  return {
    id: crypto.randomUUID(),
    dueDate: "2030-01-01",
    completed: false,
    createdAt: "2026-09-01T09:00:00.000Z",
    sync: "confirmed",
    ...overrides,
  };
}

function seed(tasks: Task[]) {
  const persisted = tasks.map(({ id, title, dueDate, completed, createdAt }) => ({ id, title, dueDate, completed, createdAt }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, tasks: persisted }));
}

function stored(): Array<{ id: string; title: string }> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).tasks : [];
}

function renderApp(client: ApiClient = testClient()) {
  return render(
    <ApiClientContext.Provider value={client}>
      <TasksProvider>
        <LiveRegion />
        <TaskForm />
        <TaskList />
      </TasksProvider>
    </ApiClientContext.Provider>,
  );
}

/** Every request MSW saw, in order, as `METHOD /path`. */
function recordRequests() {
  const seen: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    seen.push(`${request.method} ${new URL(request.url).pathname}`);
  };
  server.events.on("request:start", listener);
  return { seen, stop: () => server.events.removeListener("request:start", listener) };
}

/**
 * A response held until `release()` — the window in which the optimistic
 * state is observable. `release` is wrapped in `act` so the React updates
 * the response causes are flushed under the test's control.
 */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    wait: () => opened,
    release: () => act(async () => {
      open();
      await opened;
    }),
  };
}

/** A create handler that holds its `201` until released. */
function gatedCreate() {
  const g = gate();
  const handler = http.post(TASKS_ENDPOINT, async ({ request }) => {
    const body = (await request.json()) as CreateTaskRequest;
    await g.wait();
    const response: CreateTaskResponse = { task: { ...body, completed: false } };
    return HttpResponse.json(response, { status: 201 });
  });
  return { handler, release: g.release };
}

/** A delete handler that holds its response — `200`, or the given failure — until released. */
function gatedDelete(status: 200 | 503 = 200) {
  const g = gate();
  const handler = http.delete(`${TASKS_ENDPOINT}/:id`, async ({ params }) => {
    await g.wait();
    if (status === 200) return HttpResponse.json({ id: String(params.id) });
    const body: ApiErrorBody = { error: { code: "upstream_error", message: "The upstream service failed" } };
    return HttpResponse.json(body, { status });
  });
  return { handler, release: g.release };
}

const title = () => screen.getByLabelText("Title");
const dueDate = () => screen.getByLabelText("Due date");
const submit = () => screen.getByRole("button", { name: /add task|adding/i });
const rows = () => screen.queryAllByRole("listitem");
const titles = () => rows().map((row) => row.querySelector("label")?.textContent);
const deleteButton = (name: string) => screen.getByRole("button", { name: `Delete ${name}` });
const status = () => screen.getByRole("status");
const alert = () => screen.getByRole("alert");

async function addTask(user: ReturnType<typeof userEvent.setup>, name: string, due = "2030-06-01") {
  await user.type(title(), name);
  await user.type(dueDate(), due);
  await user.click(submit());
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("optimistic create", () => {
  it("AC-API-1: creating a task sends a POST to the create endpoint carrying the client's id and createdAt", async () => {
    const user = userEvent.setup();
    const bodies: CreateTaskRequest[] = [];
    const capture = async ({ request }: { request: Request }) => {
      if (request.method === "POST") bodies.push((await request.clone().json()) as CreateTaskRequest);
    };
    server.events.on("request:start", capture);
    const requests = recordRequests();
    renderApp();

    await addTask(user, "Order the lookbook");
    await waitFor(() => expect(rows()[0]).toHaveAttribute("data-sync", "confirmed"));

    expect(requests.seen).toEqual([`POST ${TASKS_ENDPOINT}`]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ id: expect.any(String), title: "Order the lookbook", dueDate: "2030-06-01", createdAt: expect.any(String) });
    expect(stored()[0]).toMatchObject({ id: bodies[0].id, createdAt: bodies[0].createdAt });
    server.events.removeListener("request:start", capture);
    requests.stop();
  });

  it("AC-API-8: the task appears before the API responds, and reconciles without the row remounting or reordering", async () => {
    const user = userEvent.setup();
    const gate = gatedCreate();
    server.use(gate.handler);
    seed([task({ title: "Earlier", dueDate: "2030-01-01" }), task({ title: "Later", dueDate: "2030-12-01" })]);
    renderApp();

    await addTask(user, "In the middle", "2030-06-01");

    // Before the response: visible, in the right place, marked as in flight.
    expect(titles()).toEqual(["Earlier", "In the middle", "Later"]);
    const provisional = rows()[1];
    expect(provisional).toHaveAttribute("data-sync", "syncing");

    await gate.release();
    await waitFor(() => expect(rows()[1]).toHaveAttribute("data-sync", "confirmed"));

    // After: the same DOM node, in the same position — no remount, no reorder.
    expect(rows()[1]).toBe(provisional);
    expect(titles()).toEqual(["Earlier", "In the middle", "Later"]);
    expect(rows()[1]).not.toHaveAttribute("aria-busy");
  });

  it("AC-API-11: while the create is in flight the row shows a Saving indicator, is aria-busy, and the state is announced", async () => {
    const user = userEvent.setup();
    const gate = gatedCreate();
    server.use(gate.handler);
    renderApp();

    await addTask(user, "Order the lookbook");

    const [row] = rows();
    expect(row).toHaveAttribute("aria-busy", "true");
    expect(within(row).getByText("Saving…")).toBeInTheDocument();
    expect(deleteButton("Order the lookbook")).toBeDisabled();
    expect(status()).toHaveTextContent('Adding "Order the lookbook"…');
    expect(submit()).toHaveTextContent("Adding…");

    await gate.release();
    await waitFor(() => expect(status()).toHaveTextContent('"Order the lookbook" added.'));
    expect(within(rows()[0]).queryByText("Saving…")).not.toBeInTheDocument();
    expect(deleteButton("Order the lookbook")).toBeEnabled();
    expect(submit()).toHaveTextContent("Add task");
  });

  it("AC-ADD-8: submit is disabled while the request is in flight, and a second activation creates nothing", async () => {
    const user = userEvent.setup();
    const gate = gatedCreate();
    server.use(gate.handler);
    const requests = recordRequests();
    renderApp();

    await addTask(user, "Order the lookbook");
    expect(submit()).toBeDisabled();

    // A click on a disabled button, and Enter in the (now empty) form.
    await user.click(submit());
    await user.type(title(), "Something else{Enter}");

    expect(rows()).toHaveLength(1);
    expect(requests.seen).toEqual([`POST ${TASKS_ENDPOINT}`]);

    await gate.release();
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(rows()).toHaveLength(1);
    expect(requests.seen).toHaveLength(1);
    requests.stop();
  });

  it("AC-API-7: when the API responds 429 repeatedly, retrying stops at the budget, rate limiting is named, and the row is rolled back", async () => {
    const user = userEvent.setup();
    server.use(...handlersFor(Array.from({ length: MAX_ATTEMPTS + 2 }, () => rateLimited(1))));
    const requests = recordRequests();
    renderApp();

    await addTask(user, "Order the lookbook");
    await waitFor(() => expect(alert()).toHaveTextContent(/rate limiting/i));

    expect(requests.seen).toHaveLength(MAX_ATTEMPTS);
    expect(rows()).toHaveLength(0);
    expect(stored()).toEqual([]);
    expect(screen.getByTestId("task-form-failure")).toHaveTextContent(/rate limiting/i);
    expect(screen.getByTestId("task-form-failure")).toHaveTextContent(/try again in about 1 second/i);
    // The failed task is put back in the form so it can be resubmitted.
    expect(title()).toHaveValue("Order the lookbook");
    expect(dueDate()).toHaveValue("2030-06-01");
    expect(submit()).toBeEnabled();
    requests.stop();
  });

  it("AC-API-12: a rate-limit failure reads differently from a generic failure, and says the action can be retried shortly", async () => {
    const user = userEvent.setup();
    server.use(...handlersFor([serverError(500)]));
    renderApp();

    await addTask(user, "Generic");
    await waitFor(() => expect(screen.getByTestId("task-form-failure")).toBeInTheDocument());
    const generic = screen.getByTestId("task-form-failure").textContent ?? "";
    expect(generic).not.toMatch(/rate limit/i);

    server.use(...handlersFor(Array.from({ length: MAX_ATTEMPTS }, () => rateLimited(2))));
    await user.clear(title());
    await user.clear(dueDate());
    await addTask(user, "Limited");
    await waitFor(() => expect(screen.getByTestId("task-form-failure")).toHaveTextContent(/rate limiting/i));
    const limited = screen.getByTestId("task-form-failure").textContent ?? "";

    expect(limited).not.toBe(generic);
    expect(limited).toMatch(/try again in about 2 seconds/i);
    expect(alert()).toHaveTextContent(limited);
    expect(rows()).toHaveLength(0);
  });
});

describe("optimistic delete", () => {
  it("AC-API-2: deleting a task sends a DELETE to that task's endpoint", async () => {
    const user = userEvent.setup();
    const t = task({ title: "Delete me" });
    seed([t]);
    const requests = recordRequests();
    renderApp();

    await user.click(deleteButton("Delete me"));
    await waitFor(() => expect(status()).toHaveTextContent('"Delete me" deleted.'));

    expect(requests.seen).toEqual([`DELETE ${TASKS_ENDPOINT}/${t.id}`]);
    expect(rows()).toHaveLength(0);
    expect(stored()).toEqual([]);
    requests.stop();
  });

  it("AC-DEL-2: the deletion is announced in a live region", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Delete me" })]);
    renderApp();

    await user.click(deleteButton("Delete me"));

    await waitFor(() => expect(status()).toHaveTextContent('"Delete me" deleted.'));
    expect(rows()).toHaveLength(0);
  });

  it("AC-API-11: while the delete is in flight an indicator names the task, and the state is announced", async () => {
    const user = userEvent.setup();
    const gated = gatedDelete();
    server.use(gated.handler);
    seed([task({ title: "Delete me" })]);
    renderApp();

    await user.click(deleteButton("Delete me"));

    expect(rows()).toHaveLength(0);
    const indicator = screen.getByTestId("task-list-deleting");
    expect(indicator).toHaveTextContent('Deleting "Delete me"…');
    expect(status()).toHaveTextContent('Deleting "Delete me"…');

    await gated.release();
    await waitFor(() => expect(screen.queryByTestId("task-list-deleting")).not.toBeInTheDocument());
    expect(status()).toHaveTextContent('"Delete me" deleted.');
  });

  it("AC-API-9: the task disappears immediately, and when the call ultimately fails it reappears in its previous position with an error announced", async () => {
    const user = userEvent.setup();
    const gated = gatedDelete(503);
    server.use(gated.handler);
    seed([
      task({ title: "First", dueDate: "2030-01-01" }),
      task({ title: "Second", dueDate: "2030-02-01" }),
      task({ title: "Third", dueDate: "2030-03-01" }),
    ]);
    renderApp();
    expect(titles()).toEqual(["First", "Second", "Third"]);

    await user.click(deleteButton("Second"));
    expect(titles()).toEqual(["First", "Third"]);

    await gated.release();
    await waitFor(() => expect(titles()).toEqual(["First", "Second", "Third"]));
    expect(rows()[1]).toHaveAttribute("data-sync", "confirmed");
    expect(alert()).toHaveTextContent(/could not delete "second"/i);
    expect(alert()).toHaveTextContent(/put back/i);
    expect(screen.getByTestId("task-list-failure")).toHaveTextContent(/could not delete "second"/i);
    // Storage holds the record again; order is derived at render, not stored (`AC-LIST-3`).
    expect(stored().map((t) => t.title).sort()).toEqual(["First", "Second", "Third"]);
    expect(deleteButton("Second")).toBeEnabled();
  });

  it("AC-API-7: an exhausted retry budget on delete rolls the row back and names rate limiting", async () => {
    const user = userEvent.setup();
    server.use(...handlersFor(Array.from({ length: MAX_ATTEMPTS }, () => rateLimited(1))));
    const requests = recordRequests();
    seed([task({ title: "Delete me" })]);
    renderApp();

    await user.click(deleteButton("Delete me"));
    await waitFor(() => expect(titles()).toEqual(["Delete me"]));

    expect(requests.seen).toHaveLength(MAX_ATTEMPTS);
    expect(alert()).toHaveTextContent(/rate limiting/i);
    expect(screen.getByTestId("task-list-failure")).toHaveTextContent(/rate limiting/i);
    requests.stop();
  });

  it("AC-A11Y-6: the in-flight and failed states have no automated accessibility violations", async () => {
    const user = userEvent.setup();
    const gate = gatedCreate();
    server.use(gate.handler, ...handlersFor([serverError(500)]).slice(1));
    seed([task({ title: "Delete me" })]);
    const { container } = renderApp();

    await addTask(user, "In flight");
    expect(await axe(container)).toHaveNoViolations();

    await user.click(deleteButton("Delete me"));
    await waitFor(() => expect(screen.getByTestId("task-list-failure")).toBeInTheDocument());
    expect(await axe(container)).toHaveNoViolations();
    await gate.release();
  });
});
