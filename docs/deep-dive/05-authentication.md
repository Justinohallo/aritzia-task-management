# 05 · Authentication and route guards

> **In one paragraph.** Login is a gate, not an identity check. Any non-empty
> username with a password of at least eight characters passes a client-side
> rule, and what gets stored is a record *that a login happened* (who, when,
> a version), never the credential. The record lives in `sessionStorage`
> because the brief says so, which means the server can never see it, which
> means route protection has to be a client-side guard that renders nothing
> until the record has been read. [ADR-0005](../adr/0005-auth-and-secret-boundary.md)
> states in writing, and the login page states on screen, that this is not a
> production pattern. This page explains the mechanism and exactly what it
> is worth.

## The concept: authentication vs authorisation vs a UX affordance

Three things get conflated under "auth":

- **Authentication** establishes *who* is making a request. Real systems do
  it server-side, against an identity store, over TLS.
- **Authorisation** decides *whether* that identity may do this thing. It has
  to be enforced on every request, on the server, or it is not enforcement.
- **A client-side guard** decides what to *render*. It can redirect a user who
  is clearly not signed in so they do not see a broken page. It cannot stop
  anyone who opens devtools.

This app has the third, only. There is no identity store, so there is no
authentication in the first sense; there is nothing behind the guard that is
secret, so there is nothing to authorise. The guard is a UX affordance and
the ADR says so. The professional move on a brief that specifies a
non-production pattern is to build it precisely and make its limits legible,
not to substitute a real provider and ignore the instruction.

## How it is built here

### The credential rule

```ts
// lib/auth/credentials.ts
export const MIN_PASSWORD_LENGTH = 8;
export const CREDENTIAL_RULE = `Any username works, with a password of at least ${MIN_PASSWORD_LENGTH} characters.`;

export function validateCredentials(input: Credentials): CredentialCheck {
  const username = input.username.trim();
  if (username.length === 0) return { ok: false, field: "username", message: "Enter a username." };
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, field: "password", message: `Enter a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  return { ok: true, username };
}
```

Pure, and it returns the *first failing field* so the form can mark it. The
username is trimmed; the password is compared as typed, because a password is
what the user typed. The rule is exported as text and shown under the form,
so a reviewer is never locked out of the demo (`AM-11`).

### The record

```ts
// lib/auth/session.ts
export const authRecordSchema = z.object({
  version: z.literal(1),
  username: z.string().min(1),
  authenticatedAt: z.iso.datetime(),
});
```

No password field. Unknown keys stripped on read. This is why `AC-AUTH-9`
("no credential is ever persisted") is a property of the schema rather than
a promise ([page 04](04-persistence-and-storage.md)).

### The provider's three-valued status

```ts
// lib/auth/provider.tsx
type RecordState = AuthRecord | null | undefined;
//   undefined = not read yet;  null = read, and there is no session;  record = signed in
```

exposed as `status: "unknown" | "authenticated" | "unauthenticated"`. The
`unknown` state exists because the read happens in a post-mount effect
([page 02](02-nextjs-app-router.md), hydration). Between the first render
and that effect, the app does not know, and it must not guess: guessing
"signed out" would flash the login page at a signed-in user; guessing
"signed in" would paint task data for a stranger. The guards treat `unknown`
as "render nothing yet".

`login()` validates, writes the record, and reports whether the write
succeeded. A browser with `sessionStorage` disabled gets a specific message
("This browser is not allowing session storage…") instead of a silent
"signed in" that would not survive a navigation. `logout()` removes the
record and sets state to `null`; it does not navigate. The guard sees the
status change and redirects, so there is one redirect mechanism, not two.

### The three guards

```ts
// lib/auth/guards.tsx
function useRedirect(to: string | null) {
  const router = useRouter();
  useEffect(() => { if (to !== null) router.replace(to); }, [router, to]);
}

export function RequireAuth({ children })            // the protected layout
  status === "unauthenticated" → replace("/login");  renders children only when "authenticated"

export function RedirectIfAuthenticated({ children }) // the login page
  status === "authenticated" → replace("/tasks");    renders children unless "authenticated"

export function RedirectByAuthState()                 // "/"
  "authenticated" → "/tasks", "unauthenticated" → "/login", "unknown" → wait; renders nothing
```

The asymmetry between the first two is deliberate:

- `RequireAuth` renders **nothing** while `unknown`. `AC-AUTH-7` says no task
  data may paint before the redirect. The cost is a brief blank on a
  protected route for a signed-out visitor; painting their (empty) task page
  first would be worse.
- `RedirectIfAuthenticated` renders its **children** while `unknown`. The
  login form is server-rendered and appears at once for the common,
  signed-out case; a signed-in visitor sees the form for one frame and is
  then sent on (`AC-AUTH-8`). The form is not secret, so showing it early
  costs nothing.

All three use `router.replace`, so a redirect leaves nothing in history to go
back to.

### The session bar

`lib/auth/session-bar.tsx` renders "Signed in as *username*" and a **Log out**
button, inside `RequireAuth`, so `user` is always set. Logging out clears the
session and lets the guard redirect (`AC-AUTH-6`).

### The login form

`app/login/login-form.tsx` sets `noValidate` on the form so the browser's own
validation is off and the one rule and one message come from
`validateCredentials`. A failure renders in a `role="alert"` region, and the
failing field gets `aria-invalid` plus `aria-describedby` pointing at that
region (`AC-AUTH-3`, `AC-A11Y-2`). `autoComplete="username"` and
`"current-password"` let password managers behave. On success it calls
`router.replace("/tasks")` itself, because the login page's guard only
redirects on *mount-time* status, and after a successful `login()` the
`RedirectIfAuthenticated` guard would also fire; the explicit replace makes
the navigation immediate rather than a render later.

## Why middleware cannot protect these routes

Next.js middleware runs on the server, before a request reaches a page, and
is the standard place for auth redirects. It reads the request: cookies,
headers, the URL. `sessionStorage` is none of those. The browser never sends
it, to anyone, ever. So middleware sees every request to `/tasks` as
anonymous, and the only place that can read the session is JavaScript running
on the page after it has loaded.

This is not a limitation of the App Router. It is the direct consequence of
the storage the brief specifies, and it is the clearest demonstration of why
production auth uses a cookie: a cookie *is* sent, so the server can enforce
on every request, and with `HttpOnly` set it is *not* readable by script, so
an injected script cannot steal it. `sessionStorage` is the inverse on both
counts.

## What production changes

Reproduced from [ADR-0005](../adr/0005-auth-and-secret-boundary.md) so this page stands alone:

| Concern | Here (per brief) | Production |
|---|---|---|
| Token storage | `sessionStorage` | `HttpOnly`, `Secure`, `SameSite=Lax` cookie set by the server |
| Session validity | Client-side presence check | Server-verified session, or a short-lived signed token with rotation |
| Route protection | Client guard in the layout | Middleware or a per-request server check; the client guard stays, for UX only |
| Credential check | Client-side rule | Server-side against an identity provider; the password never leaves TLS |
| Logout | Clear `sessionStorage` | Server-side revocation; clearing the client is not enough |
| XSS blast radius | Token stolen by any script on the origin | Token unreadable by script; CSP and SRI shrink the surface further |
| The API itself | `/api/tasks` accepts any caller | Every Route Handler checks the session before doing anything |

The last row is the one to notice. Nothing authenticates the browser *to the
Route Handler*. The handler holds the API key and will present it for anyone
who calls `POST /api/tasks`. In this app that is harmless: the upstream stores
nothing and the worst outcome is spending the demo's rate-limit window. In
production, the backend-for-frontend would verify the session cookie before
touching the credential, and the credential's blast radius would be bounded
by who can obtain a session.

## The decisions inside

**Why is the username trimmed but shown as-entered?** It is trimmed before
validation and storage so that `"  alice "` and `"alice"` are the same user,
and the trimmed value is what is stored and displayed. Only whitespace is
altered.

**Why a minimum length and nothing else?** Because there is no user store and
the brief does not ask for one. A rule complex enough to reject real
passwords would lock a reviewer out of a demo for no security gain.

**Why is the non-production notice an `<aside role="note">`?** So assistive
technology can identify it as an aside and skip or read it deliberately, and
so a reviewer reading the page, not only the ADR, is told the pattern is a
deliberate reproduction of the brief.

**Why does `AuthProvider` accept `storage` and `now` as props?** Injection.
Tests pass an in-memory `Storage` and a fixed clock, then assert the exact
record written, without depending on jsdom's storage or on the wall clock.

## What to discuss

**"So anyone can bypass the login."** Yes, by typing any username and eight
characters, or by writing the record into `sessionStorage` by hand. Both get
them to a page that shows their own browser's task list. There is nothing to
bypass *to*. The ADR's claim is narrower than "this is secure": it is "this
is exactly what was asked for, and here is what it is worth".

**"Why not Auth.js? It would have taken an hour."** It would have ignored an
explicit instruction, which on a technical assessment is a worse error than
the pattern itself. Reading a requirement precisely, including one you would
argue with, is part of what is being measured. The exclusion is on the NOT
list ([`PROJECT.md`](../PROJECT.md) §4) so it is visible as a decision.

**"What is the security model of the API key, then, if the API is open?"**
The key is protected from the *client bundle* and from *the network*, to
production standard: it is never in a `NEXT_PUBLIC_` variable, never
imported by client code, never sent by the browser, and a test searches the
built bundle for it ([page 14](14-ci-and-security.md)). It is not protected
from *being used* by an unauthenticated caller of the Route Handler, and that
gap is the production row above.

## Where to look

- Rule: `lib/auth/credentials.ts`
- Record and adapter: `lib/auth/session.ts`
- Provider: `lib/auth/provider.tsx`
- Guards: `lib/auth/guards.tsx`
- Pages: `app/page.tsx`, `app/login/page.tsx`, `app/login/login-form.tsx`, `app/(protected)/layout.tsx`
- Tests: `test/auth/credentials.test.ts`, `test/auth/session.test.ts`, `test/auth/provider.test.tsx`, `test/auth/login-page.test.tsx` (`AC-AUTH-1..3`, `AC-AUTH-8..9`), `test/auth/protected-layout.test.tsx` (`AC-AUTH-4..7`), `test/auth/root-page.test.tsx` (`AC-NAV-3`)
