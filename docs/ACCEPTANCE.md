# ACCEPTANCE.md — testable criteria

> **Status:** specification. No criterion is met until a named test proves it.
> **Companion to:** [`PROJECT.md`](PROJECT.md) · [`TASKS.md`](TASKS.md) · [`adr/`](adr/)

Every requirement in Aritzia's brief is decomposed here into numbered
Given/When/Then criteria. Each ID maps to **one or more tests** and is
**referenced in the commit** that satisfies it, so a reviewer can trace any
line of the brief to the code that implements it and the test that proves it.

**Commit convention:** `feat(tasks): add optimistic delete [AC-DEL-1, AC-API-9]`

**Status legend:** `☐` not started · `◐` implemented, untested · `☑` met, test named

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
| R7 | "Simulate an API call on each addition and removal (assume the API requires a private key for use and consider potential rate-limiting scenarios)" | `AC-API-1..12` |
| R8 | "Build UI components using a React component library of your choice (eg. Shadcn)" | `AC-UI-5..6` |
| R9 | "Use a provider for state management, incorporating semipersistent state principles without relying on a full-fledged store" | `AC-STATE-1..6` |
| R10 | "Add a locally persisted log in form … using session storage for authentication data and local storage for maintaining a semi-persistent list" | `AC-AUTH-1..10` |
| R11 | "Use pages for the log in form and user list" | `AC-NAV-1..4` |
| — | Not in the brief; added deliberately (see PROJECT.md §4) | `AC-A11Y-1..6`, `AC-CI-1..2`, `AC-DEP-1` |

---

## R10 · Authentication

#### AC-AUTH-1 — Login form renders
```gherkin
Given I am unauthenticated
When I visit /login
Then I see a form with a labelled username field, a labelled password field, and a submit button
And the password field is of type password
```

#### AC-AUTH-2 — Valid credentials authenticate and redirect
```gherkin
Given I am on /login
When I submit valid credentials
Then an auth record is written to sessionStorage
And I am redirected to /tasks
```

#### AC-AUTH-3 — Invalid credentials are rejected
```gherkin
Given I am on /login
When I submit credentials that do not validate
Then an error message is displayed in a role="alert" region
And nothing is written to sessionStorage
And I remain on /login
```

#### AC-AUTH-4 — Session survives reload in the same tab
```gherkin
Given I am authenticated on /tasks
When I reload the page
Then I remain authenticated
And I am not redirected to /login
```

#### AC-AUTH-5 — Session does not survive a new tab
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
```gherkin
Given I am authenticated
When I activate Log out
Then the auth record is removed from sessionStorage
And I am redirected to /login
```

#### AC-AUTH-7 — Protected route redirects when unauthenticated
```gherkin
Given I am unauthenticated
When I navigate directly to /tasks
Then I am redirected to /login
And no task data is rendered before the redirect
```

#### AC-AUTH-8 — Login route redirects when already authenticated
```gherkin
Given I am authenticated
When I navigate to /login
Then I am redirected to /tasks
```

#### AC-AUTH-9 — No credential is ever persisted
```gherkin
Given I have authenticated successfully
When I inspect sessionStorage and localStorage
Then no entry contains the submitted password in any form
```

#### AC-AUTH-10 — The task list outlives the session
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
```gherkin
Given the application is running
When I request /login
Then a login page is served
```

#### AC-NAV-2 — Task list exists at its own route
```gherkin
Given the application is running
When I request /tasks
Then the task list page is served
```

#### AC-NAV-3 — Root redirects by auth state
```gherkin
Given I request /
When I am authenticated
Then I am redirected to /tasks
When I am unauthenticated
Then I am redirected to /login
```

#### AC-NAV-4 — Route protection is centralised
```gherkin
Given route protection is implemented
When a new authenticated route is added
Then it is protected by the same shared mechanism, not a per-page copy
```

---

## R1 · Adding tasks

#### AC-ADD-1 — A valid task is created
```gherkin
Given I am authenticated on /tasks
When I enter a title and a due date and submit
Then the task appears in the list with that title and due date
And its status is Pending
```

#### AC-ADD-2 — Empty title is rejected
```gherkin
Given I am on the add-task form
When I submit with an empty title
Then no task is created
And an inline error is shown, associated with the title field via aria-describedby
And no API request is made
```

#### AC-ADD-3 — Missing due date is rejected
```gherkin
Given I am on the add-task form
When I submit with a title but no due date
Then no task is created
And an inline error is shown, associated with the due-date field
```

#### AC-ADD-4 — Whitespace-only title is rejected and titles are trimmed
```gherkin
Given I am on the add-task form
When I submit a title consisting only of whitespace
Then no task is created
When I submit a title with leading and trailing whitespace
Then the stored title is trimmed
```

#### AC-ADD-5 — Title length is bounded
```gherkin
Given I am on the add-task form
When I enter a title longer than 200 characters
Then submission is rejected with an inline error stating the limit
```

#### AC-ADD-6 — The form resets and returns focus after success
```gherkin
Given I have successfully created a task
Then the title and due-date fields are cleared
And focus returns to the title field
```

#### AC-ADD-7 — A past due date is allowed and marked overdue
```gherkin
Given I am on the add-task form
When I submit a task with a due date in the past
Then the task is created
And it is marked overdue in the list
```
> Resolution of ambiguity **AM-4**. Blocking past dates would prevent logging
> work that is already late, which is the common real case.

#### AC-ADD-8 — Double submission is prevented
```gherkin
Given a create request is in flight
When I activate submit again before it resolves
Then only one task is created
And the submit control is disabled while the request is pending
```

---

## R2 · List and filter

#### AC-LIST-1 — Tasks render with their attributes
```gherkin
Given I have tasks
When I view /tasks
Then each task shows its title, its due date, and its completion state
```

#### AC-LIST-2 — Empty state when there are no tasks at all
```gherkin
Given I have no tasks
When I view /tasks
Then I see an empty state inviting me to add my first task
And I do not see an empty list container with no explanation
```

#### AC-LIST-3 — Deterministic ordering
```gherkin
Given I have several tasks with different due dates
When I view the list
Then tasks are ordered by due date ascending
And tasks sharing a due date are ordered by creation time ascending
```
> Resolution of ambiguity **AM-5**. Ordering is unspecified in the brief;
> unspecified ordering is untestable, so it is fixed here.

#### AC-LIST-4 — Overdue tasks are distinguishable without colour
```gherkin
Given I have a pending task whose due date has passed
When I view the list
Then it is marked overdue by text or icon, not by colour alone
```

#### AC-FILT-1 — All shows every task
```gherkin
Given I have pending and completed tasks
When the filter is All
Then every task is listed
```

#### AC-FILT-2 — Pending shows only incomplete tasks
```gherkin
Given I have pending and completed tasks
When I select Pending
Then only tasks that are not complete are listed
```

#### AC-FILT-3 — Completed shows only complete tasks
```gherkin
Given I have pending and completed tasks
When I select Completed
Then only tasks that are complete are listed
```

#### AC-FILT-4 — Filter state is addressable in the URL
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
```gherkin
Given I have tasks but none match the active filter
When I view the list
Then the empty state names the active filter
And it is distinguishable from the no-tasks-at-all state
```

#### AC-FILT-6 — Completing a task under a filter behaves correctly
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
```gherkin
Given I have a pending task
When I mark it complete
Then its state changes to Completed
And the control's accessible state reflects completion
```

#### AC-DONE-2 — Completion can be reversed
```gherkin
Given I have a completed task
When I mark it incomplete
Then its state returns to Pending
```

#### AC-DONE-3 — Completion persists across reload
```gherkin
Given I have marked a task complete
When I reload the page
Then it is still complete
```

#### AC-DEL-1 — A task can be deleted
```gherkin
Given I have a task
When I delete it
Then it is removed from the list
And it does not return after reload
```

#### AC-DEL-2 — Deletion is announced
```gherkin
Given I delete a task
Then the deletion is announced in a live region
```

#### AC-DEL-3 — Deletion has no confirmation dialog
```gherkin
Given I activate delete on a task
Then the task is deleted without an intervening confirmation modal
```
> Resolution of ambiguity **AM-7**. The brief specifies no confirmation. A
> modal on every delete is friction; the honest mitigation for a destructive
> action here is that failures roll the task back visibly (`AC-API-9`). An undo
> affordance is the better pattern and is recorded as out of scope for P1.

#### AC-DEL-4 — Delete is keyboard reachable
```gherkin
Given I am navigating by keyboard
When I reach a task
Then its delete control is focusable, labelled with the task title, and activatable by Enter or Space
```

---

## R7 · API simulation

> Design rationale in [ADR-0004](adr/0004-api-simulation.md).

#### AC-API-1 — Adding a task calls the API
```gherkin
Given I create a task
Then a request is sent to the create endpoint
```

#### AC-API-2 — Deleting a task calls the API
```gherkin
Given I delete a task
Then a request is sent to the delete endpoint
```

#### AC-API-3 — The private key never reaches the client
```gherkin
Given the application is built for production
When the client bundle is searched for the private key's value and its variable name
Then neither appears
And the key is read only from server-side environment configuration
```
> Asserted by an automated test against build output, not by inspection. This
> is the criterion that makes the secret-handling claim checkable.

#### AC-API-4 — The API rejects unauthenticated requests
```gherkin
Given a request is made to the API without a valid private key
Then the response status is 401
And no mutation occurs
```

#### AC-API-5 — The API rate-limits
```gherkin
Given the configured request allowance for a window is exhausted
When a further request is made
Then the response status is 429
And the response carries a Retry-After header
```

#### AC-API-6 — The client honours Retry-After
```gherkin
Given the API responds 429 with Retry-After
When the client handles the response
Then it waits at least the indicated interval before retrying
And it does not retry immediately
```

#### AC-API-7 — Retries are bounded and failures surface
```gherkin
Given the API responds 429 repeatedly
When the retry budget is exhausted
Then retrying stops
And the user is shown a message that names rate limiting as the cause
And the optimistic change is rolled back
```

#### AC-API-8 — Optimistic create
```gherkin
Given I submit a valid task
Then it appears in the list before the API responds
And when the API responds successfully
Then the provisional record is reconciled with the server's record without the row remounting or reordering unexpectedly
```

#### AC-API-9 — Optimistic delete with rollback
```gherkin
Given I delete a task
Then it disappears from the list immediately
When the API call ultimately fails
Then the task reappears in its previous position
And an error is announced in a live region
```

#### AC-API-10 — Failure and latency are deterministic under test
```gherkin
Given a test configures the simulation with a fixed latency and a scripted failure sequence
When the test runs
Then the outcomes are reproducible across runs
And no test depends on real elapsed time or on Math.random
```
> Resolution of ambiguity **AM-3** / assumption **A-5**.

#### AC-API-11 — In-flight state is visible and announced
```gherkin
Given a create or delete request is in flight
Then a pending indicator is shown for the affected item or control
And the pending state is conveyed to assistive technology, not by spinner alone
```

#### AC-API-12 — Rate limiting is distinguishable from other errors
```gherkin
Given a request fails because of rate limiting
Then the message shown differs from a generic failure message
And it indicates that the action can be retried shortly
```

---

## R9 · State management

#### AC-STATE-1 — A single provider owns task state
```gherkin
Given the application renders
Then task state is provided by one Context provider backed by a reducer
And components read it through a typed hook rather than by importing the context directly
```

#### AC-STATE-2 — No full-fledged store is used
```gherkin
Given package.json is inspected
Then it contains no Redux, Zustand, MobX, Recoil, or Jotai dependency
```

#### AC-STATE-3 — State hydrates from localStorage
```gherkin
Given localStorage holds a valid task list
When the application mounts
Then the list is restored into state
```

#### AC-STATE-4 — Mutations persist
```gherkin
Given I add, complete, or delete a task
Then the change is written to localStorage
```

#### AC-STATE-5 — Corrupt stored state fails safe
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
```gherkin
Given the page is server-rendered
When it hydrates on the client
Then no browser-only API is accessed during render
And the console reports no hydration mismatch
```

---

## R8 · Component library

#### AC-UI-5 — UI is built from the chosen library's primitives
```gherkin
Given the interface is implemented
Then buttons, inputs, checkboxes, selects, and dialogs come from shadcn/ui primitives
And equivalent controls are not hand-rolled alongside them
```

#### AC-UI-6 — A component boundary exists
```gherkin
Given the component tree is inspected
Then generic, app-agnostic primitives live separately from task-domain components
And no primitive imports from the task domain
```
> This is the seam described in [ADR-0003](adr/0003-component-library.md) —
> the line along which a `packages/ui` workspace would be extracted if a
> second consumer ever appeared. Respecting it costs nothing now and makes
> that extraction mechanical later.

---

## R5 · Responsive

#### AC-UI-1 — No horizontal scroll at 320px
```gherkin
Given the viewport is 320px wide
When I view /login and /tasks
Then no horizontal scrolling is required
And no content is clipped
```

#### AC-UI-2 — Touch targets are adequate
```gherkin
Given a touch viewport
Then interactive controls are at least 44 by 44 CSS pixels
```

#### AC-UI-3 — Layout adapts at desktop width
```gherkin
Given the viewport is at least 1024px wide
Then the layout uses the additional width rather than rendering a stretched mobile column
```

#### AC-UI-4 — Tablet width is not broken
```gherkin
Given the viewport is 768px wide
Then the layout is usable, with no overlap or clipping
```

---

## Accessibility (added — not in the brief)

#### AC-A11Y-1 — All controls are labelled
```gherkin
Given any page
Then every input, button, and control has an accessible name
And no control relies on placeholder text as its only label
```

#### AC-A11Y-2 — Errors are programmatically associated
```gherkin
Given a validation error is displayed
Then it is linked to its field via aria-describedby
And the field is marked aria-invalid
```

#### AC-A11Y-3 — Asynchronous outcomes are announced
```gherkin
Given a create, complete, or delete completes or fails
Then the outcome is announced through a live region
```

#### AC-A11Y-4 — Full keyboard operability
```gherkin
Given I use only a keyboard
Then I can log in, add a task, change the filter, complete a task, delete a task, and log out
And focus is always visible
And focus is never trapped
```

#### AC-A11Y-5 — No colour-only meaning
```gherkin
Given any status is conveyed
Then it is conveyed by text or shape in addition to colour
```

#### AC-A11Y-6 — Automated accessibility checks pass
```gherkin
Given the login page and the tasks page are rendered in tests
When an automated accessibility check runs against them
Then no violations are reported
```

---

## R4 · TypeScript quality

#### AC-QUAL-1 — Strict TypeScript, clean typecheck
```gherkin
Given the repository
Then TypeScript strict mode is enabled
And the typecheck script passes with no errors
And no explicit any appears in application source
```

#### AC-QUAL-2 — Suppressions are justified
```gherkin
Given a type suppression exists
Then it is @ts-expect-error rather than @ts-ignore
And it carries a comment explaining why
```

---

## R6 · Tests

#### AC-TEST-1 — Every criterion has a test
```gherkin
Given this document
Then each criterion ID appears in at least one test name or describe block
And a criterion with no test is not marked met
```

#### AC-TEST-2 — Tests assert behaviour through accessible queries
```gherkin
Given a component test
Then it queries by role, label, or visible text
And it does not assert on implementation details such as internal state or class names
```

#### AC-TEST-3 — No snapshot-only coverage
```gherkin
Given the test suite
Then no component's only test is a snapshot assertion
```

#### AC-TEST-4 — Coverage floor on logic
```gherkin
Given coverage is collected
Then statement coverage of the state, API-client, and validation modules is at least 80 percent
And the threshold is enforced by the test runner, not merely reported
```

---

## CI and deployment (added — not in the brief)

#### AC-CI-1 — Checks run on every pull request
```gherkin
Given a pull request is opened
Then typecheck, lint, and the test suite run in CI
And a failure blocks the merge
```

#### AC-CI-2 — The check is required
```gherkin
Given branch protection on main
Then the CI workflow is registered as a required status check
```

#### AC-DEP-1 — A live URL serves the application
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
| **AM-2** | "Simulate an API call" — how far does simulation go? | (a) A `setTimeout` in the client; (b) a real network round trip to a server route that enforces the key and the rate limit. | **(b).** A client-side timer cannot demonstrate server-side key handling or a 429, which the same sentence explicitly asks about. The simulation is a Next.js Route Handler that validates the key, enforces a limit, and injects latency. Everything the brief mentions becomes observable and testable. |
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
