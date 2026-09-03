/*
 * The deck, as data, served at /presentation.
 *
 * One source for both renderings: `app/presentation/deck.tsx` renders it in
 * the browser, and `docs/presentation/build-deck.mjs` renders it to
 * `public/presentation/aritzia-task-management.pptx`, the download the page
 * offers. Edit here and both change.
 *
 * Every number is quoted from docs/LEDGER.md, docs/ACCEPTANCE.md or
 * docs/BLOCKERS.md as of main fb7e61f (2026-09-02); refresh section 5's two
 * ledger slides after a freeze that changes those numbers.
 *
 * Erasable-syntax TypeScript only (no enums, no parameter properties):
 * Node strips the types when the build script imports this file directly.
 */

export type Slide =
  | {
      layout: "title";
      section: string;
      title: string;
      subtitle: string;
      meta: string[];
      minutes: number;
      notes: string;
    }
  | {
      layout: "close";
      section: string;
      title: string;
      lines: string[];
      minutes: number;
      notes: string;
    }
  | {
      layout: "statement";
      section: string;
      title: string;
      lines: string[];
      minutes: number;
      notes: string;
    }
  | {
      layout: "cards";
      section: string;
      title: string;
      lead: string;
      cards: { h: string; p: string }[];
      minutes: number;
      notes: string;
    }
  | {
      layout: "table";
      section: string;
      title: string;
      lead: string;
      columns: string[];
      rows: string[][];
      minutes: number;
      notes: string;
    }
  | {
      layout: "trace";
      section: string;
      title: string;
      steps: { label: string; text: string; mono?: boolean }[];
      minutes: number;
      notes: string;
    }
  | {
      layout: "diagram";
      section: string;
      title: string;
      lead: string;
      nodes: { h: string; lines: string[] }[];
      aside: string[];
      minutes: number;
      notes: string;
    }
  | {
      layout: "columns";
      section: string;
      title: string;
      lead: string;
      cols: { h: string; items: string[] }[];
      minutes: number;
      notes: string;
    }
  | {
      layout: "stats";
      section: string;
      title: string;
      lead: string;
      stats: { n: string; l: string }[];
      foot: string;
      minutes: number;
      notes: string;
    }
  | {
      layout: "chart";
      section: string;
      title: string;
      lead: string;
      chart: Chart;
      points: string[];
      minutes: number;
      notes: string;
    };

export type Chart =
  | {
      kind: "bars";
      unit: string;
      values: { label: string; value: number; note?: string }[];
    }
  | {
      kind: "dots";
      caption: string;
      series: { label: string; values: number[] }[];
      axis: string;
    };

export const REPO = "github.com/Justinohallo/aritzia-task-management";
export const LIVE = "aritzia-task-management.vercel.app";
export const PPTX_PATH = "/presentation/aritzia-task-management.pptx";

export const SLIDES: Slide[] = [
  {
    layout: "title",
    section: "",
    title: "A to-do list, built like a checkout flow",
    subtitle:
      "Senior Developer technical case · approach, rationale, and the AI workflow that produced it",
    meta: [
      "Justin O'Halloran · 2 September 2026",
      "github.com/Justinohallo/aritzia-task-management",
      "aritzia-task-management.vercel.app",
    ],
    minutes: 0.5,
    notes:
      "Two deliverables: the application is the evidence, this is the argument. Everything I claim in the next eighteen minutes is a grep away in the repo, and I will show one of those greps live.",
  },
  {
    layout: "statement",
    section: "1 · Proportionality",
    title: "Yes. This is a lot of process for a to-do list.",
    lines: [
      "Nobody is impressed by a to-do list. What is being assessed is everything around it: was the brief read precisely, were the trade-offs named, do the tests test anything, was the scope sized right.",
      "So the process is the product, and it is deliberately over-instrumented in one direction only: traceability. Every line of the brief maps to a numbered criterion, a named test, and a commit.",
      "What it is not is over-built. The next slide is the list of things I declined.",
    ],
    minutes: 1,
    notes:
      "Meet the top risk head-on before it is asked (PROJECT.md section 8). The argument: instrumentation around a small app is cheap and auditable; architecture around a small app is expensive and silent. I spent on the first and refused the second.",
  },
  {
    layout: "table",
    section: "1 · Proportionality",
    title: "The NOT list",
    lead: "Each cut is deliberate and defensible on request. The first two were chosen at intake; the rest are forced by the 48-hour appetite or absent from the brief.",
    columns: ["Not doing", "Why"],
    rows: [
      [
        "Real auth provider (Auth.js, OAuth, JWT)",
        "The brief specifies sessionStorage. Substituting a real provider ignores an explicit instruction. Recorded as non-production in ADR-0005.",
      ],
      [
        "Turborepo monorepo",
        "A monorepo earns its cost at two deployables or two consumers of a shared package. There is one app. The seam is documented instead.",
      ],
      [
        "Real backend or database",
        "The brief specifies localStorage as the store. A database contradicts the stated persistence model.",
      ],
      [
        "Multi-user, assignment, collaboration",
        "Not in the brief. Invites sync, conflict and permission questions a 48-hour build cannot answer honestly.",
      ],
      [
        "Edit, reorder, priority, tags, search",
        "Not in the brief. Create, complete, delete are the stated operations.",
      ],
      [
        "Admin app for user creation",
        'Traced to a misreading of "user list" (AM-8). Would be graded as production security code.',
      ],
      [
        "Storybook · Playwright E2E",
        "Both on the P2 list with a concrete plan. Neither ships the app; the brief names Jest + RTL.",
      ],
    ],
    minutes: 0.75,
    notes:
      "Read two or three, not all seven. The point is that every absence has a sentence attached. The monorepo line is the one an engineering panel will push on, so the next slide is the seam.",
  },
  {
    layout: "cards",
    section: "1 · Proportionality",
    title: "Where the seam is, and why it is not cut",
    lead: "ADR-0003. shadcn/ui: buy the behaviour (Radix), own the source. The boundary that would make a package extraction mechanical is enforced now, by a test.",
    cards: [
      {
        h: "components/ui/",
        p: "Generic primitives, copied into the repo. No primitive imports from the task domain (AC-UI-6, asserted by test/quality/component-boundary.test.ts).",
      },
      {
        h: "components/tasks/",
        p: "Domain components. Every control they render is imported from components/ui (AC-UI-5). The library stays a library, not a folder.",
      },
      {
        h: "What flips it",
        p: "A second consumer: a storefront, an internal admin, a design-system package. Then components/ui becomes packages/ui with a move and an import-path change.",
      },
      {
        h: "Why it matters at Aritzia",
        p: "A fashion retailer's identity is the product. A component layer you own and theme through tokens serves that; a library whose defaults you spend the sprint overriding does not.",
      },
    ],
    minutes: 0.75,
    notes:
      "Naming the seam and declining to cut it is the decision. Respecting the boundary costs nothing today; adding Turborepo would be build orchestration in service of one consumer, which is exactly the over-engineering the top risk names.",
  },
  {
    layout: "table",
    section: "The spine",
    title: "Each requirement is the miniature of a problem Aritzia already has",
    lead: "Every architectural decision is defended twice: once for this app, once for the checkout flow it generalises to.",
    columns: ["This app", "The Aritzia analogue"],
    rows: [
      [
        "Optimistic add and delete with rollback",
        "Cart mutation: instant feedback, reconcile or revert",
      ],
      [
        "429 + Retry-After handling with full jitter",
        "Third-party inventory, tax, payment, or ESP calls under a product drop",
      ],
      [
        "Filter by All / Pending / Completed, held in the URL",
        "Catalog faceting: addressable, shareable, restorable",
      ],
      [
        "Private key in a Route Handler, asserted absent from the bundle",
        "Any integration credential that must never reach the browser",
      ],
      [
        "localStorage rehydration, versioned and validated",
        "Guest cart persistence across sessions and deploys",
      ],
      [
        "sessionStorage auth token",
        "Session-scoped identity that dies with the tab",
      ],
    ],
    minutes: 1,
    notes:
      "This table is PROJECT.md section 2 and it is the deck's spine. If you remember one slide, this is it. Sections 3 and 4 walk the rows that carry the most engineering.",
  },
  {
    layout: "cards",
    section: "2 · Traceability",
    title: "How the build ran: spec first, then agents, then QA",
    lead: "Three roles, one session each, and rules that make the cost measurable afterwards.",
    cards: [
      {
        h: "Architect",
        p: "Owns PROJECT.md, ACCEPTANCE.md (79 criteria), six ADRs, TASKS.md. Writes no application code. A fresh-session critic pass found 15 contradictions before wave 0 opened.",
      },
      {
        h: "Builder",
        p: "One task per session. Never edits a spec file. A spec that cannot be built as written becomes a row in BLOCKERS.md, not a quiet decision.",
      },
      {
        h: "QA",
        p: "Independent session, no shared context. Marks a criterion met only with a named test. 72 met, 6 verified manually with procedure and date, 1 open.",
      },
      {
        h: "The three rules",
        p: "No code without a task ID. Every commit references a criterion. A criterion is not met until a test names it.",
      },
    ],
    minutes: 1.5,
    notes:
      "17 build tasks in six waves of concurrent agents, file ownership per task so three agents could write at once without merge conflicts. The roles matter because a Builder that edits the spec to match what it built destroys the only independent measure of correctness.",
  },
  {
    layout: "trace",
    section: "2 · Traceability",
    title: "One requirement, traced end to end",
    steps: [
      {
        label: "Brief, R7",
        text: '"Simulate an API call on each addition and removal … consider potential rate-limiting scenarios"',
      },
      {
        label: "Criterion",
        text: "AC-API-9 · Given a task is deleted, when the call ultimately fails, then it reappears in its previous position with an error announced",
        mono: false,
      },
      {
        label: "Test",
        text: 'test/tasks/optimistic.test.tsx › it("AC-API-9: the task disappears immediately, and when the call ultimately fails it reappears in its previous position with an error announced")',
        mono: true,
      },
      {
        label: "Commit",
        text: "6eff62e feat(tasks): T-08 optimistic create and delete with reconcile and rollback [AC-API-1..2, AC-API-7..9, AC-API-11..12, AC-ADD-8, AC-DEL-2] (#27)",
        mono: true,
      },
      {
        label: "Do it yourself",
        text: 'git grep -n "AC-API-9" -- test/ lib/ docs/ACCEPTANCE.md',
        mono: true,
      },
    ],
    minutes: 1.5,
    notes:
      "Run the grep live in the terminal. It returns the criterion, the test, the reducer action that implements the rollback and the ADR that decided it. Then open the live URL, add a task, delete it, and show the rollback under the deployed rate limit: the fixed window allows 5 requests per 10 seconds, so six quick deletes produce a visible 429 path.",
  },
  {
    layout: "diagram",
    section: "3 · The API simulation",
    title: "A real round trip, not a setTimeout",
    lead: "ADR-0004. Two server-side layers so every clause of the brief's sentence is observable and testable.",
    nodes: [
      {
        h: "Browser",
        lines: [
          "Typed client, AbortController, 10 s timeout",
          "Carries no key. Ever.",
          "Retries only on 429",
        ],
      },
      {
        h: "Route Handler",
        lines: [
          "POST /api/tasks · DELETE /api/tasks/:id",
          "Reads the private key from server env only",
          "Validates with Zod, 400 before upstream",
        ],
      },
      {
        h: "Simulated upstream",
        lines: [
          "Demands the key: 401 (constant-time compare)",
          "Fixed window 5 / 10 s: 429 + Retry-After",
          "Latency and scripted failures, injectable",
        ],
      },
    ],
    aside: [
      "The backend-for-frontend holds the credential; the upstream is the inventory, tax or payment service that demands it.",
      "Nothing persists server-side. localStorage stays the system of record, per the brief.",
    ],
    minutes: 1.5,
    notes:
      "The original ADR made the Route Handler the upstream. A critic pass found that then nothing could legitimately present the key: the browser is forbidden from holding it, so every request would be a 401 by construction. B-01, fixed in the spec before a line of code existed. That is what the critic pass is for.",
  },
  {
    layout: "cards",
    section: "3 · The API simulation",
    title: "The key never reaches the browser, and a test proves it",
    lead: "Secret hygiene that is only a convention decays. Secret hygiene with a failing test does not.",
    cards: [
      {
        h: "Never NEXT_PUBLIC_",
        p: "Read inside a Route Handler only. No client module imports it. The browser request type has no key field.",
      },
      {
        h: "AC-API-3, against build output",
        p: "test/bundle/no-secret-in-bundle.test.ts searches every client chunk in .next/ for the key's value and its variable name. It fails, never skips, without a production build.",
      },
      {
        h: "CI runs it",
        p: "typecheck → lint → test → next build → bundle test. Re-run against the deployed artifact at T-12: absent from every chunk.",
      },
      {
        h: "Checkout analogue",
        p: "Payment and inventory credentials in a bundle every shopper downloads. The only test in the suite that proves an absence is the most important one in it.",
      },
    ],
    minutes: 1,
    notes:
      "Point out that this is the one secret in the app that could actually leak, and it is handled to production standard. The sessionStorage token is the other secret, and it is handled as the brief specifies, which section 4 addresses.",
  },
  {
    layout: "chart",
    section: "3 · The API simulation",
    title: "429, Retry-After, and why full jitter is the eCommerce point",
    lead: "wait = max(Retry-After, random() × min(8 s, 500 ms × 2^(n−1))), at most 4 attempts. The server's number is a floor, never something to jitter below.",
    chart: {
      kind: "dots",
      caption:
        "Ten clients rate-limited in the same second. When does each retry?",
      series: [
        {
          label: "Backoff, no jitter",
          values: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
        {
          label: "Backoff with full jitter",
          values: [0.13, 0.31, 0.42, 0.55, 0.6, 0.71, 0.78, 0.87, 0.93, 0.98],
        },
      ],
      axis: "time until retry, as a share of the backoff ceiling",
    },
    points: [
      "Backoff without jitter reschedules a thundering herd. Every client waits the same computed interval and retries at the same instant: the retry wave has the same shape as the spike that caused it.",
      "A product drop is a synchronised spike by design. Any downstream call that rate-limits under it produces a wall of 429s, and an unjittered client turns one spike into several.",
      "Never retry a 4xx that is not 429. A 401 is a configuration error; retrying it makes the same mistake more often.",
    ],
    minutes: 1.5,
    notes:
      "lib/api/retry.ts is pure: the jitter draw is injected, so tests get an identical schedule every run (AC-API-10). Retry-After and backoff are combined with max, not added, so a server asking for a long pause does not also inherit the client's full backoff on top. Token bucket would be the production limiter; fixed window was chosen for legibility and the trade-off recorded.",
  },
  {
    layout: "cards",
    section: "3 · The API simulation",
    title: "Optimistic mutation: apply, call, reconcile or roll back",
    lead: "In the reducer, not the component. The whole lifecycle is one exhaustively typed pure function, tested with no React involved.",
    cards: [
      {
        h: "confirmed · syncing · failed",
        p: "Per-task sync state, runtime only. Never persisted: localStorage is the system of record, so a hydrated task is always confirmed.",
      },
      {
        h: "Reconcile by identity",
        p: "The client assigns id and createdAt; the server echoes both and assigns nothing. The row keeps its key and its sort position: no remount, no reorder (AC-API-8).",
      },
      {
        h: "Rollback restores position for free",
        p: "List order is derived at render (due date, then creation time), so restoring the deleted record restores its place. There is no index to get wrong (AC-API-9).",
      },
      {
        h: "Cart analogue",
        p: "Add to bag feels instant; the server reconciles or the line reverts with a reason. A rate-limit failure reads differently from a generic one (AC-API-12).",
      },
    ],
    minutes: 1,
    notes:
      "The critic pass corrected where the risk was: the plan said 'restoring the deleted task to its original index' and that is automatic; the real risk is a server-assigned id reordering the row. Contract fixed at T-01. Double-submit is guarded, in-flight state is announced in a live region, not spinner-only.",
  },
  {
    layout: "columns",
    section: "4 · Build vs buy",
    title: "Which line to be on",
    lead: "Every ADR carries a build-vs-buy section, because the recurring judgment on this project is which line to be on, not how much can be hand-rolled.",
    cols: [
      {
        h: "Bought",
        items: [
          "Next.js Route Handlers as the server boundary",
          "Radix primitives via shadcn, source owned",
          "Zod for request and persistence schemas",
          "MSW at the network layer, jest-axe for the mechanical half of a11y",
          "The platform's encrypted env for the key",
        ],
      },
      {
        h: "Built",
        items: [
          "Context + reducer with a versioned, validated persistence adapter (~120 lines)",
          "The retry loop: backoff, full jitter, bounded budget (~100 lines)",
          "A twenty-line render helper wrapping the providers",
          "A bundle test that proves an absence",
        ],
      },
      {
        h: "Declined",
        items: [
          "TanStack Query",
          "Zustand (and every full-fledged store)",
          "Turborepo",
          "Auth.js",
          "Vitest, by instruction",
          "Playwright and Storybook: P2, planned",
        ],
      },
    ],
    minutes: 1,
    notes:
      "The principle: buy anything security-critical and boring (session handling, accessible primitives, validators). Build only where the build is genuinely small and the mechanism is what is being assessed.",
  },
  {
    layout: "columns",
    section: "4 · Build vs buy",
    title: "The two deliberate declines, and what would flip each",
    lead: "Both are the tool I would reach for on a production Aritzia feature. Both lose here for reasons that are specific, not general.",
    cols: [
      {
        h: "TanStack Query",
        items: [
          "Would give optimistic updates with rollback, retry with backoff, dedup and in-flight state, most of AC-API-6..11, in configuration.",
          "Declined: the mechanism is the deliverable. Delegating it demonstrates knowing the library exists. And it owns a normalised cache, adjacent to the 'no full-fledged store' constraint.",
          "Flips at: a second consumer of the same server data, background refetch or focus revalidation, pagination. This is a two-endpoint app.",
        ],
      },
      {
        h: "Zustand",
        items: [
          "About 30 lines where Context + reducer is 120. Its persist middleware does the localStorage work correctly, hydration timing included.",
          "Declined: the brief forbids a full-fledged store, and reading a requirement precisely is part of what is assessed. Also, a reviewer asking how rollback works should read a reducer, not middleware.",
          "Flips at: high-frequency state across a large tree, state shared across many unrelated routes, or a need for devtools, time-travel, or middleware.",
        ],
      },
    ],
    minutes: 1.25,
    notes:
      "ADR-0004 and ADR-0002. The honest version: on any other project the reasoning is not close, and I would buy both. The value of writing the decline down is that the flip conditions are concrete, so the day one of them arrives the purchase is obvious rather than a debate.",
  },
  {
    layout: "table",
    section: "4 · Build vs buy",
    title: "Following the brief where I would argue with it",
    lead: "sessionStorage auth is what was asked for and not what production should do. The professional move is to do what was asked and make the limits legible, in the ADR and in the running app.",
    columns: ["Concern", "Here, per brief", "Production"],
    rows: [
      [
        "Token storage",
        "sessionStorage",
        "HttpOnly, Secure, SameSite cookie set by the server",
      ],
      [
        "Session validity",
        "Client-side presence check",
        "Server-verified session or short-lived signed token with rotation",
      ],
      [
        "Route protection",
        "Client guard in the layout, renders nothing until auth is read",
        "Middleware or per-request server check; the client guard stays for UX only",
      ],
      [
        "XSS blast radius",
        "Token readable by any script on the origin",
        "Token unreadable by script; CSP and SRI shrink the surface",
      ],
      [
        "Test runner",
        "Jest, as named",
        "Vitest would be faster with less configuration; the trade-off is recorded, not overridden",
      ],
    ],
    minutes: 1,
    notes:
      "ADR-0005. Sharp edge worth naming: middleware cannot protect these routes, because sessionStorage is never sent to the server. That is not an App Router limitation; it is the direct consequence of the storage the brief specifies, and the clearest illustration of why production auth uses an HttpOnly cookie.",
  },
  {
    layout: "stats",
    section: "5 · The ledger",
    title: "What the build actually cost",
    lead: "API-equivalent cost at published list rates, written per session by a hook from the transcript's usage objects. Not an invoice; every rate is one auditable constant.",
    stats: [
      {
        n: "$232",
        l: "26 sessions, all roles, spec to QA",
      },
      {
        n: "$70",
        l: "of that was a tooling loop in T-01, found by review, fixed in ARCH-04",
      },
      {
        n: "$65",
        l: "the ten Builder tasks that wrote the application, T-02 to T-11",
      },
      {
        n: "299",
        l: "Jest tests in 29 suites, every one naming its criterion",
      },
    ],
    foot: "Cache reads are reported separately and cost 0.025× base input on this model. Quoting a single token total would make a session look an order of magnitude larger than its economics.",
    minutes: 1,
    notes:
      "docs/LEDGER.md, one row per session, hand-editing of measured columns refused by the script. The T-01 loop is the interesting number: a Stop hook rewrote the ledger row every turn, each push redeployed and re-ran CI, each event woke the session. 75 chore commits between 20:02 and 02:49. The review caught it, the hook moved to SessionEnd, and the next ten tasks averaged under seven dollars.",
  },
  {
    layout: "chart",
    section: "5 · The ledger",
    title: "Cost per Builder task, in the order they ran",
    lead: "Once the loop was fixed, cost tracked task size and little else. The join-point task (T-08, optimistic mutations, the riskiest in the plan) cost $7.82.",
    chart: {
      kind: "bars",
      unit: "$",
      values: [
        {
          label: "T-01*",
          value: 14.7,
          note: "scaffold, excluding the $70 loop",
        },
        {
          label: "T-02",
          value: 11.33,
        },
        {
          label: "T-03",
          value: 8.32,
        },
        {
          label: "T-06",
          value: 7.06,
        },
        {
          label: "T-04",
          value: 5.93,
        },
        {
          label: "T-07",
          value: 3.27,
        },
        {
          label: "T-05",
          value: 6.02,
        },
        {
          label: "T-08",
          value: 7.82,
        },
        {
          label: "T-09",
          value: 6.61,
        },
        {
          label: "T-10",
          value: 5.19,
        },
        {
          label: "T-11",
          value: 3.71,
        },
      ],
    },
    points: [],
    minutes: 1,
    notes:
      "T-02 is the most expensive real task and it is the auth provider plus route guards, 49 tests. T-07, the retry client, is the cheapest at $3.27 and it is the most talked-about code in this deck. Specification quality, not problem difficulty, is what the cost tracks.",
  },
  {
    layout: "cards",
    section: "5 · The ledger",
    title: "What the intervention ratio says, and why it is honestly empty",
    lead: "The ledger has an accepted / edited / rejected column per session. Every Builder row reads '-'. That was a decision, not an omission.",
    cards: [
      {
        h: "Why empty",
        p: "Counting needs a review pass the operator was not doing: two early PRs merged three minutes after opening with no diff read. A script could have written 1/0/0 on every merged PR and presented a mechanical fact as a quality signal.",
      },
      {
        h: "The real signal: blockers",
        p: "24 rows in BLOCKERS.md. 15 found by a critic pass before any code, 5 raised by Builders that hit a spec gap mid-build, 1 by QA. Each is a place the spec was wrong, resolved by the Architect in its own commit.",
      },
      {
        h: "What that says about the spec",
        p: "Builders stopped instead of guessing five times in seventeen tasks. Two were file-ownership gaps, one a missing criterion, one a contract nobody mounted, one a touch-target outside a lane. All cheap to fix because they were named.",
      },
      {
        h: "Independent QA",
        p: "T-13 ran in a fresh session with no Builder context and walked all 79 criteria: 72 met with a named test, 6 verified manually, 1 open (the real-phone walk, which needs a phone).",
      },
    ],
    minutes: 1,
    notes:
      "A populated column that measures nothing is worse evidence than an empty one that says why. If asked what I would change: run one wave with the diff actually read, count, and fill the column for those rows. The instrument exists; the operator time did not, and the ledger says so.",
  },
  {
    layout: "columns",
    section: "6 · What I would do next",
    title: "Already reasoned, in priority order",
    lead: "P2 exists so that this question has a concrete answer rather than a shrug.",
    cols: [
      {
        h: "Next week",
        items: [
          "Playwright smoke for AC-DEP-1, the one open criterion: the full path on a real phone viewport against the deployed URL.",
          "Storybook on the owned component layer. Genuine value at a design-system-led brand; it presents components rather than shipping the app, which is why it waited.",
          "Undo instead of immediate delete (AM-7). The better pattern, named as out of scope rather than omitted silently.",
        ],
      },
      {
        h: "When the flip conditions arrive",
        items: [
          "Token bucket in shared storage (Redis) or at the edge. The in-memory fixed window resets on cold start; stated plainly, not hidden.",
          "HttpOnly cookie sessions with server-side revocation, the moment anything real sits behind the guard.",
          "TanStack Query at the second consumer of server data. packages/ui at the second app. Both seams are already tested.",
        ],
      },
    ],
    minutes: 1,
    notes:
      "Everything on the right is a flip condition already written in an ADR. The left column is the P2 list from PROJECT.md section 7, in order.",
  },
  {
    layout: "close",
    section: "",
    title: "Every claim here is a grep away",
    lines: [
      "Live: aritzia-task-management.vercel.app",
      "Repo: github.com/Justinohallo/aritzia-task-management",
      "docs/ACCEPTANCE.md · docs/adr/ · docs/LEDGER.md · docs/BLOCKERS.md",
    ],
    minutes: 0.5,
    notes:
      "Invite the grep. Suggested first question to volunteer if none comes: 'What went wrong?' Answer: the T-01 ledger loop and B-01, both caught by review, both recorded.",
  },
];
