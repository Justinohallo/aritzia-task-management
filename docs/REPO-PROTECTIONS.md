# Repository Protections

Two halves make up the guardrails on this repo:

| Half | Lives in | Who applies it |
|---|---|---|
| Files — CI, CODEOWNERS, templates, ignore rules | This repository | Committed, already done |
| Settings — rulesets, secret scanning, merge rules | GitHub web UI | **You, manually** |

Settings cannot be committed. This document is the checklist for the
second half. It should take about five minutes.

---

## ⚠️ Read this first: the solo-maintainer trap

**GitHub does not let you approve your own pull request.**

If you are the only person with access and you set *Required approvals*
to `1`, you will lock yourself out of merging anything. Your own PRs will
sit unmergeable forever, and the only escape is to weaken the rule you
just set.

So while this is a one-person project:

- Set **Required approvals: `0`**
- Keep everything else on

You still get every other protection: no direct pushes to `main`, status
checks must pass, conversations must be resolved, no force pushes, no
branch deletion. What you lose is only the second pair of eyes you don't
currently have.

**The moment a second person joins the repo, change Required approvals to
`1` and enable *Require review from Code Owners*.** That is the single
most valuable protection here, and it costs nothing once there are two of
you.

---

## 1. Branch ruleset for `main`

**Settings → Rules → Rulesets → New ruleset → New branch ruleset**

**Name:** `main protection`
**Enforcement status:** `Active`

**Bypass list:** leave empty.

> Adding *Repository admin* to the bypass list is tempting and mostly
> self-defeating — you are the repository admin, so it turns every rule
> below into a suggestion. Leave it empty and let the rules apply to you
> too. If you genuinely need an emergency escape hatch, set the ruleset
> to `Disabled` for the minute you need it, then set it back.

**Target branches:** `Include default branch`

**Rules — check these on:**

| Rule | Setting | Why |
|---|---|---|
| Restrict deletions | ✅ | Nobody can delete `main` |
| Block force pushes | ✅ | History on `main` can never be rewritten |
| Require linear history | ✅ | Pairs with squash-merge; keeps history readable |
| Require a pull request before merging | ✅ | No direct pushes to `main` |
| ↳ Required approvals | **`0`** while solo, `1` once a second person joins | See the trap above |
| ↳ Dismiss stale pull request approvals when new commits are pushed | ✅ | An approval covers the code that was reviewed, not whatever lands after |
| ↳ Require review from Code Owners | ⬜ while solo → ✅ later | Meaningless with one person; essential with two |
| ↳ Require conversation resolution before merging | ✅ | Review comments can't be silently ignored |
| Require status checks to pass | ✅ | See step 2 |
| ↳ Require branches to be up to date before merging | ✅ | Prevents "green PR, broken `main`" from parallel merges |

**Leave off for now:**

- *Require signed commits* — good practice, but set up commit signing
  locally first or every commit you make will be rejected.
- *Require deployments to succeed* — no environments exist yet.
- *Require code scanning results* — enable once CodeQL is running
  (needs a language, see step 5).

---

## 2. Add the required status check

The `Repo Guard` workflow must run **once** before GitHub will offer it
in the status-check picker. So:

1. Create the ruleset above with *Require status checks* enabled but no
   checks selected yet.
2. Open any pull request — `Repo Guard` runs.
3. Return to the ruleset, and under *Require status checks to pass*
   search for and add:

   ```
   Secrets & large files
   ```

Add the language-specific checks (lint, typecheck, test, build) to this
same list once the stack is chosen.

---

## 3. Secret scanning

**Settings → Advanced Security** (or **Code security and analysis**)

| Setting | Value |
|---|---|
| Secret scanning | ✅ Enabled |
| Push protection | ✅ Enabled |

Both are **free on public repositories** and are usually on by default
for new public repos — verify rather than assume.

Push protection is the one that matters most: it blocks a recognised
credential *at push time*, before it ever reaches GitHub. Secret scanning
alone only tells you after the fact, at which point the secret is public
and must be rotated.

---

## 4. Merge and branch hygiene

**Settings → General → Pull Requests**

| Setting | Value | Why |
|---|---|---|
| Allow merge commits | ⬜ Off | Required for linear history |
| Allow squash merging | ✅ On | One clean commit per PR |
| ↳ Default commit message | `Pull request title` | Readable history |
| Allow rebase merging | ⬜ Off | Pick one strategy and stick to it |
| Automatically delete head branches | ✅ On | Stops branch clutter accumulating |
| Always suggest updating pull request branches | ✅ On | One-click sync with `main` |

---

## 5. Harden GitHub Actions

**Settings → Actions → General**

| Setting | Value | Why |
|---|---|---|
| Actions permissions | `Allow enterprise/owner actions, and select non-owner actions` | Limits which third-party actions can run |
| Workflow permissions | `Read repository contents and packages permissions` | Least privilege for the default token |
| Allow GitHub Actions to create and approve pull requests | ⬜ **Off** | Critical — otherwise a workflow can approve its own PR and walk straight through your review rule |

That last one is the most commonly missed setting on this list. Left on,
it undoes the review protection from step 1.

---

## 6. Optional: reduce surface area

**Settings → General → Features** — turn off anything unused. Wikis and
Projects are on by default; an unused wiki is one more writable surface
with no review on it.

---

## Deferred until the stack is chosen

These are real gaps, listed so they don't get forgotten:

- [ ] **CI workflow** — lint, typecheck, test, build. Add as
      `.github/workflows/ci.yml`, then add its jobs to the required
      status checks in step 2.
- [ ] **CodeQL scanning** — `.github/workflows/codeql.yml`. Free on
      public repos, needs a language to configure.
- [ ] **Dependabot for the app ecosystem** — `.github/dependabot.yml`
      currently covers GitHub Actions only. Add the `npm` / `pip` /
      whichever block once dependencies exist.
- [ ] **LICENSE** — this repo is public with no license, which means
      default copyright: all rights reserved, nobody may legally reuse
      it. That may be exactly what you want for client work. If you
      intend it to be open, add a license explicitly.

---

## Verifying it works

After completing the steps above:

```bash
git checkout main && git pull
echo "test" >> README.md
git commit -am "test: verify branch protection"
git push origin main
```

This **should be rejected**. If it succeeds, the ruleset is not active or
its target branch is wrong.
