import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";

import { filterHref, matchesFilter, parseFilter } from "@/components/tasks/task-filters";
import { formatDueDate } from "@/components/tasks/task-item";
import { TaskList, sortTasks } from "@/components/tasks/task-list";
import { LiveRegion } from "@/components/ui/live-region";
import { TasksProvider } from "@/components/tasks/provider";
import { STORAGE_KEY, STORAGE_VERSION } from "@/lib/tasks/schema";
import { localToday } from "@/lib/tasks/validation";
import type { Task } from "@/types/task";

/**
 * A fake of the App Router's navigation hooks. The filter lives in the URL
 * (`AC-FILT-4`), so the test controls the URL: `push` records the history
 * and updates the search params the component reads on its next render.
 * `rerender` is the component seeing the new URL, as it would on
 * navigation; a fresh `render` against the same params is a reload.
 */
const nav = {
  pathname: "/tasks",
  search: new URLSearchParams(),
  history: [] as string[],
  push: jest.fn((url: string) => {
    nav.history.push(url);
    nav.search = new URLSearchParams(url.split("?")[1] ?? "");
  }),
  replace: jest.fn(),
  back: jest.fn(() => {
    nav.history.pop();
    const previous = nav.history[nav.history.length - 1] ?? nav.pathname;
    nav.search = new URLSearchParams(previous.split("?")[1] ?? "");
  }),
  prefetch: jest.fn(),
};
jest.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));

const TODAY = localToday();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

/** Seed `localStorage` as the provider persists it, then mount. */
function seed(tasks: Task[]) {
  const persisted = tasks.map(({ id, title, dueDate, completed, createdAt }) => ({ id, title, dueDate, completed, createdAt }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, tasks: persisted }));
}

function stored(): Array<{ id: string; title: string; completed: boolean }> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).tasks : [];
}

function renderList() {
  return render(
    <TasksProvider>
      <LiveRegion />
      <TaskList />
    </TasksProvider>,
  );
}

const rows = () => screen.queryAllByRole("listitem");
const titles = () => rows().map((row) => row.querySelector("label")?.textContent);
const filterRadio = (name: string) => screen.getByRole("radio", { name });
const checkbox = (title: string) => screen.getByRole("checkbox", { name: title });
const deleteButton = (title: string) => screen.getByRole("button", { name: `Delete ${title}` });

beforeEach(() => {
  window.localStorage.clear();
  nav.pathname = "/tasks";
  nav.search = new URLSearchParams();
  nav.history = [];
  nav.push.mockClear();
  nav.replace.mockClear();
});

describe("<TaskList /> — listing", () => {
  it("AC-LIST-1: each task shows its title, its due date, and its completion state", () => {
    seed([task({ title: "Order the lookbook", dueDate: "2030-03-15" }), task({ title: "File the invoice", dueDate: "2030-04-01", completed: true })]);
    renderList();

    const [pending, done] = rows();
    expect(pending).toHaveTextContent("Order the lookbook");
    expect(within(pending).getByText("Pending")).toBeInTheDocument();
    expect(checkbox("Order the lookbook")).not.toBeChecked();
    const time = pending.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2030-03-15");
    expect(time).toHaveTextContent(formatDueDate("2030-03-15"));

    expect(done).toHaveTextContent("File the invoice");
    expect(within(done).getByText("Completed")).toBeInTheDocument();
    expect(checkbox("File the invoice")).toBeChecked();
  });

  it("AC-LIST-1: the due date is shown as a calendar day, not shifted by timezone", () => {
    expect(formatDueDate("2030-03-01", "en-US")).toBe("Mar 1, 2030");
    expect(formatDueDate("2030-12-31", "en-US")).toBe("Dec 31, 2030");
  });

  it("AC-LIST-2: with no tasks at all, an empty state invites me to add my first task and no bare list renders", () => {
    renderList();

    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.getByText(/add your first task/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("AC-LIST-3: tasks are ordered by due date ascending, then by creation time ascending", () => {
    seed([
      task({ title: "C: due later", dueDate: "2030-02-01", createdAt: "2026-09-01T09:00:00.000Z" }),
      task({ title: "B: same day, created second", dueDate: "2030-01-01", createdAt: "2026-09-01T10:00:00.000Z" }),
      task({ title: "A: same day, created first", dueDate: "2030-01-01", createdAt: "2026-09-01T09:00:00.000Z" }),
      task({ title: "D: earliest due", dueDate: "2029-12-31", createdAt: "2026-09-02T09:00:00.000Z" }),
    ]);
    renderList();

    expect(titles()).toEqual(["D: earliest due", "A: same day, created first", "B: same day, created second", "C: due later"]);
  });

  it("AC-LIST-3: sortTasks is pure and deterministic regardless of input order", () => {
    const a = task({ title: "a", dueDate: "2030-01-01", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = task({ title: "b", dueDate: "2030-01-01", createdAt: "2026-01-02T00:00:00.000Z" });
    const c = task({ title: "c", dueDate: "2030-01-02", createdAt: "2025-01-01T00:00:00.000Z" });
    const input = [c, b, a];
    expect(sortTasks(input).map((t) => t.title)).toEqual(["a", "b", "c"]);
    expect(sortTasks([a, c, b]).map((t) => t.title)).toEqual(["a", "b", "c"]);
    expect(input.map((t) => t.title)).toEqual(["c", "b", "a"]);
  });

  it("AC-LIST-4: a pending task whose due date has passed is marked overdue by text and icon, not colour alone", () => {
    seed([
      task({ title: "Late and pending", dueDate: "2020-01-01", createdAt: "2026-09-01T09:00:00.000Z" }),
      task({ title: "Late but done", dueDate: "2020-01-01", completed: true, createdAt: "2026-09-01T10:00:00.000Z" }),
      task({ title: "Due today", dueDate: TODAY }),
      task({ title: "Due later", dueDate: "2030-01-01" }),
    ]);
    renderList();

    const [late, doneLate, today, later] = rows();
    expect(within(late).getByText("Overdue")).toBeInTheDocument();
    expect(late.querySelector("svg")).toBeInTheDocument();
    expect(late).toHaveAttribute("data-overdue", "true");
    expect(within(doneLate).queryByText("Overdue")).not.toBeInTheDocument();
    expect(within(today).queryByText("Overdue")).not.toBeInTheDocument();
    expect(within(later).queryByText("Overdue")).not.toBeInTheDocument();
    expect(TODAY).toMatch(ISO_DATE);
  });
});

describe("<TaskList /> — filtering", () => {
  const mixed = () => [
    task({ title: "Pending one", dueDate: "2030-01-01" }),
    task({ title: "Done one", dueDate: "2030-01-02", completed: true }),
    task({ title: "Pending two", dueDate: "2030-01-03" }),
  ];

  it("AC-FILT-1: All lists every task, pending and completed", () => {
    seed(mixed());
    renderList();

    expect(filterRadio("All")).toBeChecked();
    expect(titles()).toEqual(["Pending one", "Done one", "Pending two"]);
  });

  it("AC-FILT-2: selecting Pending lists only tasks that are not complete", async () => {
    const user = userEvent.setup();
    seed(mixed());
    const view = renderList();

    await user.click(filterRadio("Pending"));
    view.rerender(
      <TasksProvider>
        <LiveRegion />
        <TaskList />
      </TasksProvider>,
    );

    expect(filterRadio("Pending")).toBeChecked();
    expect(titles()).toEqual(["Pending one", "Pending two"]);
  });

  it("AC-FILT-3: selecting Completed lists only tasks that are complete", async () => {
    const user = userEvent.setup();
    seed(mixed());
    const view = renderList();

    await user.click(filterRadio("Completed"));
    view.rerender(
      <TasksProvider>
        <LiveRegion />
        <TaskList />
      </TasksProvider>,
    );

    expect(filterRadio("Completed")).toBeChecked();
    expect(titles()).toEqual(["Done one"]);
  });

  it("AC-FILT-4: selecting a filter writes it to the URL as a query parameter", async () => {
    const user = userEvent.setup();
    seed(mixed());
    renderList();

    await user.click(filterRadio("Completed"));
    expect(nav.push).toHaveBeenCalledWith("/tasks?filter=completed");
    expect(nav.search.get("filter")).toBe("completed");
  });

  it("AC-FILT-4: reloading a URL that names a filter restores it, and a recipient of the URL sees the same view", () => {
    seed(mixed());
    nav.search = new URLSearchParams("filter=completed");
    renderList();

    expect(filterRadio("Completed")).toBeChecked();
    expect(titles()).toEqual(["Done one"]);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("AC-FILT-4: All is the bare path, so the back button returns to the previous filter", async () => {
    const user = userEvent.setup();
    seed(mixed());
    const view = renderList();

    await user.click(filterRadio("Pending"));
    view.rerender(
      <TasksProvider>
        <LiveRegion />
        <TaskList />
      </TasksProvider>,
    );
    expect(filterRadio("Pending")).toBeChecked();
    await user.click(filterRadio("All"));
    expect(nav.push).toHaveBeenLastCalledWith("/tasks");
    expect(nav.history).toEqual(["/tasks?filter=pending", "/tasks"]);

    act(() => nav.back());
    view.rerender(
      <TasksProvider>
        <LiveRegion />
        <TaskList />
      </TasksProvider>,
    );
    expect(filterRadio("Pending")).toBeChecked();
    expect(titles()).toEqual(["Pending one", "Pending two"]);
  });

  it("AC-FILT-4: an unknown filter value in the URL reads as All rather than an empty view", () => {
    seed(mixed());
    nav.search = new URLSearchParams("filter=bogus");
    renderList();

    expect(filterRadio("All")).toBeChecked();
    expect(rows()).toHaveLength(3);
    expect(parseFilter(new URLSearchParams("filter=Completed"))).toBe("all");
    expect(parseFilter(null)).toBe("all");
    expect(filterHref("/tasks", "all")).toBe("/tasks");
    expect(filterHref("/tasks", "pending")).toBe("/tasks?filter=pending");
    expect(matchesFilter("pending", true)).toBe(false);
    expect(matchesFilter("completed", true)).toBe(true);
    expect(matchesFilter("all", true)).toBe(true);
  });

  it("AC-FILT-5: when tasks exist but none match, the empty state names the filter and differs from the no-tasks state", () => {
    seed([task({ title: "Only pending" })]);
    nav.search = new URLSearchParams("filter=completed");
    renderList();

    expect(screen.getByText("No completed tasks")).toBeInTheDocument();
    expect(screen.getByText(/none match the Completed filter/)).toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/add your first task/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("AC-FILT-6: completing a task under Pending removes it from view, keeps Pending active, and announces the removal", async () => {
    const user = userEvent.setup();
    seed(mixed());
    nav.search = new URLSearchParams("filter=pending");
    renderList();
    expect(titles()).toEqual(["Pending one", "Pending two"]);

    await user.click(checkbox("Pending one"));

    expect(titles()).toEqual(["Pending two"]);
    expect(filterRadio("Pending")).toBeChecked();
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Pending one marked complete and removed from the Pending list.");
  });

  it("AC-FILT-6: uncompleting a task under Completed likewise leaves the view with an announcement", async () => {
    const user = userEvent.setup();
    seed(mixed());
    nav.search = new URLSearchParams("filter=completed");
    renderList();

    await user.click(checkbox("Done one"));

    expect(screen.getByText("No completed tasks")).toBeInTheDocument();
    expect(filterRadio("Completed")).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Done one marked incomplete and removed from the Completed list.");
  });
});

describe("<TaskList /> — complete and delete", () => {
  it("AC-DONE-1: marking a pending task complete changes its state, and the control's accessible state reflects it", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Order the lookbook" })]);
    renderList();
    expect(checkbox("Order the lookbook")).toHaveAttribute("aria-checked", "false");

    await user.click(checkbox("Order the lookbook"));

    expect(checkbox("Order the lookbook")).toHaveAttribute("aria-checked", "true");
    expect(checkbox("Order the lookbook")).toBeChecked();
    expect(within(rows()[0]).getByText("Completed")).toBeInTheDocument();
    expect(rows()[0]).toHaveAttribute("data-completed", "true");
  });

  it("AC-DONE-2: marking a completed task incomplete returns it to Pending", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Order the lookbook", completed: true })]);
    renderList();
    expect(checkbox("Order the lookbook")).toBeChecked();

    await user.click(checkbox("Order the lookbook"));

    expect(checkbox("Order the lookbook")).not.toBeChecked();
    expect(within(rows()[0]).getByText("Pending")).toBeInTheDocument();
  });

  it("AC-DONE-3: completion is persisted and survives a reload", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Order the lookbook" })]);
    const first = renderList();

    await user.click(checkbox("Order the lookbook"));
    expect(stored()[0]).toMatchObject({ title: "Order the lookbook", completed: true });

    first.unmount();
    renderList();
    expect(checkbox("Order the lookbook")).toBeChecked();
  });

  it("AC-DEL-1: deleting a task removes it from the list and it does not return after reload", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Keep me" }), task({ title: "Delete me", dueDate: "2030-02-01" })]);
    const first = renderList();
    expect(rows()).toHaveLength(2);

    await user.click(deleteButton("Delete me"));

    expect(titles()).toEqual(["Keep me"]);
    expect(stored().map((t) => t.title)).toEqual(["Keep me"]);

    first.unmount();
    renderList();
    expect(titles()).toEqual(["Keep me"]);
  });

  it("AC-DEL-3: delete acts at once, with no confirmation dialog", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Delete me" })]);
    renderList();

    await user.click(deleteButton("Delete me"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it("AC-DEL-4: the delete control is focusable, labelled with the task title, and activated by Enter", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Order the lookbook" })]);
    renderList();

    const button = deleteButton("Order the lookbook");
    expect(button).toHaveAccessibleName("Delete Order the lookbook");
    await user.click(checkbox("Order the lookbook"));
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(rows()).toHaveLength(0);
  });

  it("AC-DEL-4: the delete control is activated by Space", async () => {
    const user = userEvent.setup();
    seed([task({ title: "Order the lookbook" })]);
    renderList();

    deleteButton("Order the lookbook").focus();
    await user.keyboard(" ");
    expect(rows()).toHaveLength(0);
  });

  it("AC-A11Y-6: has no automated accessibility violations in the listed, empty and filtered-empty states", async () => {
    const { container, unmount } = renderList();
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    seed([task({ title: "Late", dueDate: "2020-01-01" }), task({ title: "Done", completed: true })]);
    const listed = renderList();
    expect(await axe(listed.container)).toHaveNoViolations();
    listed.unmount();

    nav.search = new URLSearchParams("filter=completed");
    seed([task({ title: "Pending only" })]);
    const filtered = renderList();
    expect(await axe(filtered.container)).toHaveNoViolations();
  });
});
