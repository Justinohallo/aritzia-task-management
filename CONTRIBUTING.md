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
claude/<slug>-<suffix>     assigned by Claude Code on the web; cannot be renamed
```

Attribution does not depend on the branch name: the ledger row and the pull
request title carry the task and criterion IDs.

## Pull requests

1. Branch off the latest `main`.
2. Keep the PR scoped to one thing. A PR that does two unrelated things
   is two PRs.
3. Fill out the PR template — particularly how you verified the change.
4. All required status checks must pass.
5. The PR title is the squash-merge subject on `main`, so it carries the
   task ID and the acceptance criteria the PR satisfies:
   `feat(tasks): T-05 list, filter, complete, delete [AC-LIST-1..4, AC-FILT-1..6]`.
   See `CLAUDE.md` rule 3.
6. Required approvals are `0` while this repository has one maintainer —
   GitHub will not let an author approve their own pull request, so a
   requirement of `1` would block every merge
   (see [`docs/REPO-PROTECTIONS.md`](docs/REPO-PROTECTIONS.md)). Review is
   the author reading the diff against its criteria before merging. The
   moment a second person joins, this becomes one approving review.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tasks): optimistic delete with rollback [AC-DEL-1, AC-API-9]
fix(api): honour Retry-After before the first retry [AC-API-6]
chore: bump actions/checkout to v7
docs: amend ADR-0004 with the key-holder decision
```

A commit that touches application code names the acceptance criteria it
satisfies, in brackets at the end; `chore:` and `docs:` commits are exempt.
`CLAUDE.md` rule 3 is the full statement. This keeps history readable and
lets a reviewer trace any line of the brief to the commit that met it.

## Merging

Squash and merge. One commit on `main` per pull request, with the PR
title as the commit subject. Branches are deleted automatically after
merge.

## Never commit

- `.env` files or any real credentials
- Files over 5 MB (use Git LFS or external storage)
- Generated build output (`dist/`, `.next/`, `build/`)

See [SECURITY.md](SECURITY.md) if a secret is ever committed by accident.
