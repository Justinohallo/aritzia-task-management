/**
 * The browser-facing Route Handlers, as functions (ADR-0004, as amended).
 *
 * `app/api/tasks/route.ts` and `app/api/tasks/[id]/route.ts` export these
 * bound to {@link productionDeps}. Each handler validates the request,
 * reads the private key from server environment, presents it to the
 * upstream, and passes the upstream's status and body through unchanged —
 * a `401` when the environment lacks the key included (`AC-API-4`), the
 * `Retry-After` header on a `429` included (`AC-API-5`).
 *
 * The browser's request carries no key and none is read from it: the body
 * schema strips unknown fields, and no header is consulted (`AC-API-3`).
 * Dependencies are injected so the handlers are tested without touching
 * `process.env` or the shared upstream.
 */
import { z } from "zod";

import { readApiKey } from "@/lib/server/env";
import { getUpstream } from "@/lib/server/upstream";
import { dueDateSchema, isoTimestampSchema, taskIdSchema, taskTitleSchema } from "@/lib/tasks/schema";
import { RETRY_AFTER_HEADER, type ApiErrorBody, type CreateTaskRequest, type Upstream, type UpstreamResult } from "@/types/api";

// ---------------------------------------------------------------------------
// Request validation — composed from the frozen field schemas, never restated
// ---------------------------------------------------------------------------

/**
 * `POST /api/tasks` body. Unknown keys are stripped, so nothing the browser
 * adds — an `apiKey` field, say — travels any further than this line.
 */
export const createTaskRequestSchema = z.object({
  id: taskIdSchema,
  title: taskTitleSchema,
  dueDate: dueDateSchema,
  createdAt: isoTimestampSchema,
});

// The parsed body is exactly the contract's request type. If either drifts,
// this stops compiling.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const requestMatchesContract: Exact<z.infer<typeof createTaskRequestSchema>, CreateTaskRequest> = true;
void requestMatchesContract;

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  upstream: Upstream;
  /** Read per request from server environment; `undefined` when absent. */
  apiKey: () => string | undefined;
}

/** Next's dynamic-segment context for `app/api/tasks/[id]/route.ts`. */
export interface DeleteTaskContext {
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
