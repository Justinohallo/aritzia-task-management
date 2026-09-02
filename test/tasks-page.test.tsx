import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

import TasksPage from "@/app/(protected)/tasks/page";
import { TasksProvider } from "@/lib/tasks/provider";

/**
 * The one trivial test T-01 owes: the toolchain (Jest, RTL, jest-axe) runs
 * against the page shell, and the shell renders the form slot above the
 * list slot. The stubs are replaced by T-04 and T-05. The page is rendered
 * inside `<TasksProvider>` as the protected layout mounts it (B-20): the
 * real form and list read the provider hooks, which throw without it.
 */
function renderPage() {
  return render(
    <TasksProvider>
      <TasksPage />
    </TasksProvider>,
  );
}
describe("tasks page shell", () => {
  it("renders the add-task form above the task list", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    const form = screen.getByRole("region", { name: "Add a task" });
    const list = screen.getByRole("region", { name: "Your tasks" });
    expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
  });
});
