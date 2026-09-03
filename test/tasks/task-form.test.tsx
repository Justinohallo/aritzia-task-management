import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";

import { TaskForm } from "@/components/tasks/task-form";
import { TasksProvider, useTasks } from "@/components/tasks/provider";
import { STORAGE_KEY, TASK_TITLE_MAX_LENGTH } from "@/lib/tasks/schema";
import { isOverdue } from "@/lib/tasks/validation";

/** Renders provider state so the form's effect is asserted where it lands, without the real list. */
function Probe() {
  const tasks = useTasks();
  return (
    <ul aria-label="probe">
      {tasks.map((t) => (
        <li key={t.id} data-due={t.dueDate} data-completed={t.completed} data-overdue={isOverdue(t.dueDate)}>
          {t.title}
        </li>
      ))}
    </ul>
  );
}

function renderForm() {
  return render(
    <TasksProvider>
      <TaskForm />
      <Probe />
    </TasksProvider>,
  );
}

const title = () => screen.getByLabelText("Title");
const dueDate = () => screen.getByLabelText("Due date");
const submit = () => screen.getByRole("button", { name: "Add task" });
const rows = () => screen.queryAllByRole("listitem");

beforeEach(() => {
  window.localStorage.clear();
});

describe("<TaskForm />", () => {
  it("AC-UI-1: the due date field carries data-empty until a date is entered, for the iOS placeholder", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(dueDate()).toHaveAttribute("data-empty", "");
    await user.type(dueDate(), "2026-09-10");
    expect(dueDate()).not.toHaveAttribute("data-empty");
  });

  it("AC-ADD-1: a title and a due date create a pending task with those values", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), "Order the lookbook");
    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    const [row] = rows();
    expect(rows()).toHaveLength(1);
    expect(row).toHaveTextContent("Order the lookbook");
    expect(row).toHaveAttribute("data-due", "2026-09-10");
    expect(row).toHaveAttribute("data-completed", "false");
  });

  it("AC-ADD-1: the created task is persisted through the provider", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), "Order the lookbook");
    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.tasks).toHaveLength(1);
    expect(stored.tasks[0]).toMatchObject({ title: "Order the lookbook", dueDate: "2026-09-10", completed: false });
  });

  it("AC-ADD-2: an empty title creates nothing, shows an inline error linked via aria-describedby, and makes no request", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderForm();

    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    expect(rows()).toHaveLength(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    const field = title();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Enter a title.");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)).toHaveTextContent("Enter a title.");
    expect(dueDate()).not.toHaveAttribute("aria-invalid");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("AC-ADD-3: a title with no due date creates nothing and shows an inline error on the due-date field", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), "Order the lookbook");
    await user.click(submit());

    expect(rows()).toHaveLength(0);
    const field = dueDate();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Choose a due date.");
    expect(title()).not.toHaveAttribute("aria-invalid");
  });

  it("AC-ADD-4: a whitespace-only title creates nothing", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), "   ");
    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    expect(rows()).toHaveLength(0);
    expect(title()).toHaveAttribute("aria-invalid", "true");
  });

  it("AC-ADD-4: leading and trailing whitespace is trimmed from the stored title", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), "   Order the lookbook   ");
    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toBe("Order the lookbook");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.tasks[0].title).toBe("Order the lookbook");
  });

  it(`AC-ADD-5: a title over ${TASK_TITLE_MAX_LENGTH} characters is rejected with an inline error stating the limit`, async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(title());
    await user.paste("x".repeat(TASK_TITLE_MAX_LENGTH + 1));
    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    expect(rows()).toHaveLength(0);
    expect(title()).toHaveAttribute("aria-invalid", "true");
    expect(title()).toHaveAccessibleDescription(new RegExp(String(TASK_TITLE_MAX_LENGTH)));
  });

  it("AC-ADD-6: after success the fields are cleared and focus returns to the title", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), "Order the lookbook");
    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    expect(rows()).toHaveLength(1);
    expect(title()).toHaveValue("");
    expect(dueDate()).toHaveValue("");
    expect(title()).toHaveFocus();
    expect(title()).not.toHaveAttribute("aria-invalid");
  });

  it("AC-ADD-6: a previous error is cleared by a successful submission", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(submit());
    expect(title()).toHaveAttribute("aria-invalid", "true");
    expect(dueDate()).toHaveAttribute("aria-invalid", "true");

    await user.type(title(), "Order the lookbook");
    await user.type(dueDate(), "2026-09-10");
    await user.click(submit());

    expect(rows()).toHaveLength(1);
    expect(title()).not.toHaveAttribute("aria-invalid");
    expect(dueDate()).not.toHaveAttribute("aria-invalid");
    expect(title()).not.toHaveAttribute("aria-describedby");
  });

  it("AC-ADD-7: a past due date is accepted and the task reads as overdue", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(title(), "Return the samples");
    await user.type(dueDate(), "2020-01-01");
    await user.click(submit());

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveAttribute("data-due", "2020-01-01");
    expect(rows()[0]).toHaveAttribute("data-overdue", "true");
    expect(dueDate()).not.toHaveAttribute("aria-invalid");
  });

  it("AC-A11Y-2: has no automated accessibility violations, with and without errors", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(submit());
    expect(await axe(container)).toHaveNoViolations();
  });
});
