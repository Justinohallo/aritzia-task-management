import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

import TasksPage from "@/app/(protected)/tasks/page";

/**
 * The one trivial test T-01 owes: the toolchain (Jest, RTL, jest-axe) runs
 * against the page shell, and the shell renders the form slot above the
 * list slot. The stubs are replaced by T-04 and T-05.
 */
describe("tasks page shell", () => {
  it("renders the add-task form above the task list", () => {
    render(<TasksPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
    const form = screen.getByRole("region", { name: "Add a task" });
    const list = screen.getByRole("region", { name: "Your tasks" });
    expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(<TasksPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
