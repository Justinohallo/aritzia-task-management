import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import ProtectedLayout from "@/app/(protected)/layout";
import LoginPage from "@/app/login/page";
import { AuthProvider } from "@/components/auth/provider";
import { AUTH_STORAGE_VERSION, writeSession } from "@/lib/auth/session";

const mockRouter = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/tasks",
  useSearchParams: () => new URLSearchParams(),
}));

const DEEP_DIVE_URL = "https://github.com/Justinohallo/aritzia-task-management/blob/main/docs/deep-dive/README.md";

function signIn(username = "ada") {
  writeSession({ version: AUTH_STORAGE_VERSION, username, authenticatedAt: "2026-09-02T09:00:00.000Z" });
}

beforeEach(() => {
  window.sessionStorage.clear();
  mockRouter.replace.mockClear();
});

describe("components/navigation/site-nav.tsx", () => {
  it("AC-NAV-1: the login page carries links to the presentation and the technical walkthrough", () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    expect(screen.getByRole("link", { name: "Technical Walkthrough" })).toHaveAttribute("href", DEEP_DIVE_URL);
    expect(screen.getByRole("link", { name: "Presentation" })).toHaveAttribute("href", "/presentation");
  });

  it("AC-NAV-1: an unauthenticated visitor on /login sees a Log in link rather than a Tasks link", () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "Tasks" })).not.toBeInTheDocument();
  });

  it("AC-NAV-2: the task list page carries links to the presentation and the technical walkthrough", () => {
    signIn();
    render(
      <AuthProvider>
        <ProtectedLayout>
          <p>content</p>
        </ProtectedLayout>
      </AuthProvider>,
    );

    expect(screen.getByRole("link", { name: "Technical Walkthrough" })).toHaveAttribute("href", DEEP_DIVE_URL);
    expect(screen.getByRole("link", { name: "Presentation" })).toHaveAttribute("href", "/presentation");
  });

  it("AC-NAV-2: a signed-in visitor sees a Tasks link rather than a Log in link", () => {
    signIn();
    render(
      <AuthProvider>
        <ProtectedLayout>
          <p>content</p>
        </ProtectedLayout>
      </AuthProvider>,
    );

    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/tasks");
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("AC-NAV-1: before the post-mount auth read resolves, neither the Log in nor the Tasks link renders", () => {
    const html = renderToString(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    expect(html).toContain("Technical Walkthrough");
    expect(html).toContain("Presentation</a>");
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/tasks"');
  });
});
