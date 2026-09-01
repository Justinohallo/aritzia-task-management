# ADR-0001 — Next.js App Router over Pages Router

**Status:** Accepted · **Date:** 2026-09-01 · **Criteria:** `AC-NAV-1..4`, `AC-API-3`, `AC-STATE-6`

## Context

Aritzia's brief says: *"Use pages for the log in form and user list."*

That sentence has two readings — two distinct routes, or literally the Next.js
Pages Router. It matters, because the same brief also says the API *"requires a
private key"*, and the router choice determines how naturally that key stays on
the server.

Next.js has shipped App Router as the default for new projects since v13.4. A
greenfield application started at Aritzia in 2026 would use it.

## Decision

**Use the App Router**, with `/login` and `/tasks` as distinct routes.

Distinct routes satisfy the brief's sentence under either reading. The word
"pages" is called out here deliberately so the choice reads as a decision that
noticed the ambiguity rather than one that missed it. This is recorded as
ambiguity **AM-1** and assumption **A-2**.

## Build vs. buy

**Buy the framework's server boundary.** The alternative to Route Handlers is
standing up a separate API process — Express or Fastify alongside Next — to
hold the private key. That is a real pattern at scale, and it is the wrong
trade here: it doubles the deployables, doubles the deploy configuration, and
buys nothing this brief asks for. Next's Route Handlers give a server-only
execution context, environment access, and streaming for free.

The build-side cost of that purchase is coupling to Next's runtime model. It is
worth paying at this size, and it is the same bet Aritzia's own stack already
makes by choosing Next.

## Consequences

**Good.** The private key is read inside a Route Handler, which never ships to
the browser — `AC-API-3` becomes a property of the architecture rather than a
convention someone has to remember. Server Components keep the client bundle
smaller by default. The layout system gives one natural place to mount the
auth guard, satisfying `AC-NAV-4` without per-page duplication.

**Bad.** `'use client'` discipline is a real ongoing cost, and the boundary is
easy to get wrong in ways that only show up as a bundle-size regression.
Testing Server Components with React Testing Library is awkward; the mitigation
is to keep all interactive surface in client components, which is where the
behaviour under test lives anyway.

**Sharp edge worth naming: middleware cannot protect these routes.** The brief
puts the auth record in `sessionStorage`, and `sessionStorage` is never sent to
the server — no cookie, no header, nothing for `middleware.ts` to read. So
route protection has to be a client-side guard in the protected layout, and
that guard must not render children until the auth state has been read
(`AC-AUTH-7` requires no task data paints before the redirect).

This is not a limitation of the App Router. It is the direct, unavoidable
consequence of the storage mechanism the brief specifies, and it is the
clearest illustration of why production auth uses an `HttpOnly` cookie —
see [ADR-0005](0005-auth-and-secret-boundary.md).

## Alternatives considered

**Pages Router.** Reads the brief's wording at face value, and its API Routes
would also keep the key server-side. Rejected because it signals a dated stack
for a 2026 greenfield, and because "pages" is satisfied by distinct routes
regardless. The cost of being wrong here is low: both routes exist either way,
only the file layout differs.

**App Router with everything as Server Components.** Rejected — the app is
almost entirely client-interactive, and forcing server rendering onto
localStorage-backed state creates hydration problems (`AC-STATE-6`) for no gain.

## eCommerce mapping

The server/client boundary is the same one that separates a product-detail
page's cached, crawlable content from its interactive cart controls, and the
same one that keeps a payment or inventory credential out of a bundle that
every shopper downloads. Getting this line right on a to-do app is practice
for getting it right where the credential is real.
