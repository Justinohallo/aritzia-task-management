/**
 * The browser-facing Route Handlers, as functions (ADR-0004, as amended),
 * exported bound to {@link productionDeps}. Each validates the request,
 * reads the private key from server environment, presents it to the
 * upstream, and passes its status and body through unchanged — `401`
 * (`AC-API-4`) and `Retry-After` (`AC-API-5`) included. The body schema
 * strips unknown fields, so the browser's request carries no key
 * (`AC-API-3`). Dependencies are injected for testing without touching
 * `process.env` or the shared upstream.
 */
import { z } from "zod";

import { readApiKey } from "@/lib/server/env";
import { getUpstream } from "@/lib/server/upstream";
import { persistedTaskSchema, taskIdSchema } from "@/lib/tasks/schema";
import { RETRY_AFTER_HEADER, type ApiErrorBody, type Upstream, type UpstreamResult } from "@/types/api";

// --- Request validation — composed from the frozen field schemas, never restated ---

/** `POST /api/tasks` body: the persisted task's fields minus `completed`, exactly `CreateTaskRequest`, derived rather than restated. Unknown keys are stripped. */
export const createTaskRequestSchema = persistedTaskSchema.omit({ completed: true });

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
}

// --- Responses ---

const NO_STORE = { "Cache-Control": "no-store" };

function invalidRequest(message: string): Response {
  const body: ApiErrorBody = { error: { code: "invalid_request", message } };
  return Response.json(body, { status: 400, headers: NO_STORE });
}

/** The upstream's status and body, unchanged; `Retry-After` when it set one. */
function passThrough<TBody>(result: UpstreamResult<TBody>): Response {
  const headers = new Headers(NO_STORE);
  if (!result.ok && result.retryAfterSeconds !== undefined) {
    headers.set(RETRY_AFTER_HEADER, String(result.retryAfterSeconds));
  }
  return Response.json(result.body, { status: result.status, headers });
}

// --- Handlers ---

export interface HandlerDeps {
  upstream: Upstream;
  apiKey: () => string | undefined; // read per request from server environment; undefined when absent
}

export interface DeleteTaskContext { // Next's dynamic-segment context for app/api/tasks/[id]/route.ts
  params: Promise<{ id: string }>;
}

export function createTaskHandler(deps: HandlerDeps) {
  return async function POST(request: Request): Promise<Response> {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return invalidRequest("body: Expected a JSON object");
    }
    const parsed = createTaskRequestSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(describeIssues(parsed.error));

    const result = await deps.upstream.createTask(parsed.data, { apiKey: deps.apiKey() });
    return passThrough(result);
  };
}

export function deleteTaskHandler(deps: HandlerDeps) {
  return async function DELETE(_request: Request, context: DeleteTaskContext): Promise<Response> {
    const { id } = await context.params;
    const parsed = taskIdSchema.safeParse(id);
    if (!parsed.success) return invalidRequest("id: Expected a UUID");

    const result = await deps.upstream.deleteTask(parsed.data, { apiKey: deps.apiKey() });
    return passThrough(result);
  };
}

/** The deployed wiring: the shared upstream and the server environment. */
export const productionDeps: HandlerDeps = {
  get upstream() {
    return getUpstream();
  },
  apiKey: readApiKey,
};
