# aritzia-task-management

> Status: **specification complete, build not started.** The stack is
> chosen and recorded in six ADRs; the build plan is in `docs/TASKS.md`
> and has been critic-reviewed (`docs/BLOCKERS.md`). Repository
> guardrails are in place.

A Next.js / TypeScript task-management application built spec-first by
AI agents, with the process instrumented so its cost and quality can be
read afterwards. It is a technical case assessment; `docs/PROJECT.md`
explains what is being assessed and why the surrounding process is the
point.

| Read | For |
|---|---|
| [`docs/PROJECT.md`](docs/PROJECT.md) | scope, the NOT list, assumptions, definition of done |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | 79 testable criteria, each traced to a line of the brief |
| [`docs/adr/`](docs/adr/) | the six decisions, each with a build-vs-buy section |
| [`docs/TASKS.md`](docs/TASKS.md) | the build plan, as six waves of concurrent agents |
| [`docs/LEDGER.md`](docs/LEDGER.md) | every session's token usage and API-equivalent cost |
| [`CLAUDE.md`](CLAUDE.md) | the operating rules for agent sessions |
| [`docs/deep-dive/`](docs/deep-dive/README.md) | the Technical Deep Dive: how each subsystem works, the concept behind it, and where to look |

## Repository setup

The engineering guardrails for this repo are split in two:

- **Committed here** — CI guard workflow, `CODEOWNERS`, PR and issue
  templates, `.gitignore`, Dependabot, security policy.
- **Configured in GitHub settings** — branch rulesets, secret scanning,
  merge rules. These cannot be committed.

**→ [`docs/REPO-PROTECTIONS.md`](docs/REPO-PROTECTIONS.md) is the
checklist for the settings half. It has not been done yet.**

## Development

Node 22 and npm. After cloning:

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit — TypeScript strict (AC-QUAL-1)
npm run lint         # ESLint; forbids explicit any and @ts-ignore (AC-QUAL-2)
npm test             # Jest + React Testing Library + MSW + jest-axe
npm run build        # production build
npm run test:bundle  # AC-API-3: searches the built client bundle for the key
```

CI runs those five in that order on every pull request
(`.github/workflows/ci.yml`, `AC-CI-1`). `test:bundle` reads the output of
`next build`, so it fails rather than skips without one, and it needs
`TASKS_API_KEY` set to *any* value for both the build and the test run so
that it has a value to search for — CI sets a dummy; locally:

```bash
TASKS_API_KEY=any-value npm run build && TASKS_API_KEY=any-value npm run test:bundle
```

The real key is never committed and never `NEXT_PUBLIC_`; it lives only in
Vercel's encrypted environment. `.env.example` lists the variables.

Shared contracts frozen at T-01 — `types/`, `lib/tasks/actions.ts`,
`lib/tasks/schema.ts`, `lib/api/config.ts`, `components/ui/**`,
`test/msw/handlers.ts` — are read by every later task and written by none.
A task that needs one changed writes a row in `docs/BLOCKERS.md`.

## Working in this repo

`main` is protected. All work lands through a pull request from a branch.
See [CONTRIBUTING.md](CONTRIBUTING.md).

The build is run by Claude Code cloud sessions, one per task. The operator's
runbook — how to start, steer, close, and merge them — is
[`docs/OPERATOR.md`](docs/OPERATOR.md).

## Security

This is a **public** repository. Never commit secrets — see
[SECURITY.md](SECURITY.md).

## Next steps

1. Complete the settings checklist in `docs/REPO-PROTECTIONS.md`
2. Open wave 0 of `docs/TASKS.md` — T-01 scaffolds the stack and adds the
   CI workflow as a required status check
