import "@testing-library/jest-dom";
import { toHaveNoViolations } from "jest-axe";

import { server } from "@/test/msw/server";

expect.extend(toHaveNoViolations);

// MSW intercepts at the network layer so the real fetch path is exercised
// (ADR-0006). An unhandled request is a test bug, not a warning.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
