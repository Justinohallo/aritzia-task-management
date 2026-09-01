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
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | 78 testable criteria, each traced to a line of the brief |
| [`docs/adr/`](docs/adr/) | the six decisions, each with a build-vs-buy section |
| [`docs/TASKS.md`](docs/TASKS.md) | the build plan, as six waves of concurrent agents |
| [`docs/LEDGER.md`](docs/LEDGER.md) | every session's token usage and API-equivalent cost |
| [`CLAUDE.md`](CLAUDE.md) | the operating rules for agent sessions |

## Repository setup

The engineering guardrails for this repo are split in two:

- **Committed here** — CI guard workflow, `CODEOWNERS`, PR and issue
  templates, `.gitignore`, Dependabot, security policy.
- **Configured in GitHub settings** — branch rulesets, secret scanning,
  merge rules. These cannot be committed.

**→ [`docs/REPO-PROTECTIONS.md`](docs/REPO-PROTECTIONS.md) is the
checklist for the settings half. It has not been done yet.**

## Working in this repo

`main` is protected. All work lands through a pull request from a branch.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

This is a **public** repository. Never commit secrets — see
[SECURITY.md](SECURITY.md).

## Next steps

1. Complete the settings checklist in `docs/REPO-PROTECTIONS.md`
2. Open wave 0 of `docs/TASKS.md` — T-01 scaffolds the stack and adds the
   CI workflow as a required status check
