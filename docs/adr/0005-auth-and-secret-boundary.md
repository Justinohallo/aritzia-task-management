# ADR-0005 — sessionStorage auth per brief; server-only secret boundary

**Status:** Accepted · **Date:** 2026-09-01 · **Criteria:** `AC-AUTH-1..10`, `AC-API-3..4`, `AC-NAV-4`

## Context

The brief: *"Add a locally persisted log in form (no need for Google) using
session storage for authentication data and local storage for maintaining a
semi-persistent list."* And separately: *"assume the API requires a private
key."*

Two different secrets with two different correct answers. One is prescribed by
the brief and is not what production should do. The other has no instruction
and must be got right.

## Decision

**Implement the auth pattern exactly as the brief specifies, and state in
writing — in this ADR and in the running application — that it is not a
production pattern.**

- Auth record in `sessionStorage`; task list in `localStorage`; two providers,
  two lifetimes (`AC-AUTH-10`).
- No credential persisted in any form (`AC-AUTH-9`).
- Credential rule: any non-empty username with a password meeting a stated
  minimum length, validated client-side against a rule shown on the page.
  There is no user store and the brief does not ask for one (`AM-11`).
- Route protection via a **client-side guard** in the protected layout, which
  renders nothing until auth state has been read (`AC-AUTH-7`, `AC-NAV-4`).
- **The API's private key is a separate matter and is handled properly**: read
  only from server environment inside a Route Handler, never prefixed
  `NEXT_PUBLIC_`, never imported into a client module, and asserted absent from
  the production client bundle by an automated test (`AC-API-3`).

## Why the pattern is followed rather than improved

Substituting Auth.js would ignore an explicit instruction. Reading a
requirement precisely — including one you would argue with — is part of what a
technical assessment measures, and unilaterally upgrading a specified design is
a failure mode with a worse cost than the design itself.

The professional move is to do what was asked and make the limits legible.
Silence would be the actual error: it would leave a reviewer unable to tell
whether the pattern was chosen or merely copied.

## What is wrong with it, precisely

**A token in `sessionStorage` is readable by any JavaScript running on the
origin.** One XSS — an npm dependency, a tag-manager script, a
`dangerouslySetInnerHTML` — and the token is exfiltrated. An `HttpOnly` cookie
is not readable by script at all, which is the entire point of the flag.

**Client-side route protection is a UX affordance, not a security control.**
The guard redirects; it does not authorise. Anything genuinely protected must
be enforced server-side on every request. Here nothing sensitive sits behind
it, which is why the pattern is survivable — the data is the user's own
`localStorage` and was never secret.

**Client-side credential validation authenticates nobody.** There is no user
store, so "login" is a gate, not an identity check.

### What production would be

| Concern | Here (per brief) | Production |
|---|---|---|
| Token storage | `sessionStorage` | `HttpOnly`, `Secure`, `SameSite=Lax` cookie set by the server |
| Session validity | Client-side presence check | Server-verified session or short-lived signed token with rotation |
| Route protection | Client guard in layout | Middleware or per-request server check; the client guard stays, for UX only |
| Credential check | Client-side rule | Server-side against an identity provider; password never leaves TLS |
| Logout | Clear `sessionStorage` | Server-side session revocation; clearing the client is not enough |
| XSS blast radius | Token stolen | Token unreadable by script; CSP and SRI reduce the surface further |

## Build vs. buy

**For the app's auth: build, because the brief specifies the build.** Auth.js
would be the correct purchase in any real project — session handling, CSRF,
cookie flags, and rotation are security-critical and boring, which is precisely
the profile of code that should be bought rather than written. Excluded here by
instruction, and recorded on the NOT list so the exclusion is visible.

**For the API key: buy the platform's boundary.** No secret-management library
is warranted at this size; the purchase is Next's server runtime plus the
platform's encrypted environment variables. The build-side contribution is the
one thing a platform cannot supply — a test asserting the key is absent from
the bundle. Secret hygiene that is only a convention decays; secret hygiene
with a failing test does not.

## Consequences

**Good.** The brief is satisfied literally. The two-storage split makes
"semi-persistent" concrete and testable — `AC-AUTH-5` and `AC-AUTH-10` assert
the observable difference between the mechanisms rather than assuming it. The
API key is handled to production standard, so the one secret that could
actually leak does not.

**Bad.** The app ships a pattern that should not be copied, which is mitigated
by saying so in the UI and here — not eliminated. The client-side guard means a
brief blank state before redirect on protected routes; rendering task data
first would be worse.

## eCommerce mapping

The distinction being drawn — a session-scoped identity versus a longer-lived
data record — is the guest-cart problem. The cart survives the session; the
session does not survive the tab. Aritzia's real version of this decision
governs whether a shopper's basket is there tomorrow, and whether their
identity is stealable by a third-party script on the checkout page. The pattern
here is a toy; the boundary it draws is not.
