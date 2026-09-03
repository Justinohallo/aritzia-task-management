# 14 · CI, repository guards and secrets

> **In one paragraph.** Two workflows run on every pull request. **CI** runs
> typecheck, lint, the test suite, a production build and the bundle test,
> in that order, with a dummy API key so the bundle test has a value to
> search for. **Repo Guard** is stack-agnostic: it blocks secret-bearing file
> paths and oversized files, checks the PR title carries the task and
> criterion IDs, requires a ledger row for the task, and lints the spec. The
> one real secret, `TASKS_API_KEY`, is read in exactly one server file, never
> prefixed `NEXT_PUBLIC_`, never sent by the browser, and asserted absent from
> the client bundle by a test that fails rather than skips.

## The concept: a secret is safe when its absence is tested

Secret hygiene that is only a convention decays: someone adds a
`NEXT_PUBLIC_` variable for convenience, or imports a server module from a
client component, and nothing says no until the key is in a file every
visitor downloads. The defence is to make every step of the key's lifecycle
a *property the build checks*:

1. It is read in one place, and a test asserts that place is the only one.
2. That place is server-only, and a test asserts nothing client-side imports it.
3. The built client bundle does not contain its name or its value, and a test searches for both.
4. The repository never contains it: `.env*` files are blocked at the PR gate, and the real value lives only in the platform's encrypted environment.

Each of those is a test or a workflow step, not a rule in a document.

## The key's lifecycle

```
Vercel encrypted env ──▶ process.env.TASKS_API_KEY ──▶ lib/server/env.ts::readApiKey()
                                                            │ per request, never at build
                                                            ▼
                                  lib/server/handlers.ts ──▶ upstream.createTask(body, { apiKey })
                                                            │
                                                            ▼
                                  lib/server/upstream.ts ──▶ timingSafeEqual(presented, registered)
```

| Step | Mechanism | Proven by |
|---|---|---|
| Never committed | `.gitignore` excludes `.env*`; Repo Guard fails a PR that adds a `.env`, `.pem`, `credentials.json`, … | `.github/workflows/repo-guard.yml` |
| Template only | `.env.example` carries `TASKS_API_KEY=replace-me` and the rules in comments | Repo Guard allow-lists exactly that file |
| One reader | `lib/server/env.ts` is the only source file naming `TASKS_API_KEY` | `test/api/secret-boundary.test.ts` |
| Server lane | Nothing outside `lib/server/` and `app/api/` imports `lib/server`; no `"use client"` file does | `test/api/secret-boundary.test.ts` |
| Not inlined | Read from `process.env` at request time; never `NEXT_PUBLIC_` (which Next *does* inline into the client bundle at build) | `test/api/secret-boundary.test.ts` |
| Not in the bundle | Neither the variable name nor its value appears in any file under `.next/static/` | `test/bundle/no-secret-in-bundle.test.ts` (`AC-API-3`) |
| Not from the browser | The request schema strips unknown fields and no header is read | `test/api/handlers.test.ts` |
| Compared safely | Constant-time comparison in the upstream | `lib/server/upstream.ts` |
| CI never sees the real one | The workflow sets `TASKS_API_KEY: ci-dummy-key-not-a-secret` from a literal, never from `secrets` | `test/quality/ci.test.ts` |

The `NEXT_PUBLIC_` point deserves a sentence. Next.js inlines any
environment variable with that prefix into the client bundle at build time,
by design, for public configuration. A developer who prefixes a secret to
"make it work" has published it. The source test asserts the reader never
touches a `NEXT_PUBLIC_` variable, and the bundle test would catch the value
anyway.

## The CI workflow

```yaml
# .github/workflows/ci.yml (trimmed)
on:
  pull_request:
  push: { branches: [main] }
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  checks:
    env: { TASKS_API_KEY: ci-dummy-key-not-a-secret }
    steps:
      - npm ci
      - npm run typecheck
      - npm run lint
      - npm test -- --ci
      - npm run build
      - npm run test:bundle -- --ci
```

The order is the cost order: the fastest, most-likely-to-fail checks first,
the multi-minute build last, and the bundle test after the build it reads.
`test/quality/ci.test.ts` asserts that order, that the trigger has no branch
filter, and that the key is a literal dummy (`AC-CI-1`).

Design decisions:

- **No branch filter on `pull_request`.** An earlier version filtered to
  `main`, and a PR opened before the default branch was renamed never
  triggered it. GitHub does not retroactively run workflows after a rename.
  Unfiltered survives renames and covers PRs into feature branches.
- **`push` to `main` as well.** Keeps `main`'s own status visible, which is
  the wave gate ([page 15](15-process-instrumentation.md)).
- **`permissions: contents: read`.** Least privilege for the default token.
  Neither workflow writes anything.
- **`concurrency` with `cancel-in-progress`.** A second push to the same
  branch cancels the run for the first, so CI minutes are not spent on a
  commit nobody will merge.
- **`--ci`** makes Jest refuse to write new snapshots, so a missing snapshot
  is a failure rather than silently created.

`AC-CI-2`, that the check is *required* for merge, is a GitHub setting and
cannot be committed. It is one of the seven `◉` criteria, verified from the
ruleset per [`REPO-PROTECTIONS.md`](../REPO-PROTECTIONS.md).

## Repo Guard

```yaml
# .github/workflows/repo-guard.yml (trimmed)
on: pull_request
jobs:
  guard:
    name: Secrets & large files      # the required status check
    steps:
      - collect changed files (git diff base..head)
      - fail on secret-bearing paths: .env*, .pem, .p12, id_rsa, credentials.json, service-account*.json, secrets.*  (allowing .env.example)
      - fail on any file > 5 MB
      - pr_guard.py --check title
      - pr_guard.py --check ledger
      - spec-lint.py
  pr-title:   { name: PR title }      # the same checks as separate, named jobs
  ledger-row: { name: Ledger row }    # so a failure is obvious in the checks list
  spec-lint:  { name: Spec lint }
```

Stack-agnostic on purpose: it was committed before the stack was chosen and
is safe to make a required check on day one. Two guards are about the
repository (secrets, size) and three are about the process:

**PR title** (`pr_guard.py --check title`). `main` is squash-merged with the
PR title as the commit subject, so the title is the only subject that
survives. A Builder PR must be `<type>(<scope>): <TASK-ID> … [<criteria>]`,
and the bracketed set must be the *union* of the criteria across every
commit on the branch. Two early PRs lost criteria on `main` because the
platform pre-fills the title from the first commit only; this check exists
because of them. `chore:` and `docs:` titles are exempt.

**Ledger row** (`pr_guard.py --check ledger`). A PR whose title names a
`T-NN` must add a `docs/LEDGER.md` row with that task id. This is what makes
`/task-close` unskippable: no row, no merge.

**Spec lint** (`scripts/spec-lint.py`). The spec system checks itself:
the estimate columns sum to the header totals, every `AC-` reference in
`docs/` resolves to a heading in `ACCEPTANCE.md`, every `ADR-NNNN` and every
relative `.md` link resolves to a file, the ADR count is consistent across
the documents that state it, and every criterion is assigned to exactly one
task. It runs on every PR because it is stdlib and seconds, and because a
critic pass found fifteen contradictions by hand that a one-line failure
here would have caught.

The same scripts run inside the required job *and* as separately named
jobs, so the merge button stays grey without a ruleset edit and the reason
is legible in the checks list.

## Branch protections (the settings half)

Files can be committed; GitHub settings cannot. [`REPO-PROTECTIONS.md`](../REPO-PROTECTIONS.md)
is the checklist for the settings half, and the ones that matter for the
argument on this page:

- **No direct pushes to `main`; linear history; squash-merge only.** Every
  change is a PR with a title that carries its IDs.
- **Required status checks, branches must be up to date.** Green on the
  merged result, not on a stale base. The second and third PRs of a wave
  rebase before they merge, which is what makes concurrent agents safe
  ([page 15](15-process-instrumentation.md)).
- **Required approvals: 0 while solo.** GitHub does not let you approve your
  own PR, so `1` locks a solo maintainer out. The document names this trap
  and the moment to flip it.
- **Actions cannot create or approve PRs.** Otherwise a workflow can walk
  through the review rule.
- **Secret scanning and push protection on.** Push protection blocks a
  recognised credential *at push time*, before it reaches GitHub.

## Dependencies

`.github/dependabot.yml` covers GitHub Actions weekly (actions are
executable code with repo access; a stale pin is a supply-chain exposure)
and npm weekly, grouped so a week of minor bumps is one PR. Runtime
dependencies are governed by rule 4 in `CLAUDE.md`: an ADR before the
package, and `/task-close` diffs `dependencies` against `main` and fails a
new one with no ADR. The runtime list is short by design: `next`, `react`,
`react-dom`, `zod`, `radix-ui`, `lucide-react`, `class-variance-authority`,
`clsx`, `tailwind-merge`. Every one is named in an ADR.

## What to discuss

**"Why is the bundle test the most important test in the suite?"** Because
it is the only one that proves an *absence*, and the absence it proves is
the one that would be a real incident. Everything else in this app is a
to-do list; the key is the one thing that generalises to a payment
credential. [ADR-0006](../adr/0006-test-strategy.md) calls it out for that
reason.

**"The Route Handler is open, so the key is usable by anyone."** Usable,
yes; *readable*, no. The boundary defended here is between the server and
the client bundle. Authorising the caller is a session concern, which the
brief's `sessionStorage` design cannot supply ([page 05](05-authentication.md)).
Both halves are stated; only one is in scope.

**"What would you add?"** CodeQL (free on public repos; deferred until the
stack landed, now overdue per `REPO-PROTECTIONS.md`), a Content Security
Policy header to shrink the XSS surface the ADR names, and a LICENSE
decision.

## Where to look

- Workflows: `.github/workflows/ci.yml`, `.github/workflows/repo-guard.yml`
- Guards: `.claude/skills/task-close/pr_guard.py`, `scripts/spec-lint.py`
- Key reader and boundary tests: `lib/server/env.ts`, `test/api/secret-boundary.test.ts`, `test/bundle/no-secret-in-bundle.test.ts`
- Settings checklist: [`../REPO-PROTECTIONS.md`](../REPO-PROTECTIONS.md); policy: [`../../SECURITY.md`](../../SECURITY.md)
- Template: `.env.example`; Dependabot: `.github/dependabot.yml`
