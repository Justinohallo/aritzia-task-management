# ACCEPTANCE.md — testable criteria

> **Status:** verified by T-13 (QA) on 2026-09-02 against `main` d3070fa and its deployed build. 72 criteria `☑`, 6 `◉`, 0 `☐`, 1 `◐` (`AC-DEP-1`, the real-phone walk, `B-24`). The mark beside each criterion names the test or the procedure that earns it; nothing else does.
> **Companion to:** [`PROJECT.md`](PROJECT.md) · [`TASKS.md`](TASKS.md) · [`adr/`](adr/)

Every requirement in Aritzia's brief is decomposed here into numbered
Given/When/Then criteria. Each ID maps to **one or more tests** and is
**referenced in the commit** that satisfies it, so a reviewer can trace any
line of the brief to the code that implements it and the test that proves it.

**Commit convention:** `feat(tasks): add optimistic delete [AC-DEL-1, AC-API-9]`

**Status legend:** `☐` not started · `◐` implemented, untested · `☑` met, test named · `◉` verified manually, procedure and date named · `⚙` enforced by tooling, rule or flag named

`◉` exists for exactly seven criteria that no Jest test can prove, and for no
others: `AC-UI-1..4` (jsdom does not lay out), `AC-A11Y-4` (a keyboard walk
is a judgment), `AC-CI-2` (a GitHub setting), `AC-DEP-1` (a phone). Each is
marked `◉` only with the procedure, the viewport or device, and the date
written next to it. `◉` is not a soft `☑`: a criterion outside the seven is
never marked `◉`, and a test that names an ID and asserts nothing does not
earn `☑`. *(ARCH-03: rule 5, `AC-TEST-1` and the definition of done all
required a named test for every criterion while ADR-0006 said four of them
could not have one.)*

`⚙` exists for exactly eight criteria that describe a property of the
toolchain rather than a behaviour of the application, and for no others:
`AC-QUAL-1..2`, `AC-CI-1`, `AC-UI-5..6`, `AC-TEST-2..4`. Each is marked `⚙`
only with the lint rule, compiler flag, runner option or CI step that makes
it impossible to violate written next to it, and only once T-19 has moved
the proof there. Until then the `☑` marks below stand. A test that spawns
the linter to read the linter's config, or regex-parses the CI file, proves
nothing the tool does not already enforce and is not a valid `☑` for these
eight after T-19. *(ARCH-07, `B-27`.)*

---

## Traceability — brief requirement → criteria

| # | Aritzia's requirement (verbatim) | Criteria |
|---|---|---|
| R1 | "Add tasks with titles and due dates" | `AC-ADD-1..8` |
| R2 | "View tasks in a list with the ability to filter by status (e.g., All, Pending, Completed)" | `AC-LIST-1..4`, `AC-FILT-1..6` |
| R3 | "Mark tasks as completed or delete them" | `AC-DONE-1..3`, `AC-DEL-1..4` |
| R4 | "Use TypeScript throughout the application" | `AC-QUAL-1..2` |
| R5 | "Ensure the application is responsive and works well on both desktop and mobile screens" | `AC-UI-1..4` |
| R6 | "Write unit tests for the components using Jest and React Testing Library" | `AC-TEST-1..4` |
| R7 | "Simulate an API call on each addition and removal (assume the API requires a private key for use and consider potential rate-limiting scenarios)" | `AC-API-1..13` |
| R8 | "Build UI components using a React component library of your choice (eg. Shadcn)" | `AC-UI-5..6` |
| R9 | "Use a provider for state management, incorporating semipersistent state principles without relying on a full-fledged store" | `AC-STATE-1..6` |
| R10 | "Add a locally persisted log in form … using session storage for authentication data and local storage for maintaining a semi-persistent list" | `AC-AUTH-1..10` |
| R11 | "Use pages for the log in form and user list" | `AC-NAV-1..4` |
| — | Not in the brief; added deliberately (see PROJECT.md §4) | `AC-A11Y-1..6`, `AC-CI-1..2`, `AC-DEP-1` |

---

## R10 · Authentication

#### AC-AUTH-1 — Login form renders
**Status:** ☑ — `test/auth/login-page.test.tsx` — "AC-AUTH-1: renders a labelled username field, a labelled password field of type password, and a submit button"
```gherkin
Given I am unauthenticated
When I visit /login
Then I see a form with a labelled username field, a labelled password field, and a submit button
And the password field is of type password
```

#### AC-AUTH-2 — Valid credentials authenticate and redirect
**Status:** ☑ — `test/auth/login-page.test.tsx` — "AC-AUTH-2: valid credentials write an auth record to sessionStorage and redirect to /tasks"; also `test/auth/provider.test.tsx`, `test/auth/session.test.ts`, `test/auth/credentials.test.ts`
```gherkin
Given I am on /login
When I submit valid credentials
Then an auth record is written to sessionStorage
And I am redirected to /tasks
```

#### AC-AUTH-3 — Invalid credentials are rejected
**Status:** ☑ — `test/auth/login-page.test.tsx` — "AC-AUTH-3: an empty username shows an alert, writes nothing, and stays on /login" and "AC-AUTH-3: a short password shows an alert naming the minimum, writes nothing, and stays on /login"
```gherkin
Given I am on /login
When I submit credentials that do not validate
Then an error message is displayed in a role="alert" region
And nothing is written to sessionStorage
And I remain on /login
```

#### AC-AUTH-4 — Session survives reload in the same tab
**Status:** ☑ — `test/auth/protected-layout.test.tsx` — "AC-AUTH-4: with a session in sessionStorage the page renders, and it still does after a reload"
```gherkin
Given I am authenticated on /tasks
When I reload the page
Then I remain authenticated
And I am not redirected to /login
```

#### AC-AUTH-5 — Session does not survive a new tab
**Status:** ☑ — `test/auth/protected-layout.test.tsx` — "AC-AUTH-5: a session started in tab A does not exist in a new tab, which is redirected to /login"; `test/auth/session.test.ts` "AC-AUTH-5: the adapter defaults to window.sessionStorage, never localStorage"
```gherkin
Given I am authenticated in tab A
When I open /tasks in a new tab
Then I am unauthenticated in the new tab
And I am redirected to /login
```
> This is sessionStorage's defined behaviour, asserted deliberately rather than
> discovered. It is the observable difference between the two storage choices
> the brief specifies, and the reason the choice is defensible at all.

#### AC-AUTH-6 — Logout clears the session
**Status:** ☑ — `test/auth/protected-layout.test.tsx` — "AC-AUTH-6: activating Log out removes the record from sessionStorage and redirects to /login"
```gherkin
Given I am authenticated
When I activate Log out
Then the auth record is removed from sessionStorage
And I am redirected to /login
```

#### AC-AUTH-7 — Protected route redirects when unauthenticated
**Status:** ☑ — `test/auth/protected-layout.test.tsx` — "AC-AUTH-7: an unauthenticated visitor is redirected to /login and the page never renders" and "AC-AUTH-7: the server render of a protected route contains no page content"
```gherkin
Given I am unauthenticated
When I navigate directly to /tasks
Then I am redirected to /login
And no task data is rendered before the redirect
```

#### AC-AUTH-8 — Login route redirects when already authenticated
**Status:** ☑ — `test/auth/login-page.test.tsx` — "AC-AUTH-8: an already-authenticated visitor is redirected to /tasks and sees no form"
```gherkin
Given I am authenticated
When I navigate to /login
Then I am redirected to /tasks
```

#### AC-AUTH-9 — No credential is ever persisted
**Status:** ☑ — `test/auth/login-page.test.tsx` — "AC-AUTH-9: after a successful login no entry in sessionStorage or localStorage contains the password in any form"; `test/auth/session.test.ts`, `test/auth/provider.test.tsx`
```gherkin
Given I have authenticated successfully
When I inspect sessionStorage and localStorage
Then no entry contains the submitted password in any form
```

#### AC-AUTH-10 — The task list outlives the session
**Status:** ☑ — `test/tasks/provider.test.tsx` — "AC-AUTH-10: the task list outlives the session — logout, log back in, tasks remain"
```gherkin
Given I am authenticated and have created tasks
When I log out and log back in
Then my tasks are still present
```
> This is what "semi-persistent" means: auth is session-scoped, data is not.
> Resolution of ambiguity **AM-6**.

---

## R11 · Routing

#### AC-NAV-1 — Login page exists at its own route
**Status:** ☑ — `test/auth/login-page.test.tsx` — "AC-NAV-1: the login page lives at its own route and serves the login form"
```gherkin
Given the application is running
When I request /login
Then a login page is served
```

#### AC-NAV-2 — Task list exists at its own route
**Status:** ☑ — `test/auth/protected-layout.test.tsx` — "AC-NAV-2: the task list page lives at its own route under the protected layout and is served when signed in"
```gherkin
Given the application is running
When I request /tasks
Then the task list page is served
```

#### AC-NAV-3 — Root redirects by auth state
**Status:** ☑ — `test/auth/root-page.test.tsx` — "AC-NAV-3: redirects an authenticated visitor to /tasks" and "AC-NAV-3: redirects an unauthenticated visitor to /login"
```gherkin
Given I request /
When I am authenticated
Then I am redirected to /tasks
When I am unauthenticated
Then I am redirected to /login
```

#### AC-NAV-4 — Route protection is centralised
**Status:** ☑ — `test/auth/protected-layout.test.tsx` — "AC-NAV-4: a new route under the layout is protected with no code of its own" and "AC-NAV-4: the guard is used in exactly one place under app/, the protected layout, and the tasks page carries none"
```gherkin
Given route protection is implemented
When a new authenticated route is added
Then it is protected by the same shared mechanism, not a per-page copy
```

---

## R1 · Adding tasks

#### AC-ADD-1 — A valid task is created
**Status:** ☑ — `test/tasks/task-form.test.tsx` — "AC-ADD-1: a title and a due date create a pending task with those values"; `test/tasks/validation.test.ts`
```gherkin
Given I am authenticated on /tasks
When I enter a title and a due date and submit
Then the task appears in the list with that title and due date
And its status is Pending
```

#### AC-ADD-2 — Empty title is rejected
**Status:** ☑ — `test/tasks/task-form.test.tsx` — "AC-ADD-2: an empty title creates nothing, shows an inline error linked via aria-describedby, and makes no request"
```gherkin
Given I am on the add-task form
When I submit with an empty title
Then no task is created
And an inline error is shown, associated with the title field via aria-describedby
And no API request is made
```

#### AC-ADD-3 — Missing due date is rejected
**Status:** ☑ — `test/tasks/task-form.test.tsx` — "AC-ADD-3: a title with no due date creates nothing and shows an inline error on the due-date field"; `test/tasks/validation.test.ts`
```gherkin
Given I am on the add-task form
When I submit with a title but no due date
Then no task is created
And an inline error is shown, associated with the due-date field
```

#### AC-ADD-4 — Whitespace-only title is rejected and titles are trimmed
**Status:** ☑ — `test/tasks/task-form.test.tsx` — "AC-ADD-4: a whitespace-only title creates nothing" and "AC-ADD-4: leading and trailing whitespace is trimmed from the stored title"
```gherkin
Given I am on the add-task form
When I submit a title consisting only of whitespace
Then no task is created
When I submit a title with leading and trailing whitespace
Then the stored title is trimmed
```

#### AC-ADD-5 — Title length is bounded
**Status:** ☑ — `test/tasks/task-form.test.tsx` — "AC-ADD-5: a title over ${TASK_TITLE_MAX_LENGTH} characters is rejected with an inline error stating the limit"; `test/tasks/validation.test.ts` (exactly-at-limit and after-trim cases)
```gherkin
Given I am on the add-task form
When I enter a title longer than 200 characters
Then submission is rejected with an inline error stating the limit
```

#### AC-ADD-6 — The form resets and returns focus after success
**Status:** ☑ — `test/tasks/task-form.test.tsx` — "AC-ADD-6: after success the fields are cleared and focus returns to the title"
```gherkin
Given I have successfully created a task
Then the title and due-date fields are cleared
And focus returns to the title field
```

#### AC-ADD-7 — A past due date is allowed and marked overdue
**Status:** ☑ — `test/tasks/task-form.test.tsx` — "AC-ADD-7: a past due date is accepted and the task reads as overdue"; `test/tasks/validation.test.ts` (local calendar day, not a UTC instant)
```gherkin
Given I am on the add-task form
When I submit a task with a due date in the past
Then the task is created
And it is marked overdue in the list
```
> Resolution of ambiguity **AM-4**. Blocking past dates would prevent logging
> work that is already late, which is the common real case.

#### AC-ADD-8 — Double submission is prevented
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-ADD-8: submit is disabled while the request is in flight, and a second activation creates nothing"
```gherkin
Given a create request is in flight
When I activate submit again before it resolves
Then only one task is created
And the submit control is disabled while the request is in flight
```

---

## R2 · List and filter

#### AC-LIST-1 — Tasks render with their attributes
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-LIST-1: each task shows its title, its due date, and its completion state"
```gherkin
Given I have tasks
When I view /tasks
Then each task shows its title, its due date, and its completion state
```

#### AC-LIST-2 — Empty state when there are no tasks at all
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-LIST-2: with no tasks at all, an empty state invites me to add my first task and no bare list renders"
```gherkin
Given I have no tasks
When I view /tasks
Then I see an empty state inviting me to add my first task
And I do not see an empty list container with no explanation
```

#### AC-LIST-3 — Deterministic ordering
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-LIST-3: tasks are ordered by due date ascending, then by creation time ascending"
```gherkin
Given I have several tasks with different due dates
When I view the list
Then tasks are ordered by due date ascending
And tasks sharing a due date are ordered by creation time ascending
```
> Resolution of ambiguity **AM-5**. Ordering is unspecified in the brief;
> unspecified ordering is untestable, so it is fixed here.

#### AC-LIST-4 — Overdue tasks are distinguishable without colour
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-LIST-4: a pending task whose due date has passed is marked overdue by text and icon, not colour alone"
```gherkin
Given I have a pending task whose due date has passed
When I view the list
Then it is marked overdue by text or icon, not by colour alone
```

#### AC-FILT-1 — All shows every task
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-FILT-1: All lists every task, pending and completed"
```gherkin
Given I have pending and completed tasks
When the filter is All
Then every task is listed
```

#### AC-FILT-2 — Pending shows only incomplete tasks
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-FILT-2: selecting Pending lists only tasks that are not complete"
```gherkin
Given I have pending and completed tasks
When I select Pending
Then only tasks that are not complete are listed
```

#### AC-FILT-3 — Completed shows only complete tasks
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-FILT-3: selecting Completed lists only tasks that are complete"
```gherkin
Given I have pending and completed tasks
When I select Completed
Then only tasks that are complete are listed
```

#### AC-FILT-4 — Filter state is addressable in the URL
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-FILT-4: selecting a filter writes it to the URL as a query parameter" and "AC-FILT-4: reloading a URL that names a filter restores it, and a recipient of the URL sees the same view"
```gherkin
Given I select the Completed filter
Then the URL reflects the active filter as a query parameter
When I reload that URL
Then the Completed filter is still active
When I share that URL
Then the recipient sees the same filter applied
```
> The catalog-faceting analogue. A filter held only in component state is not
> shareable, not restorable, and not back-button-correct.

#### AC-FILT-5 — Filtered empty states are specific
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-FILT-5: when tasks exist but none match, the empty state names the filter and differs from the no-tasks state"
```gherkin
Given I have tasks but none match the active filter
When I view the list
Then the empty state names the active filter
And it is distinguishable from the no-tasks-at-all state
```

#### AC-FILT-6 — Completing a task under a filter behaves correctly
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-FILT-6: completing a task under Pending removes it from view, keeps Pending active, and announces the removal"
```gherkin
Given the Pending filter is active
When I mark a visible task complete
Then it leaves the filtered view
And the filter remains Pending
And its removal is announced to assistive technology
```

---

## R3 · Complete and delete

#### AC-DONE-1 — A task can be marked complete
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-DONE-1: marking a pending task complete changes its state, and the control's accessible state reflects it"
```gherkin
Given I have a pending task
When I mark it complete
Then its state changes to Completed
And the control's accessible state reflects completion
```

#### AC-DONE-2 — Completion can be reversed
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-DONE-2: marking a completed task incomplete returns it to Pending"
```gherkin
Given I have a completed task
When I mark it incomplete
Then its state returns to Pending
```

#### AC-DONE-3 — Completion persists across reload
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-DONE-3: completion is persisted and survives a reload"
```gherkin
Given I have marked a task complete
When I reload the page
Then it is still complete
```

#### AC-DEL-1 — A task can be deleted
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-DEL-1: deleting a task removes it from the list and it does not return after reload"
```gherkin
Given I have a task
When I delete it
Then it is removed from the list
And it does not return after reload
```

#### AC-DEL-2 — Deletion is announced
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-DEL-2: the deletion is announced in a live region"; `test/tasks/mutations.test.ts`
```gherkin
Given I delete a task
Then the deletion is announced in a live region
```

#### AC-DEL-3 — Deletion has no confirmation dialog
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-DEL-3: delete acts at once, with no confirmation dialog"
```gherkin
Given I activate delete on a task
Then the task is deleted without an intervening confirmation modal
```
> Resolution of ambiguity **AM-7**. The brief specifies no confirmation. A
> modal on every delete is friction; the honest mitigation for a destructive
> action here is that failures roll the task back visibly (`AC-API-9`). An undo
> affordance is the better pattern and is recorded as out of scope for P1.

#### AC-DEL-4 — Delete is keyboard reachable
**Status:** ☑ — `test/tasks/task-list.test.tsx` — "AC-DEL-4: the delete control is focusable, labelled with the task title, and activated by Enter" and "AC-DEL-4: the delete control is activated by Space"
```gherkin
Given I am navigating by keyboard
When I reach a task
Then its delete control is focusable, labelled with the task title, and activatable by Enter or Space
```

---

## R7 · API simulation

> Design rationale in [ADR-0004](adr/0004-api-simulation.md).

#### AC-API-1 — Adding a task calls the API
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-API-1: creating a task sends a POST to the create endpoint carrying the client's id and createdAt"; `test/tasks/mutations.test.ts`
```gherkin
Given I create a task
Then a request is sent to the create endpoint
```

#### AC-API-2 — Deleting a task calls the API
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-API-2: deleting a task sends a DELETE to that task"
```gherkin
Given I delete a task
Then a request is sent to the delete endpoint
```

#### AC-API-3 — The private key never reaches the client
**Status:** ☑ — `test/bundle/no-secret-in-bundle.test.ts` — "AC-API-3: no client chunk mentions the key" and "AC-API-3: no client chunk contains the key" (against `.next/` of a production build; fails, never skips, without one); `test/api/secret-boundary.test.ts`, `test/api/handlers.test.ts`. T-12 confirmed the variable name absent from every client chunk of the deployed build.
```gherkin
Given the application is built for production
When the client bundle is searched for the private key's value and its variable name
Then neither appears
And the key is read only from server-side environment configuration
And the browser's request to the Route Handler carries no key
```
> Asserted by an automated test against build output, not by inspection. This
> is the criterion that makes the secret-handling claim checkable.

#### AC-API-4 — The API rejects unauthenticated requests
**Status:** ☑ — `test/api/upstream.test.ts` — "AC-API-4: a missing key is a 401 with the unauthorized code" and "AC-API-4: no mutation occurs — a 401 consumes neither the script nor the allowance"; `test/api/handlers.test.ts` "AC-API-4: with TASKS_API_KEY unset, POST /api/tasks answers 401"
```gherkin
Given the simulated upstream is called without a valid private key
Then the response status is 401
And no mutation occurs
And a Route Handler whose server environment lacks the key passes that 401 through to the browser
```
> The browser never holds or sends the key (`AC-API-3`), so the caller here
> is the Route Handler, not the client. The Route Handler presents the key to
> an in-process upstream module that demands it — see [ADR-0004](adr/0004-api-simulation.md)
> as amended. *ARCH-03:* the earlier wording made the Route Handler both the
> key-requiring API and the only endpoint the browser can reach, which is a
> `401` on every request.

#### AC-API-5 — The API rate-limits
**Status:** ☑ — `test/api/upstream.test.ts` — "AC-API-5: the request after the allowance is a 429 carrying Retry-After"; `test/api/handlers.test.ts` "AC-API-5: status 429, the Retry-After header in whole seconds, and the body mirror"
```gherkin
Given the configured request allowance for a window is exhausted
When a further request is made
Then the response status is 429
And the response carries a Retry-After header
```

#### AC-API-6 — The client honours Retry-After
**Status:** ☑ — `test/api/client.test.ts` — "AC-API-6: waits at least Retry-After before retrying, then succeeds" and "AC-API-6: does not retry immediately — the wait is a real timer, not a microtask"; `test/api/retry.test.ts`
```gherkin
Given the API responds 429 with Retry-After
When the client handles the response
Then it waits at least the indicated interval before retrying
And it does not retry immediately
```

#### AC-API-7 — Retries are bounded and failures surface
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-API-7: when the API responds 429 repeatedly, retrying stops at the budget, rate limiting is named, and the row is rolled back"; `test/api/client.test.ts`, `test/api/retry.test.ts`, `test/tasks/mutations.test.ts`
```gherkin
Given the API responds 429 repeatedly
When the retry budget is exhausted
Then retrying stops
And the user is shown a message that names rate limiting as the cause
And the optimistic change is rolled back
```

#### AC-API-8 — Optimistic create
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-API-8: the task appears before the API responds, and reconciles without the row remounting or reordering"; `test/tasks/reducer.test.ts`, `test/tasks/mutations.test.ts`
```gherkin
Given I submit a valid task
Then it appears in the list before the API responds
And when the API responds successfully
Then the provisional record is reconciled with the server's record without the row remounting or reordering unexpectedly
```
> Reconciliation is by the client-generated `id`; the server echoes `id` and
> `createdAt` and assigns neither (the T-01 contract), so the row's key and
> its sort position (`AC-LIST-3`) survive the round trip. *(ARCH-03)*

#### AC-API-9 — Optimistic delete with rollback
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-API-9: the task disappears immediately, and when the call ultimately fails it reappears in its previous position with an error announced"
```gherkin
Given I delete a task
Then it disappears from the list immediately
When the API call ultimately fails
Then the task reappears in its previous position
And an error is announced in a live region
```
> Position is derived at render (`AC-LIST-3`), so restoring the record
> restores the position; the criterion asserts the visible outcome, not an
> index.

#### AC-API-10 — Failure and latency are deterministic under test
**Status:** ☑ — `test/api/upstream.test.ts` — "AC-API-10: a scripted failure sequence plays back in order and is identical across runs" and "AC-API-10: nothing in the simulation called Math.random"; `test/api/retry.test.ts`, `test/api/client.test.ts`
```gherkin
Given a test configures the simulation with a fixed latency and a scripted failure sequence
When the test runs
Then the outcomes are reproducible across runs
And no test depends on real elapsed time or on Math.random
```
> Resolution of ambiguity **AM-3** / assumption **A-5**.

#### AC-API-11 — In-flight state is visible and announced
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-API-11: while the create is in flight the row shows a Saving indicator, is aria-busy, and the state is announced" and "AC-API-11: while the delete is in flight an indicator names the task, and the state is announced"
```gherkin
Given a create or delete request is in flight
Then an in-flight indicator is shown for the affected item or control
And the in-flight state is conveyed to assistive technology, not by spinner alone
```

#### AC-API-12 — Rate limiting is distinguishable from other errors
**Status:** ☑ — `test/tasks/optimistic.test.tsx` — "AC-API-12: a rate-limit failure reads differently from a generic failure, and says the action can be retried shortly"; `test/tasks/mutations.test.ts`, `test/api/client.test.ts`
```gherkin
Given a request fails because of rate limiting
Then the message shown differs from a generic failure message
And it indicates that the action can be retried shortly
```

#### AC-API-13 — The Route Handler rejects a malformed request
**Status:** ☑ — `test/api/handlers.test.ts` — "AC-API-13: the Route Handler rejects a malformed request with 400 invalid_request" (describe block; upstream not called, key not presented)
```gherkin
Given the browser sends a create or delete request whose body or id does not satisfy the frozen request schema
When the Route Handler receives it
Then the response status is 400 with the error code invalid_request
And the upstream is not called
And the key is not presented
```
> Validation runs before the key check, so a malformed request never reaches
> the upstream and never consumes rate-limit allowance (`AC-API-5`). The
> schema is `lib/tasks/schema.ts`, frozen at T-01; the status and code are
> `RouteHandlerErrorStatus` in `types/api.ts`. *(ARCH-04, `B-21`: the
> behaviour was built and tested in T-06 with no criterion to name.)*

---

## R9 · State management

#### AC-STATE-1 — A single provider owns task state
**Status:** ☑ — `test/tasks/provider.test.tsx` — "AC-STATE-1: components read state and dispatch through the typed hooks" and "AC-STATE-1: the hooks throw a pointed error outside the provider"; `test/auth/protected-layout.test.tsx` "AC-STATE-1: mounts <TasksProvider> inside RequireAuth …"; `test/tasks/reducer.test.ts`
```gherkin
Given the application renders
Then task state is provided by one Context provider backed by a reducer
And components read it through a typed hook rather than by importing the context directly
```

#### AC-STATE-2 — No full-fledged store is used
**Status:** ☑ — `test/tasks/provider.test.tsx` — "AC-STATE-2: package.json names no full-fledged store"
```gherkin
Given package.json is inspected
Then it contains no Redux, Zustand, MobX, Recoil, or Jotai dependency
```

#### AC-STATE-3 — State hydrates from localStorage
**Status:** ☑ — `test/tasks/provider.test.tsx` — "AC-STATE-3: a valid stored list is restored into state on mount"; `test/tasks/storage.test.ts`
```gherkin
Given localStorage holds a valid task list
When the application mounts
Then the list is restored into state
```

#### AC-STATE-4 — Mutations persist
**Status:** ☑ — `test/tasks/provider.test.tsx` — "AC-STATE-4: add, complete and delete are each written to storage"; `test/tasks/reducer.test.ts`, `test/tasks/storage.test.ts`
```gherkin
Given I add, complete, or delete a task
Then the change is written to localStorage
```

#### AC-STATE-5 — Corrupt stored state fails safe
**Status:** ☑ — `test/tasks/storage.test.ts` — "AC-STATE-5: corrupt stored state fails safe to an empty list" (describe) and "AC-STATE-5: one invalid task empties the whole list, never a partial list"
```gherkin
Given localStorage holds malformed or schema-invalid data
When the application mounts
Then the application renders without throwing
And it falls back to an empty list rather than crashing or rendering partial data
```
> Whatever is in a user's localStorage from six months and three deploys ago
> is untrusted input. This is the criterion that separates a demo from
> something that survives a schema change in production.

#### AC-STATE-6 — Hydration is server-safe
**Status:** ☑ — `test/tasks/provider.test.tsx` — "AC-STATE-6: server rendering touches no storage and matches the first client render" and "AC-STATE-6: reading window.localStorage happens after mount, not during render"; `test/tasks/storage.server.test.ts`
```gherkin
Given the page is server-rendered
When it hydrates on the client
Then no browser-only API is accessed during render
And the console reports no hydration mismatch
```

---

## R8 · Component library

#### AC-UI-5 — UI is built from the chosen library's primitives
**Status:** ☑ — `test/quality/component-boundary.test.ts` — "AC-UI-5: buttons, inputs, checkboxes, selects and dialogs exist as shadcn primitives", "AC-UI-5: no native control is hand-rolled alongside the primitives", "AC-UI-5: the controls the domain renders are imported from components/ui"
```gherkin
Given the interface is implemented
Then every control the interface renders comes from a shadcn/ui primitive
And no equivalent control is hand-rolled alongside the primitives
```
> *ARCH-07 (`B-26`):* the earlier wording named selects and dialogs, and its
> test asserted that those files exist. No screen renders either, so the
> criterion mandated dead code. It now asks what the brief asks. `⚙`-eligible
> after T-19: a lint rule on JSX element names outside `components/ui/**`.

#### AC-UI-6 — A component boundary exists
**Status:** ☑ — `test/quality/component-boundary.test.ts` — "AC-UI-6: no primitive imports from the task domain" and "AC-UI-6: generic primitives live in components/ui and task-domain components in components/tasks"
```gherkin
Given the component tree is inspected
Then generic, app-agnostic primitives live separately from task-domain components
And no primitive imports from the task domain
```
> *ARCH-07:* `⚙`-eligible after T-19 — `no-restricted-imports` scoped to
> `components/ui/**`.
> This is the seam described in [ADR-0003](adr/0003-component-library.md) —
> the line along which a `packages/ui` workspace would be extracted if a
> second consumer ever appeared. Respecting it costs nothing now and makes
> that extraction mechanical later.

---

## R5 · Responsive

#### AC-UI-1 — No horizontal scroll at 320px
**Status:** ◉ — `scripts/responsive-check.mjs` (procedure in `scripts/responsive-check.md`) run by T-13 on 2026-09-02 against a production build of `main` d3070fa (the code the deployed build carries), headless Chromium 1194, device scale 1, coarse-pointer and touch emulation. Viewport 320: `/login` and `/tasks` scrollWidth 320, nothing clipped, with an 87-character unbroken title in the list.
```gherkin
Given the viewport is 320px wide
When I view /login and /tasks
Then no horizontal scrolling is required
And no content is clipped
```

#### AC-UI-2 — Touch targets are adequate
**Status:** ◉ — `scripts/responsive-check.mjs` (procedure in `scripts/responsive-check.md`) run by T-13 on 2026-09-02 against a production build of `main` d3070fa (the code the deployed build carries), headless Chromium 1194, device scale 1, coarse-pointer and touch emulation. Viewports 320 and 768: every control on `/login` (3) and `/tasks` (11) measures ≥ 44 × 44, the four `B-22` controls included. The deployed build serves the `B-22` classes (`pointer-coarse:h-11` on the login fields and Log in, read from the production `/login` HTML on 2026-09-02).
```gherkin
Given a touch viewport
Then interactive controls are at least 44 by 44 CSS pixels
```

#### AC-UI-3 — Layout adapts at desktop width
**Status:** ◉ — `scripts/responsive-check.mjs` (procedure in `scripts/responsive-check.md`) run by T-13 on 2026-09-02 against a production build of `main` d3070fa (the code the deployed build carries), headless Chromium 1194, device scale 1, coarse-pointer and touch emulation. Viewport 1024: form 320px and list 592px side by side in a 1024px main; single column at 320 and 768.
```gherkin
Given the viewport is at least 1024px wide
Then the layout uses the additional width rather than rendering a stretched mobile column
```

#### AC-UI-4 — Tablet width is not broken
**Status:** ◉ — `scripts/responsive-check.mjs` (procedure in `scripts/responsive-check.md`) run by T-13 on 2026-09-02 against a production build of `main` d3070fa (the code the deployed build carries), headless Chromium 1194, device scale 1, coarse-pointer and touch emulation. Viewport 768: `/login` and `/tasks` scrollWidth 768, nothing clipped, single column (main 672px).
```gherkin
Given the viewport is 768px wide
Then the layout is usable, with no overlap or clipping
```

---

## Accessibility (added — not in the brief)

#### AC-A11Y-1 — All controls are labelled
**Status:** ☑ — `test/a11y.test.tsx` — "AC-A11Y-1: on the login page every input and button has an accessible name and none relies on a placeholder" and the tasks-page counterpart
```gherkin
Given any page
Then every input, button, and control has an accessible name
And no control relies on placeholder text as its only label
```

#### AC-A11Y-2 — Errors are programmatically associated
**Status:** ☑ — `test/a11y.test.tsx` — "AC-A11Y-2: a failing task field is aria-invalid and aria-describedby points at its own error text", the login counterpart, and "AC-A11Y-2: the association is removed once the error clears"
```gherkin
Given a validation error is displayed
Then it is linked to its field via aria-describedby
And the field is marked aria-invalid
```

#### AC-A11Y-3 — Asynchronous outcomes are announced
**Status:** ☑ — `test/a11y.test.tsx` — "AC-A11Y-3: a create that succeeds is announced in the polite live region" plus the create-fails, completion, delete-succeeds and delete-fails cases
```gherkin
Given a create, complete, or delete completes or fails
Then the outcome is announced through a live region
```

#### AC-A11Y-4 — Full keyboard operability
**Status:** ◉ — Keyboard-only walk by T-13 on 2026-09-02, headless Chromium 1194 at 1024 × 900 over the DevTools protocol against a production build of `main` d3070fa, key events only (Tab, Shift, Enter, Space, arrows), no pointer: Tab to Username and Password, Enter submits and lands on `/tasks`; Tab to Title and Due date, Enter adds the task and focus returns to Title; Tab to the filter group, ArrowRight moves focus to Pending and Space selects it (`?filter=pending`), ArrowLeft and Space return to All; Tab to the row checkbox, Space marks it complete (`aria-checked="true"`); Tab to Delete, Enter removes the row with no dialog and focus moves to the filter group, not to `<body>`; Tab to Log out, Enter lands on `/login` with sessionStorage empty. Every stop matched `:focus-visible` with the ring visible in screenshots; Tab from the last stop wraps to the browser chrome and back, so nothing traps. Also asserted by `test/a11y.test.tsx` "AC-A11Y-4: a task is added, filtered, completed and deleted by keyboard alone, and the session is ended" and the focus-management cases beside it. Note: the filter is a Radix toggle group, so arrow keys move focus and Space or Enter selects; a native radio group would select on arrow alone. Operable, and recorded here as an observation rather than a failure. **Amended 2026-09-03 (ARCH-08, `B-31`):** T-18 added a site nav (`/presentation`, the deep-dive walkthrough, and an auth-aware `/tasks`-or-`/login` link) to `/login` and the protected layout, whose three links are now the first three tab stops on `/tasks`, ahead of Log out — so "Tab to Log out, Enter lands on `/login`" above is no longer the first stop, only the last one. `test/a11y.test.tsx`'s keyboard-walk test was updated to the new order by T-18 and passes, with focus visible throughout and no trap, on the same unchanged CSS this record already describes. The `◉` mark stands on that re-run rather than a fresh dated walk, because nothing about *how* keyboard operability works changed — only which stop comes first.
```gherkin
Given I use only a keyboard
Then I can log in, add a task, change the filter, complete a task, delete a task, and log out
And focus is always visible
And focus is never trapped
```

#### AC-A11Y-5 — No colour-only meaning
**Status:** ☑ — `test/a11y.test.tsx` — "AC-A11Y-5: pending, completed and overdue are each conveyed by text, and completion by the checkbox state", the error case, and "AC-A11Y-5: the active filter is exposed as a checked state, not a colour"
```gherkin
Given any status is conveyed
Then it is conveyed by text or shape in addition to colour
```

#### AC-A11Y-6 — Automated accessibility checks pass
**Status:** ☑ — `test/a11y.test.tsx` — "AC-A11Y-6: the login page has no violations, empty and after a failed submission", "AC-A11Y-6: the tasks page has no violations with pending, completed and overdue rows, under each filter, and with form errors", and the empty state (jest-axe)
```gherkin
Given the login page and the tasks page are rendered in tests
When an automated accessibility check runs against them
Then no violations are reported
```

---

## R4 · TypeScript quality

#### AC-QUAL-1 — Strict TypeScript, clean typecheck
**Status:** ☑ — `test/quality/typescript.test.ts` — "AC-QUAL-1: tsconfig enables strict mode", "AC-QUAL-1: the typecheck script is a full tsc pass", "AC-QUAL-1: no explicit any appears in application source". `npm run typecheck` and `npm run lint` clean on `main` d3070fa, 2026-09-02
```gherkin
Given the repository
Then TypeScript strict mode is enabled
And the typecheck script passes with no errors
And no explicit any appears in application source
```
> *ARCH-07:* `⚙`-eligible after T-19 — `tsconfig.json` `strict`, the
> `typecheck` script, and `@typescript-eslint/no-explicit-any`.

#### AC-QUAL-2 — Suppressions are justified
**Status:** ☑ — `test/quality/typescript.test.ts` — "AC-QUAL-2: no @ts-ignore, and every @ts-expect-error carries a reason"
```gherkin
Given a type suppression exists
Then it is @ts-expect-error rather than @ts-ignore
And it carries a comment explaining why
```
> *ARCH-07:* `⚙`-eligible after T-19 — `@typescript-eslint/ban-ts-comment`
> with `allow-with-description`.

---

## R6 · Tests

#### AC-TEST-1 — Every criterion has a test
**Status:** ☑ — `test/quality/test-sweep.test.ts` — "AC-TEST-1: every criterion outside the manual-only seven is named by a test or describe block" and "AC-TEST-1: the manual-only set is exactly the seven the legend names". QA cross-check 2026-09-02: every `it`/`test` block under `test/` contains an assertion; none names an ID and asserts nothing.
```gherkin
Given this document
Then each criterion ID appears in at least one test name or describe block
Or, for the seven ◉-eligible criteria only, a manual procedure and date are named beside it
And a criterion with neither is not marked met
```

#### AC-TEST-2 — Tests assert behaviour through accessible queries
**Status:** ☑ — `test/quality/test-sweep.test.ts` — "AC-TEST-2: every component test that queries the screen does so by role, label or text"
```gherkin
Given a component test
Then it queries by role, label, or visible text
And it does not assert on implementation details such as internal state or class names
```
> *ARCH-07:* `⚙`-eligible after T-19 — `eslint-plugin-testing-library` and a
> `no-restricted-syntax` rule on class-name and instance assertions in `test/**`.

#### AC-TEST-3 — No snapshot-only coverage
**Status:** ☑ — `test/quality/test-sweep.test.ts` — "AC-TEST-3: no test file uses a snapshot assertion" and "AC-TEST-3: no __snapshots__ directory exists under test/"
```gherkin
Given the test suite
Then no component's only test is a snapshot assertion
```
> *ARCH-07:* `⚙`-eligible after T-19 — `no-restricted-syntax` on snapshot
> matchers in `test/**`.

#### AC-TEST-4 — Coverage floor on logic
**Status:** ☑ — `test/quality/test-sweep.test.ts` — "AC-TEST-4: a full run collects coverage, so the floor is enforced rather than reported"; `jest.config.mjs` `coverageThreshold` sets 80% statements on `lib/tasks/`, `lib/api/` and `lib/tasks/validation.ts`, and `npm test` (299 tests, 29 suites) passes it on `main` d3070fa, 2026-09-02
```gherkin
Given coverage is collected
Then statement coverage of the state, API-client, and validation modules is at least 80 percent
And the threshold is enforced by the test runner, not merely reported
```
> *ARCH-07:* `⚙`-eligible after T-19 — `jest.config.mjs` `coverageThreshold`,
> enforced on the `test:ci` script that CI runs.

---

## CI and deployment (added — not in the brief)

#### AC-CI-1 — Checks run on every pull request
**Status:** ☑ — `test/quality/ci.test.ts` — "AC-CI-1: typecheck, lint, tests, production build and bundle test run, in that order" and "AC-CI-1: the CI workflow triggers on pull_request with no branch filter". The check "Typecheck, lint, test, build, bundle" ran and passed on PR #32 before its merge.
```gherkin
Given a pull request is opened
Then typecheck, lint, the test suite, a production build, and the bundle test run in CI
And a failure blocks the merge
```
> *ARCH-07:* `⚙`-eligible after T-19 — the workflow file itself, with its
> step order, is the proof; `AC-CI-2` remains the manual check that it is
> required.

#### AC-CI-2 — The check is required
**Status:** ◉ — Read on 2026-09-02 through the GitHub API: `main` reports `protected: true`, and the head of PR #32 carried the CI check "Typecheck, lint, test, build, bundle" (success) before the merge at 19:48 UTC. `docs/REPO-PROTECTIONS.md` §2 is the procedure that registered it and the `SETUP-01` ledger row records it as done. The ruleset's own required-check list is not readable from this session (no ruleset endpoint in the tools available), so the setting is verified by its effect, not by reading it; the operator can confirm by the push test in `docs/REPO-PROTECTIONS.md` §5.
```gherkin
Given branch protection on main
Then the CI workflow is registered as a required status check
```

#### AC-DEP-1 — A live URL serves the application
**Status:** ◐ — The URL is live: on 2026-09-02 the production deployment (`dpl_4Sv2Q6ECvoRt93vZRfZwTdPU1nz2`, `READY`, `main` d3070fa) serves `/` and `/login` with 200 on the public alias with no Vercel login prompt, and T-12 recorded the key present server-side and absent from every client chunk. The full path at phone width — log in, add, filter, complete, delete, reload, log out — has been walked only under Chromium emulation against local production builds (T-12; T-13's `scripts/responsive-check.mjs` run at 320 covers log in and add). No session has a phone and the container cannot open vercel.app in a browser, so the walk on a real device is the operator's: `B-24`. **Amended 2026-09-03 (ARCH-08):** accepted at `◐` for submission. The gap is a verification step only a human with a physical device can close, not build work an agent session can pick up, and the criterion it stands in for — the app works at phone width — is independently evidenced by `AC-UI-1..4`'s emulated device-width walks and `AC-DEP-1`'s own 320px coverage above. Time is out; this does not block the submission and is not scheduled further.
```gherkin
Given the deployed URL
When it is opened on a phone-width viewport
Then the full path — log in, add, filter, complete, delete, reload, log out — works
```

---

## Ambiguities and their resolutions

Each of these is a place where the brief admits more than one reading. The
resolution is a decision, taken now and recorded, rather than a coin flip
taken silently during the build.

| ID | Ambiguity | Readings | **Resolution** |
|---|---|---|---|
| **AM-1** | "Use pages for the log in form and user list" — App Router or Pages Router? | (a) Two distinct routes; (b) literally the Next.js Pages Router. | **App Router.** Distinct routes satisfy the phrase under either reading. Route Handlers keep the private key server-side by construction, which is the strongest available answer to the secret-handling requirement. Recorded with the wording called out explicitly in [ADR-0001](adr/0001-app-router.md) so the choice reads as deliberate. |
| **AM-2** | "Simulate an API call" — how far does simulation go? | (a) A `setTimeout` in the client; (b) a real network round trip to a server route that enforces the key and the rate limit. | **(b).** A client-side timer cannot demonstrate server-side key handling or a 429, which the same sentence explicitly asks about. The simulation is two server-side layers: a Next.js Route Handler that holds the key, and an in-process upstream module that demands it, enforces a limit, and injects latency. The browser never sends the key. Everything the brief mentions becomes observable and testable. |
| **AM-3** | Should the simulation fail randomly? | (a) Random failure looks realistic; (b) deterministic, injectable failure is testable. | **(b), with a seeded default.** Random failure makes the Jest requirement unsatisfiable without flakes. Failure behaviour is driven by injectable configuration; the deployed demo uses a fixed, documented profile. See assumption **A-5**. |
| **AM-4** | Are past due dates permitted? | (a) Block them; (b) allow and mark overdue. | **(b).** Blocking prevents logging work that is already late — the common real case. Overdue is a display concern. `AC-ADD-7`, `AC-LIST-4`. |
| **AM-5** | What order does the list use? | Unspecified. | **Due date ascending, then creation time ascending.** Unspecified ordering is untestable. `AC-LIST-3`. |
| **AM-6** | Does the task list survive logout? | (a) Clear on logout; (b) persist. | **(b).** "Semi-persistent" distinguishes the list from the session — that distinction is the whole reason the brief names two different storage mechanisms. `AC-AUTH-10`. |
| **AM-7** | Should delete be confirmed? | (a) Modal; (b) immediate; (c) undo. | **(b) for P1.** Not requested by the brief; a modal on every delete is friction. Failures roll back visibly. Undo is the better pattern and is named as out of scope rather than omitted silently. `AC-DEL-3`. |
| **AM-8** | "user list" — a list of users, or the user's tasks? | (a) User accounts; (b) the signed-in user's tasks. | **(b).** No user-management requirement appears anywhere else in the brief. Assumption **A-3**. |
| **AM-9** | Is sessionStorage for auth acceptable? | It is what the brief specifies, and it is not what production should do. | **Follow the brief, and say so.** Implemented exactly as specified. A token in `sessionStorage` is readable by any script on the origin, so it is XSS-exposed; production would use an `HttpOnly`, `Secure`, `SameSite` cookie set by the server. Documented in [ADR-0005](adr/0005-auth-and-secret-boundary.md) and stated in the app itself, so it can never be mistaken for a recommendation. |
| **AM-10** | "Consider potential rate-limiting scenarios" — document or implement? | (a) Describe a strategy; (b) build it. | **(b).** "Consider" is weaker than "implement," so this is over-delivery by choice, not a requirement — recorded as assumption **A-4**. It is the strongest eCommerce analogue in the brief and the best available place to spend surplus effort. |
| **AM-11** | Which credentials are valid at login? | Unspecified — there is no user store. | **Any non-empty username with a password meeting a stated minimum length**, validated client-side against a documented rule. There is no user database and the brief does not ask for one. The rule is stated on the page so a reviewer is never locked out of the demo. |
| **AM-12** | Are due dates timestamps or calendar days? | (a) Date-time; (b) date only. | **Date only, compared in the user's local timezone.** A task due "Wednesday" is due all Wednesday. Storing an instant would make overdue status flip by timezone, which is a real and commonly shipped bug. |
