# aritzia-task-management

> Status: **scaffolding.** Repository guardrails are in place; the
> application stack has not been chosen yet.

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
2. Choose the application stack
3. Add the language-specific CI workflow and register it as a required
   status check
