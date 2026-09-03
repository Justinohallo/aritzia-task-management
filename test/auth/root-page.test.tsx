import { render, waitFor } from "@testing-library/react";

import HomePage from "@/app/page";
import { AuthProvider } from "@/components/auth/provider";
import { AUTH_STORAGE_VERSION, writeSession } from "@/lib/auth/session";

function renderHomePage() {
  return render(
    <AuthProvider>
      <HomePage />
    </AuthProvider>,
  );
}

const mockRouter = { replace: jest.fn(), push: jest.fn(), prefetch: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

beforeEach(() => {
  window.sessionStorage.clear();
  mockRouter.replace.mockClear();
});

describe("/", () => {
  it("AC-NAV-3: redirects an authenticated visitor to /tasks", async () => {
    writeSession({ version: AUTH_STORAGE_VERSION, username: "ada", authenticatedAt: "2026-09-02T09:00:00.000Z" });
    const { container } = renderHomePage();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/tasks"));
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it("AC-NAV-3: redirects an unauthenticated visitor to /login", async () => {
    const { container } = renderHomePage();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});
