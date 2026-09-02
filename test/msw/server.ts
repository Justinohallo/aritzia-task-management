import { setupServer } from "msw/node";

import { handlers } from "@/test/msw/handlers";

/**
 * One MSW server for the Jest suite, started and reset in `jest.setup.ts`.
 * Tests override per case with `server.use(...handlersFor(script))`; the
 * `afterEach` reset returns to the defaults.
 */
export const server = setupServer(...handlers);
