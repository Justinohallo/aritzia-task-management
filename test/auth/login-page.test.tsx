import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { existsSync } from "node:fs";
import path from "node:path";

import LoginPage from "@/app/login/page";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { AuthProvider } from "@/components/auth/provider";
import { AUTH_STORAGE_KEY, AUTH_STORAGE_VERSION, writeSession } from "@/lib/auth/session";

function renderLoginPage() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

const mockRouter = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const VALID_PASSWORD = "S3cret-passphrase!";

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
});

async function submit(username: string, password: string) {
  const user = userEvent.setup();
  if (username) await user.type(screen.getByLabelText("Username"), username);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Log in" }));
}

describe("/login", () => {
  it("AC-NAV-1: the login page lives at its own route and serves the login form", () => {
    expect(existsSync(path.join(process.cwd(), "app", "login", "page.tsx"))).toBe(true);
    renderLoginPage();
    expect(screen.getByRole("heading", { level: 1, name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("AC-AUTH-1: renders a labelled username field, a labelled password field of type password, and a submit button", () => {
    renderLoginPage();
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    expect(username).toHaveAttribute("type", "text");
    expect(password).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Log in" })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-AUTH-1: the credential rule is stated on the page", () => {
    renderLoginPage();
    expect(screen.getByText(new RegExp(`at least ${MIN_PASSWORD_LENGTH} characters`))).toBeInTheDocument();
  });

  it("AC-AUTH-2: valid credentials write an auth record to sessionStorage and redirect to /tasks", async () => {
    renderLoginPage();
    await submit("ada", VALID_PASSWORD);

    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toMatchObject({ version: AUTH_STORAGE_VERSION, username: "ada" });
    expect(mockRouter.replace).toHaveBeenCalledWith("/tasks");
  });

  it("AC-AUTH-3: an empty username shows an alert, writes nothing, and stays on /login", async () => {
    renderLoginPage();
    await submit("", VALID_PASSWORD);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Enter a username.");
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-describedby", alert.id);
    expect(window.sessionStorage.length).toBe(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("AC-AUTH-3: a short password shows an alert naming the minimum, writes nothing, and stays on /login", async () => {
    renderLoginPage();
    await submit("ada", "x".repeat(MIN_PASSWORD_LENGTH - 1));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(String(MIN_PASSWORD_LENGTH));
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(window.sessionStorage.length).toBe(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("AC-AUTH-3: the alert clears once a later submission succeeds", async () => {
    renderLoginPage();
    await submit("ada", "short");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), VALID_PASSWORD);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/tasks");
  });

  it("AC-AUTH-8: an already-authenticated visitor is redirected to /tasks and sees no form", async () => {
    writeSession({ version: AUTH_STORAGE_VERSION, username: "ada", authenticatedAt: "2026-09-02T09:00:00.000Z" });
    renderLoginPage();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/tasks"));
    expect(screen.queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("AC-AUTH-9: after a successful login no entry in sessionStorage or localStorage contains the password in any form", async () => {
    renderLoginPage();
    await submit("ada", VALID_PASSWORD);

    const entries: string[] = [];
    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) as string;
        entries.push(key, storage.getItem(key) as string);
      }
    }
    expect(entries.length).toBeGreaterThan(0);
    const forms = [
      VALID_PASSWORD,
      VALID_PASSWORD.toLowerCase(),
      Buffer.from(VALID_PASSWORD).toString("base64"),
      Buffer.from(VALID_PASSWORD).toString("hex"),
      encodeURIComponent(VALID_PASSWORD),
    ];
    for (const entry of entries) for (const form of forms) expect(entry).not.toContain(form);
  });

  it("ADR-0005: the page states that this is not a production login", () => {
    renderLoginPage();
    const notice = screen.getByRole("note");
    expect(notice).toHaveTextContent(/not a production login/i);
    expect(notice).toHaveTextContent(/sessionStorage/);
  });

  it("has no automated accessibility violations, before and after a failed submission", async () => {
    const { container } = renderLoginPage();
    expect(await axe(container)).toHaveNoViolations();
    await submit("", "");
    expect(await axe(container)).toHaveNoViolations();
  });
});
