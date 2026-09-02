import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";

import ProtectedLayout from "@/app/(protected)/layout";
import TasksPage from "@/app/(protected)/tasks/page";
import LoginPage from "@/app/login/page";
import { announce } from "@/components/ui/live-region";
import { AUTH_STORAGE_KEY, AUTH_STORAGE_VERSION, writeSession } from "@/lib/auth/session";
import { useTasks } from "@/lib/tasks/hooks";

const mockRouter = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/tasks",
  useSearchParams: () => new URLSearchParams(),
}));

const PAGE_TEXT = "Secret task data";

/** A mock component, so a test can assert it was never rendered. */
const Page = jest.fn(function Page() {
  return <p>{PAGE_TEXT}</p>;
});

function signIn(username = "ada") {
  writeSession({ version: AUTH_STORAGE_VERSION, username, authenticatedAt: "2026-09-02T09:00:00.000Z" });
}

function renderProtected(children: React.ReactNode = <Page />) {
  return render(<ProtectedLayout>{children}</ProtectedLayout>);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockRouter.replace.mockClear();
  Page.mockClear();
});

describe("app/(protected)/layout.tsx", () => {
  it("AC-AUTH-7: an unauthenticated visitor is redirected to /login and the page never renders", async () => {
    renderProtected();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(Page).not.toHaveBeenCalled();
    expect(screen.queryByText(PAGE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("AC-AUTH-7: the server render of a protected route contains no page content", () => {
    const html = renderToString(
      <ProtectedLayout>
        <Page />
      </ProtectedLayout>,
    );
    expect(html).not.toContain(PAGE_TEXT);
    expect(html).not.toContain("Log out");
    expect(Page).not.toHaveBeenCalled();
  });

  it("AC-AUTH-4: with a session in sessionStorage the page renders, and it still does after a reload", () => {
    signIn();
    const first = renderProtected();
    expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    // A reload in the same tab: the React tree is torn down and rebuilt,
    // and the tab's sessionStorage is exactly as it was.
    first.unmount();
    renderProtected();
    expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();
    expect(screen.getByText(/signed in as/i)).toHaveTextContent("ada");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("AC-AUTH-5: a session started in tab A does not exist in a new tab, which is redirected to /login", async () => {
    // Tab A: log in through the real form.
    const tabA = render(<LoginPage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    tabA.unmount();
    mockRouter.replace.mockClear();

    // A new tab, per the HTML spec, starts with an empty sessionStorage and
    // shares the origin's localStorage. jsdom has one window, so the new tab
    // is modelled exactly that way: sessionStorage emptied, localStorage
    // left as tab A left it. The assertion that makes this honest is the
    // one below it: nothing about the session was put in localStorage, so
    // there is nothing for the new tab to inherit.
    window.sessionStorage.clear();
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) as string;
      expect(window.localStorage.getItem(key)).not.toContain("ada");
    }

    renderProtected();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(Page).not.toHaveBeenCalled();
    expect(screen.queryByText(PAGE_TEXT)).not.toBeInTheDocument();
  });

  it("AC-AUTH-6: activating Log out removes the record from sessionStorage and redirects to /login", async () => {
    signIn();
    renderProtected();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(PAGE_TEXT)).not.toBeInTheDocument();
  });

  it("AC-NAV-2: the task list page lives at its own route under the protected layout and is served when signed in", () => {
    expect(existsSync(path.join(process.cwd(), "app", "(protected)", "tasks", "page.tsx"))).toBe(true);
    signIn();
    renderProtected(<TasksPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
  });

  it("AC-NAV-4: a new route under the layout is protected with no code of its own", async () => {
    function NewPage() {
      return <p>Another protected page</p>;
    }
    const signedOut = renderProtected(<NewPage />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Another protected page")).not.toBeInTheDocument();
    signedOut.unmount();

    signIn();
    renderProtected(<NewPage />);
    expect(screen.getByText("Another protected page")).toBeInTheDocument();
  });

  it("AC-NAV-4: the guard is used in exactly one place under app/, the protected layout, and the tasks page carries none", () => {
    const appDir = path.join(process.cwd(), "app");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(appDir);
    const usingGuard = files.filter((f) => /\bRequireAuth\b/.test(readFileSync(f, "utf8")));
    expect(usingGuard.map((f) => path.relative(process.cwd(), f))).toEqual(["app/(protected)/layout.tsx"]);

    const tasksPage = readFileSync(path.join(appDir, "(protected)", "tasks", "page.tsx"), "utf8");
    expect(tasksPage).not.toMatch(/lib\/auth/);
  });

  it("mounts <LiveRegion /> once, inside the guard, so later tasks announce through it (T-01 contract, B-07)", () => {
    signIn();
    renderProtected();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    act(() => announce("Task deleted"));
    expect(screen.getByRole("status")).toHaveTextContent("Task deleted");
  });

  it("AC-STATE-1: mounts <TasksProvider> inside RequireAuth so task hooks work on protected pages", () => {
    function Probe() {
      const tasks = useTasks();
      return <p>task count {tasks.length}</p>;
    }
    signIn();
    renderProtected(<Probe />);
    expect(screen.getByText("task count 0")).toBeInTheDocument();
  });

  it("has no automated accessibility violations when signed in", async () => {
    signIn();
    const { container } = renderProtected(<TasksPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
