# 02 · Next.js App Router

> **In one paragraph.** The App Router maps the `app/` directory to routes,
> renders every file as a Server Component unless it opts into the client with
> `"use client"`, and lets a `layout.tsx` wrap every route beneath it. This
> app uses a route group, `(protected)`, to give `/tasks` a layout that
> mounts the auth guard and the task provider once; uses Route Handlers under
> `app/api/` as its server-only execution context; and keeps all interactive
> behaviour in client components so that the server render and the first
> client render agree.

## The concept: file-system routing with a server/client seam

Three ideas carry the App Router.

**Files are routes.** `app/login/page.tsx` is `/login`. `app/api/tasks/route.ts`
is `/api/tasks`, and its exported `POST` function is the handler for that
method. A directory in parentheses, `app/(protected)/`, is a *route group*:
it organises files and can carry a layout, but it adds nothing to the URL, so
`app/(protected)/tasks/page.tsx` is still `/tasks`.

**Server Components by default.** A component with no `"use client"`
directive renders on the server, and its code never ships to the browser. It
may read the file system, `process.env`, or a database. It may not use
`useState`, event handlers, or browser APIs. A file that begins with
`"use client"` marks the boundary: it and everything it imports become part
of the client bundle. The directive is per *module*, not per component, and
it is transitive through imports, which is why `lib/tasks/provider.tsx`,
`lib/tasks/hooks.ts` and `lib/tasks/mutations.ts` all carry it.

**Layouts nest and persist.** `app/layout.tsx` wraps everything. A layout in
a subdirectory wraps everything beneath it. On navigation between two pages
that share a layout, the layout does not remount. That is what makes a
layout the right home for a provider whose state should survive navigation.

## How it is built here

### The route table

| Route | File | Renders | Guarded by |
|---|---|---|---|
| `/` | `app/page.tsx` | Nothing; redirects | `RedirectByAuthState` |
| `/login` | `app/login/page.tsx` | The card, the form, the non-production notice | `RedirectIfAuthenticated` |
| `/tasks` | `app/(protected)/tasks/page.tsx` | `<TaskForm/>` and `<TaskList/>` | `RequireAuth` via the group layout |
| `POST /api/tasks` | `app/api/tasks/route.ts` | JSON | Nothing (see [page 05](05-authentication.md)) |
| `DELETE /api/tasks/:id` | `app/api/tasks/[id]/route.ts` | JSON | Nothing |

`AC-NAV-1` and `AC-NAV-2` are the two pages at their own routes. `AC-NAV-3` is
the root redirect. `AC-NAV-4`, "route protection is centralised", is the
route group: one layout, one guard, and adding a second protected page is
adding a file under `app/(protected)/`.

### The protected layout is a tree of providers

```tsx
// app/(protected)/layout.tsx  (a Server Component)
<AuthProvider>
  <RequireAuth>
    <TasksProvider>
      <header>…<SessionBar/></header>
      <LiveRegion />
      {children}
    </TasksProvider>
  </RequireAuth>
</AuthProvider>
```

The file itself has no `"use client"`. It is a Server Component that
*composes* client components. That is allowed, and it is the idiomatic shape:
the server renders the static shell, the client components hydrate inside it.
Order matters:

- `AuthProvider` outermost, because the guard reads it.
- `RequireAuth` next, and it renders **nothing** until the session has been
  read, so nothing below it (including the task provider's hydration effect)
  runs for an unauthenticated visitor (`AC-AUTH-7`).
- `TasksProvider` inside the guard, so the list is per-app and not per-page,
  and is mounted only for a signed-in user (`AC-STATE-1`).
- `LiveRegion` inside the guard, once, so every later announcement has one
  place to land ([page 10](10-accessibility.md)).

### Route Handlers as the server-only context

```ts
// app/api/tasks/route.ts
import { createTaskHandler, productionDeps } from "@/lib/server/handlers";
export const POST = createTaskHandler(productionDeps);
```

A Route Handler is a function from `Request` to `Response`, using the Web
standard types rather than Node's. Two things make it the right place for
the key:

1. It runs only on the server. Its module graph is never bundled for the
   client, so `process.env.TASKS_API_KEY` read inside it cannot leak by
   construction ([ADR-0001](../adr/0001-app-router.md) "buy the framework's server boundary").
2. It is dynamic. A handler that reads a request body or `process.env` at
   request time is rendered per request, never cached at build. The
   handlers also set `Cache-Control: no-store` explicitly so no intermediary
   caches a `201` or a `429`.

The binding files are two lines each on purpose. The behaviour lives in
`lib/server/handlers.ts` as factory functions that take their dependencies
(the upstream and the key reader) as an argument, so the tests construct a
handler with a stub upstream and never touch `process.env` or the shared
limiter ([page 06](06-api-simulation.md)).

The dynamic segment `[id]` arrives as `context.params`, which in Next 15+ is a
**Promise**. The handler `await`s it; a test passes `{ params: Promise.resolve({ id }) }`.
`DeleteTaskContext` in `lib/server/handlers.ts` types that contract.

### Hydration, and why the first render must be empty

Server-side rendering produces HTML; on the client React *hydrates* it,
attaching event handlers to the existing markup rather than re-creating it.
Hydration requires the client's first render to produce the same tree the
server did. If the server rendered an empty list and the client, having read
`localStorage` during render, produced a full one, React reports a hydration
mismatch and discards the server markup.

The rule this codebase follows everywhere (`AC-STATE-6`): **no browser API is
touched during render.** Both providers read their storage in a `useEffect`,
which runs only on the client and only after the first render has committed.
Until then the auth status is `unknown` and the task list is `[]` with
`hydrated: false`. Consumers use that flag to show a skeleton rather than a
misleading "No tasks yet" (`components/tasks/task-list.tsx`).

`test/auth/protected-layout.test.tsx` renders the protected layout with
`renderToString` and asserts the output contains no page content. That is
`AC-AUTH-7`'s second half proven against the real server render, not a
simulation of it.

### `useSearchParams` and the Suspense boundary

`components/tasks/task-list.tsx` wraps its body in `<Suspense>`. This is not
decorative. `useSearchParams()` in a client component makes the nearest
Suspense boundary the unit that is deferred during static rendering: Next
prerenders the page shell at build time, and the part that depends on the
URL's query string is rendered on the client. Without a boundary, `next build`
fails the page with a "missing Suspense boundary" error. The fallback is the
same skeleton the not-yet-hydrated state shows, so the two cases look
identical to the user.

### Navigation is `router.replace` for redirects, `router.push` for filters

Two different history semantics, chosen deliberately:

- A redirect (`/` → `/tasks`, `/tasks` → `/login`) uses `replace`, so the
  back button does not return the user to a page that will immediately
  bounce them again (`lib/auth/guards.tsx`).
- A filter change uses `push`, so the back button walks back through
  filters (`AC-FILT-4`, `components/tasks/task-filters.tsx`).

## The decisions inside

**Why is `AuthProvider` mounted three times, not once at the root?** Because
`sessionStorage` is the source of truth, not React. Each route segment that
needs auth mounts its own provider, which reads the same storage on mount,
so the segments cannot disagree. Mounting it once in the root layout would
have worked too, but the root layout was not in the auth task's file
ownership lane ([`TASKS.md`](../TASKS.md), file ownership), and the per-segment
shape has a side benefit: the login page's provider is not carrying task
state it will never use.

**Why not `middleware.ts` for route protection?** Middleware runs on the
server before the request reaches a page. It can read cookies and headers.
It cannot read `sessionStorage`, because the browser never sends
`sessionStorage` anywhere. The brief puts the session there, so the guard
*has* to be client-side. [ADR-0001](../adr/0001-app-router.md) calls this the
sharp edge; [page 05](05-authentication.md) explains what it costs.

**Why are pages Server Components when nothing in them is server-rendered
data?** Because the default costs nothing and the alternative costs bundle
size. `app/login/page.tsx` renders a `<Card>` shell and a notice. Neither
needs JavaScript on the client. Only `LoginForm` does, so only `LoginForm`
is a client component. Keeping the shell on the server is the discipline
[ADR-0001](../adr/0001-app-router.md) names as the ongoing cost of the App
Router; the payoff is a smaller client bundle and a first paint that does not
wait for hydration.

**Why does `app/page.tsx` redirect on the client rather than with a server
`redirect()`?** Same reason as the guard: the decision needs `sessionStorage`.
A server `redirect()` would have to guess, and the wrong guess sends a
signed-in user to the login page.

## What to discuss

**"Where is the seam between server and client, precisely?"** Every file with
`"use client"` at the top, and everything those files import. The test
`test/api/secret-boundary.test.ts` walks that seam in the other direction: it
finds every `"use client"` file and asserts none of them imports `lib/server`.

**"What is the cost of getting the seam wrong?"** Two failure modes. Import a
server module from a client one and the build either fails (Node built-ins)
or, worse, succeeds and inlines a secret. Touch a browser API in a Server
Component and the render crashes. The first is caught by the bundle test
(`AC-API-3`); the second by the hydration test (`AC-STATE-6`).

**"Would the Pages Router have been simpler?"** For a two-page app, about the
same. The brief's phrase "use pages" could be read as naming it. The App
Router was chosen because it is the default for a 2026 greenfield and
because the layout system gave `AC-NAV-4` for free; the ambiguity is recorded
as `A-2` and `AM-1` rather than ignored.

## Where to look

- Route group and layout: `app/(protected)/layout.tsx`
- Guards and their two history semantics: `lib/auth/guards.tsx`
- Route Handler bindings and the factory they bind: `app/api/tasks/route.ts`, `lib/server/handlers.ts`
- The Suspense boundary and the hydration skeleton: `components/tasks/task-list.tsx`
- Tests: `test/auth/protected-layout.test.tsx` (server render is empty), `test/auth/root-page.test.tsx`, `test/api/handlers.test.ts`
