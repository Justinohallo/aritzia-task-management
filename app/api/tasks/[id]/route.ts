/**
 * `DELETE /api/tasks/:id` — the browser-facing delete endpoint (ADR-0004).
 * Behaviour lives in `lib/server/handlers.ts`; this file is the binding.
 */
import { deleteTaskHandler, productionDeps } from "@/lib/server/handlers";

export const DELETE = deleteTaskHandler(productionDeps);
