import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";

import ProtectedLayout from "@/app/(protected)/layout";
import TasksPage from "@/app/(protected)/tasks/page";
import LoginPage from "@/app/login/page";
import { neighbourOf } from "@/components/tasks/task-list";
import { createApiClient, type ApiClient } from "@/lib/api/client";
import { AuthProvider } from "@/components/auth/provider";
import { AUTH_STORAGE_VERSION, writeSession } from "@/lib/auth/session";
import { ApiClientContext } from "@/lib/tasks/mutations";
import { STORAGE_KEY, STORAGE_VERSION } from "@/lib/tasks/schema";
import { handlersFor, serverError } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";
import type { Task } from "@/types/task";

/**
 * The accessibility pass (`AC-A11Y-1..6`), asserted on the two pages as the
 * user gets them: the login page, and the tasks page inside the protected
 * layout with the one live region mounted. This file is where each
 * criterion is named and proved, including focus following a row that
 * leaves the view.
 *
 * `AC-A11Y-4` is also a manual keyboard walk in a real browser, recorded
 * as `◉` per the `ACCEPTANCE.md` legend, because jsdom does not paint a
 * focus ring and cannot say whether focus *looks* visible. The walk was
 * run on 2026-09-02 against the production build (`next build && next
 * start`) in Chromium 1024×800, driven by Playwright with human pacing,
 * twice; at each of its 26 stops the focused element matched
 * `:focus-visible`, had a painted ring (a non-`none` box-shadow), and was
 * never `<body>`. The steps:
 *
 *   1. /login. Tab → Username (ring visible), type; Tab → Password, type;
 *      Tab → "Log in", Enter → /tasks. Focus visible at every stop.
 *   2. /tasks. Tab → "Log out", Tab → Title, type; Tab → Due date, type;
 *      Tab → "Add task", Enter. Row appears; focus is back on Title.
 *   3. Tab → the filter group (one tab stop, roving). ← / → move between
 *      All, Pending, Completed; each change re-renders the list.
 *   4. Tab → the row's checkbox, Space marks it complete (badge reads
 *      "Completed", label struck through, aria-checked=true). Under
 *      Pending the row leaves and focus lands on the next row's checkbox.
 *   5. Tab → the row's Delete, Enter. Row gone; focus lands on the next
 *      row's Delete, or on the active filter when the list is empty.
 *   6. Shift+Tab back to "Log out", Enter → /login. Nowhere was focus
 *      trapped; document.activeElement was never <body>.
 */
const mockRouter = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/tasks",
  useSearchParams: () => nav.search,
}));
const nav = { search: new URLSearchParams() };

const VALID_PASSWORD = "S3cret-passphrase!";

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

function signIn(username = "ada") {
  writeSession({ version: AUTH_STORAGE_VERSION, username, authenticatedAt: "2026-09-02T09:00:00.000Z" });
}

/** Instant timers and a fixed jitter draw, so a scripted failure settles in milliseconds. */
function testClient(): ApiClient {
  return createApiClient({
    sleep: async () => {},
    retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1, timeoutMs: 10_000, random: () => 0 },
  });
}

/** The tasks page as the user gets it: signed in, inside the protected layout. */
function renderTasksPage() {
  signIn();
  return render(
    <AuthProvider>
      <ApiClientContext.Provider value={testClient()}>
        <ProtectedLayout>
          <TasksPage />
        </ProtectedLayout>
      </ApiClientContext.Provider>
    </AuthProvider>,
  );
}

/** The login page as the user gets it: `<AuthProvider>` mounted in the root layout. */
function renderLoginPage() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

/** Every focusable control on the page, in document order. */
function controls(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [role="checkbox"], [role="radio"], [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/** The text a screen reader would call this control by. */
function accessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();
  if (el.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  return (el.textContent ?? "").trim();
}

const status = () => screen.getByRole("status");
const alert = () => screen.getByRole("alert");
const rows = () => screen.queryAllByRole("listitem");
const checkbox = (title: string) => screen.getByRole("checkbox", { name: title });
const deleteButton = (title: string) => screen.getByRole("button", { name: `Delete ${title}` });

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  nav.search = new URLSearchParams();
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
});

describe("AC-A11Y-1 — every control is labelled", () => {
  it("AC-A11Y-1: on the login page every input and button has an accessible name and none relies on a placeholder", () => {
    const { container } = renderLoginPage();
    const found = controls(container);
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const el of found) {
      expect(accessibleName(el)).not.toBe("");
      expect(el).not.toHaveAttribute("placeholder");
    }
  });

  it("AC-A11Y-1: on the tasks page every input, button, checkbox and filter has an accessible name and none relies on a placeholder", async () => {
    seed([task({ title: "Write the report" }), task({ title: "Book the venue", completed: true })]);
    const { container } = renderTasksPage();
    await screen.findByRole("checkbox", { name: "Write the report" });

    const found = controls(container);
    // Log out, Title, Due date, Add task, three filters, two checkboxes, two deletes.
    expect(found.length).toBeGreaterThanOrEqual(11);
    for (const el of found) {
      expect(accessibleName(el)).not.toBe("");
      expect(el).not.toHaveAttribute("placeholder");
    }
    expect(screen.getByRole("radiogroup", { name: "Filter tasks" })).toBeInTheDocument();
    expect(checkbox("Write the report")).toBeInTheDocument();
    expect(deleteButton("Write the report")).toBeInTheDocument();
  });
});

describe("AC-A11Y-2 — errors are programmatically associated", () => {
  it("AC-A11Y-2: a failing task field is aria-invalid and aria-describedby points at its own error text", async () => {
    const user = userEvent.setup();
    renderTasksPage();
    const title = await screen.findByLabelText("Title");
    const dueDate = screen.getByLabelText("Due date");

    expect(title).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    for (const field of [title, dueDate]) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      const describedBy = field.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const error = document.getElementById(describedBy!);
      expect(error).not.toBeNull();
      expect(error!.textContent?.trim()).not.toBe("");
      expect(field).toHaveAccessibleDescription(error!.textContent!.trim());
    }
  });

  it("AC-A11Y-2: a failing login field is aria-invalid and described by the alert", async () => {
    const user = userEvent.setup();
    renderLoginPage();
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const username = screen.getByLabelText("Username");
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAccessibleDescription(alert().textContent!.trim());
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid");
  });

  it("AC-A11Y-2: the association is removed once the error clears", async () => {
    const user = userEvent.setup();
    renderTasksPage();
    const title = await screen.findByLabelText("Title");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(title).toHaveAttribute("aria-invalid", "true");

    await user.type(title, "Fixed");
    await user.type(screen.getByLabelText("Due date"), "2030-06-01");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await screen.findByRole("checkbox", { name: "Fixed" });

    expect(title).not.toHaveAttribute("aria-invalid");
    expect(title).not.toHaveAttribute("aria-describedby");
  });
});

describe("AC-A11Y-3 — asynchronous outcomes are announced", () => {
  it("AC-A11Y-3: a create that succeeds is announced in the polite live region", async () => {
    const user = userEvent.setup();
    renderTasksPage();
    await user.type(await screen.findByLabelText("Title"), "Ship it");
    await user.type(screen.getByLabelText("Due date"), "2030-06-01");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(status()).toHaveTextContent('"Ship it" added.'));
    expect(alert()).toHaveTextContent("");
  });

  it("AC-A11Y-3: a create that fails is announced in the assertive live region", async () => {
    server.use(...handlersFor([serverError(500), serverError(500)]));
    const user = userEvent.setup();
    renderTasksPage();
    await user.type(await screen.findByLabelText("Title"), "Ship it");
    await user.type(screen.getByLabelText("Due date"), "2030-06-01");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(alert()).toHaveTextContent(/could not add "Ship it"/i));
  });

  it("AC-A11Y-3: a completion is announced", async () => {
    seed([task({ title: "Write the report" })]);
    const user = userEvent.setup();
    renderTasksPage();
    await user.click(await screen.findByRole("checkbox", { name: "Write the report" }));

    expect(status()).toHaveTextContent("Write the report marked complete.");
  });

  it("AC-A11Y-3: a delete that succeeds is announced in the polite live region", async () => {
    seed([task({ title: "Write the report" })]);
    const user = userEvent.setup();
    renderTasksPage();
    await user.click(await screen.findByRole("button", { name: "Delete Write the report" }));

    await waitFor(() => expect(status()).toHaveTextContent('"Write the report" deleted.'));
    expect(alert()).toHaveTextContent("");
  });

  it("AC-A11Y-3: a delete that fails is announced in the assertive live region and the row is back", async () => {
    server.use(...handlersFor([serverError(503), serverError(503)]));
    seed([task({ title: "Write the report" })]);
    const user = userEvent.setup();
    renderTasksPage();
    await user.click(await screen.findByRole("button", { name: "Delete Write the report" }));

    await waitFor(() => expect(alert()).toHaveTextContent(/could not delete "Write the report"/i));
    expect(checkbox("Write the report")).toBeInTheDocument();
  });

  it("AC-A11Y-3: there is exactly one polite and one assertive live region on the page", async () => {
    seed([task({ title: "Write the report" })]);
    renderTasksPage();
    await screen.findByRole("checkbox", { name: "Write the report" });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("AC-A11Y-4 — full keyboard operability", () => {
  it("AC-A11Y-4: the login form is completed and submitted by keyboard alone", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    // The username field takes focus on load; Tab walks the rest in order.
    await waitFor(() => expect(screen.getByLabelText("Username")).toHaveFocus());
    await user.keyboard("ada");
    await user.tab();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await user.keyboard(VALID_PASSWORD);
    await user.tab();
    expect(screen.getByRole("button", { name: "Log in" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/tasks"));
  });

  it("AC-A11Y-4: a task is added, filtered, completed and deleted by keyboard alone, and the session is ended", async () => {
    seed([task({ title: "Existing", dueDate: "2031-01-01" })]);
    const user = userEvent.setup();
    renderTasksPage();
    await screen.findByRole("checkbox", { name: "Existing" });

    // Log out is first in the tab order; skip past it to the form.
    await user.tab();
    expect(screen.getByRole("button", { name: "Log out" })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Title")).toHaveFocus();
    await user.keyboard("Typed by keyboard");
    await user.tab();
    expect(screen.getByLabelText("Due date")).toHaveFocus();
    await user.keyboard("2030-06-01");
    await user.tab();
    expect(screen.getByRole("button", { name: "Add task" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByRole("checkbox", { name: "Typed by keyboard" });
    // Focus returns to the title so the next task can be typed (`AC-ADD-6`).
    expect(screen.getByLabelText("Title")).toHaveFocus();
    await waitFor(() => expect(status()).toHaveTextContent('"Typed by keyboard" added.'));

    // The filter is one tab stop; arrows move within it, Space selects.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("radio", { name: "All" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Pending" })).toHaveFocus();
    await user.keyboard(" ");
    expect(mockRouter.push).toHaveBeenCalledWith("/tasks?filter=pending");

    // Complete by Space, delete by Enter.
    await user.tab();
    expect(checkbox("Typed by keyboard")).toHaveFocus();
    await user.keyboard(" ");
    expect(checkbox("Typed by keyboard")).toBeChecked();
    await user.tab();
    expect(deleteButton("Typed by keyboard")).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Typed by keyboard" })).not.toBeInTheDocument());

    // Focus is never trapped: Shift+Tab walks back out to Log out, which ends the session.
    const logout = screen.getByRole("button", { name: "Log out" });
    for (let i = 0; i < 12 && document.activeElement !== logout; i += 1) {
      await user.tab({ shift: true });
    }
    expect(logout).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
  });

  it("AC-A11Y-4: deleting a row by keyboard moves focus to the next row's delete control, not to the document body", async () => {
    seed([
      task({ title: "First", dueDate: "2030-01-01" }),
      task({ title: "Second", dueDate: "2030-01-02" }),
      task({ title: "Third", dueDate: "2030-01-03" }),
    ]);
    const user = userEvent.setup();
    renderTasksPage();
    await screen.findByRole("checkbox", { name: "First" });

    deleteButton("Second").focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete Second" })).not.toBeInTheDocument());
    expect(deleteButton("Third")).toHaveFocus();

    // The last row hands focus back to the one above it.
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete Third" })).not.toBeInTheDocument());
    expect(deleteButton("First")).toHaveFocus();

    // With no row left, focus lands on the active filter rather than <body>.
    await user.keyboard("{Enter}");
    await waitFor(() => expect(rows()).toHaveLength(0));
    expect(screen.getByRole("radio", { name: "All" })).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("AC-A11Y-4: completing a row under a filter that hides it moves focus to the next row's checkbox", async () => {
    nav.search = new URLSearchParams("filter=pending");
    seed([task({ title: "First", dueDate: "2030-01-01" }), task({ title: "Second", dueDate: "2030-01-02" })]);
    const user = userEvent.setup();
    renderTasksPage();
    await screen.findByRole("checkbox", { name: "First" });

    checkbox("First").focus();
    await user.keyboard(" ");
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "First" })).not.toBeInTheDocument());
    expect(checkbox("Second")).toHaveFocus();
    expect(status()).toHaveTextContent("First marked complete and removed from the Pending list.");
  });

  it("AC-A11Y-4: focus is left alone when the leaving row did not hold it", async () => {
    seed([task({ title: "First", dueDate: "2030-01-01" }), task({ title: "Second", dueDate: "2030-01-02" })]);
    renderTasksPage();
    const title = await screen.findByLabelText("Title");

    title.focus();
    // A synthetic click that does not move focus (a browser that does not
    // focus buttons on click, or an assistive tool activating the control).
    fireEvent.click(deleteButton("First"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Delete First" })).not.toBeInTheDocument());
    expect(title).toHaveFocus();
  });

  it("AC-A11Y-4: neighbourOf prefers the next row, then the previous, then none", () => {
    const visible = [task({ title: "a" }), task({ title: "b" }), task({ title: "c" })];
    expect(neighbourOf(visible, 0)?.title).toBe("b");
    expect(neighbourOf(visible, 1)?.title).toBe("c");
    expect(neighbourOf(visible, 2)?.title).toBe("b");
    expect(neighbourOf([visible[0]], 0)).toBeNull();
  });
});

describe("AC-A11Y-5 — no colour-only meaning", () => {
  it("AC-A11Y-5: pending, completed and overdue are each conveyed by text, and completion by the checkbox state", async () => {
    seed([
      task({ title: "Late", dueDate: "2020-01-01" }),
      task({ title: "Done", completed: true }),
      task({ title: "Open", dueDate: "2030-01-01" }),
    ]);
    renderTasksPage();
    await screen.findByRole("checkbox", { name: "Late" });

    const rowOf = (title: string) => within(checkbox(title).closest("li")!);
    expect(rowOf("Late").getByText("Overdue")).toBeInTheDocument();
    expect(rowOf("Late").getByText("Pending")).toBeInTheDocument();
    expect(rowOf("Done").getByText("Completed")).toBeInTheDocument();
    expect(rowOf("Done").queryByText("Overdue")).not.toBeInTheDocument();
    expect(checkbox("Done")).toBeChecked();
    expect(rowOf("Open").getByText("Pending")).toBeInTheDocument();
    expect(rowOf("Open").queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("AC-A11Y-5: a validation error and a request failure are each conveyed by text, not by a red border alone", async () => {
    server.use(...handlersFor([serverError(500), serverError(500)]));
    const user = userEvent.setup();
    renderTasksPage();
    const title = await screen.findByLabelText("Title");

    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(title).toHaveAccessibleDescription(/title/i);

    await user.type(title, "Ship it");
    await user.type(screen.getByLabelText("Due date"), "2030-06-01");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const failure = await screen.findByTestId("task-form-failure");
    expect(failure).toHaveTextContent(/could not add "Ship it"/i);
  });

  it("AC-A11Y-5: the active filter is exposed as a checked state, not a colour", async () => {
    nav.search = new URLSearchParams("filter=completed");
    renderTasksPage();
    await screen.findByRole("radiogroup", { name: "Filter tasks" });
    expect(screen.getByRole("radio", { name: "Completed" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("AC-A11Y-6 — automated accessibility checks pass", () => {
  it("AC-A11Y-6: the login page has no violations, empty and after a failed submission", async () => {
    const user = userEvent.setup();
    const { container } = renderLoginPage();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-A11Y-6: the tasks page has no violations with pending, completed and overdue rows, under each filter, and with form errors", async () => {
    seed([task({ title: "Late", dueDate: "2020-01-01" }), task({ title: "Done", completed: true }), task({ title: "Open" })]);
    const user = userEvent.setup();
    const { container } = renderTasksPage();
    await screen.findByRole("checkbox", { name: "Late" });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await axe(container)).toHaveNoViolations();

    nav.search = new URLSearchParams("filter=completed");
    await user.click(screen.getByRole("radio", { name: "Completed" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("AC-A11Y-6: the tasks page has no violations in its empty state", async () => {
    const { container } = renderTasksPage();
    await screen.findByText("No tasks yet");
    expect(await axe(container)).toHaveNoViolations();
  });
});
