/**
 * `POST /api/tasks` — the browser-facing create endpoint (ADR-0004).
 * Behaviour lives in `lib/server/handlers.ts`; this file is the binding.
 */
import { createTaskHandler, productionDeps } from "@/lib/server/handlers";

export const POST = createTaskHandler(productionDeps);
