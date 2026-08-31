# Contributing

## Branching

`main` is protected and always deployable. All work happens on a branch
and lands through a pull request.

Branch naming:

```
feat/short-description     new functionality
fix/short-description      bug fix
chore/short-description    tooling, deps, config
docs/short-description     documentation only
```

## Pull requests

1. Branch off the latest `main`.
2. Keep the PR scoped to one thing. A PR that does two unrelated things
   is two PRs.
3. Fill out the PR template — particularly how you verified the change.
4. All required status checks must pass.
5. At least one approving review is required before merge.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add task assignment to project view
fix: prevent duplicate task creation on double submit
chore: bump actions/checkout to v4
docs: document local setup
```

This keeps history readable and makes automated changelogs possible later.

## Merging

Squash and merge. One commit on `main` per pull request, with the PR
title as the commit subject. Branches are deleted automatically after
merge.

## Never commit

- `.env` files or any real credentials
- Files over 5 MB (use Git LFS or external storage)
- Generated build output (`dist/`, `.next/`, `build/`)

See [SECURITY.md](SECURITY.md) if a secret is ever committed by accident.
