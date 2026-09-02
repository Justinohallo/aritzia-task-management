import { act, render, screen } from "@testing-library/react";

import { LiveRegion, announce, useAnnounce } from "@/components/ui/live-region";

function Announcer({ message, assertive }: { message: string; assertive?: boolean }) {
  const say = useAnnounce();
  return (
    <button type="button" onClick={() => say(message, { assertive })}>
      say
    </button>
  );
}

describe("<LiveRegion /> and useAnnounce()", () => {
  it("routes polite announcements to the status region and assertive ones to the alert region", () => {
    render(<LiveRegion />);

    act(() => announce("Task deleted"));
    expect(screen.getByRole("status")).toHaveTextContent("Task deleted");
    expect(screen.getByRole("alert")).toHaveTextContent("");

    act(() => announce("Could not save the task", { assertive: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the task");
    expect(screen.getByRole("status")).toHaveTextContent("Task deleted");
  });

  it("returns the same announce function from the hook", () => {
    render(
      <>
        <LiveRegion />
        <Announcer message="Filter set to Pending" />
      </>,
    );
    act(() => screen.getByRole("button", { name: "say" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("Filter set to Pending");
  });

  it("drops announcements made while no region is mounted", () => {
    expect(() => announce("nobody is listening")).not.toThrow();
  });
});
