# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.** This is a
public repository — a public issue discloses the problem to everyone
before there is a fix.

Report privately through GitHub's private vulnerability reporting:

**https://github.com/Justinohallo/aritzia-task-management/security/advisories/new**

Please include:

- What the vulnerability is and where it lives
- Steps to reproduce it
- The impact you believe it has

You can expect an initial response within 5 business days.

## Supported versions

This project is pre-release. Only the current `main` branch is supported.

## Handling secrets in this repository

This is a **public** repository. Treat everything committed here as
permanently public.

- Never commit `.env` files, API keys, tokens, certificates, or
  credentials. The `Repo Guard` workflow blocks the common file patterns
  on every pull request, and GitHub secret scanning with push protection
  catches known credential formats at push time — but neither is a
  substitute for care.
- If a secret is ever committed, **rotate it immediately**. Deleting the
  file in a later commit does not remove it from git history, and it does
  not un-publish it. Assume anything pushed to a public repo has been
  scraped.
- Configuration that varies per environment belongs in `.env.example`
  with placeholder values only.
