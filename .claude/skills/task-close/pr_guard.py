#!/usr/bin/env python3
"""pr_guard.py - merge-boundary checks for Builder pull requests (T-17).

    python3 .claude/skills/task-close/pr_guard.py \
        --title "$PR_TITLE" --base "$BASE_SHA" --head "$HEAD_SHA"

Two checks, matching TASKS.md T-17:

  title   a Builder PR title is `<type>(<scope>): <TASK-ID> … [<criteria>]`.
          chore: and docs: titles are exempt from the format (CLAUDE.md
          rule 3). If any commit on the branch carries `[AC-…]`, the
          title's bracketed set must be the union of those commit
          criteria — that is how #17 lost AC-AUTH-1 and #18 lost
          AC-API-3 on main.

  ledger  a Builder PR (or any title that names a T-NN) must add a
          docs/LEDGER.md row whose task_id cell is that id. This is
          what makes /task-close unskippable.

Stdlib only. Git is used to read commit subjects and the ledger diff;
the checks themselves are pure functions so they can be unit-tested
without a repository.
"""
import argparse
import os
import re
import subprocess
import sys

CONVENTIONAL_RE = re.compile(
    r"^(?P<type>feat|fix|test|refactor|perf|ci|build|style|chore|docs)"
    r"(?:\((?P<scope>[^)]+)\))?"
    r"!?"
    r": (?P<rest>.+)$"
)
TASK_ID_RE = re.compile(r"\bT-\d+\b")
CRITERION_RE = re.compile(r"\bAC-([A-Z0-9]+)-(\d+)(?:\.\.(\d+))?\b")
BRACKET_RE = re.compile(r"\[([^\]]*)\]\s*$")
CARRIES_CRITERION_RE = re.compile(r"\[\s*AC-[A-Z0-9]+-\d+")
EXEMPT_TYPES = frozenset({"chore", "docs"})


class GuardError(Exception):
    """A check failed; the process should exit 1 after printing the reasons."""


def expand_criteria(text):
    """'AC-ADD-1..3, AC-DEL-1' -> ['AC-ADD-1', 'AC-ADD-2', 'AC-ADD-3', 'AC-DEL-1']."""
    out = []
    for prefix, lo, hi in CRITERION_RE.findall(text or ""):
        low, high = int(lo), int(hi) if hi else int(lo)
        if high < low:
            continue
        for n in range(low, high + 1):
            cid = "AC-%s-%d" % (prefix, n)
            if cid not in out:
                out.append(cid)
    return out


def criteria_in_subjects(subjects):
    """Union of AC- ids in subjects that carry a `[AC-…]` bracket."""
    union = []
    for subject in subjects:
        if not CARRIES_CRITERION_RE.search(subject or ""):
            continue
        for cid in expand_criteria(subject):
            if cid not in union:
                union.append(cid)
    return union


def parse_title(title):
    """Return (type, rest) or (None, title) when the title is not conventional."""
    m = CONVENTIONAL_RE.match((title or "").strip())
    if not m:
        return None, (title or "").strip()
    return m.group("type"), m.group("rest")


def check_title(title, subjects):
    """Reasons the PR title fails, or an empty list."""
    errors = []
    typ, rest = parse_title(title)
    if typ is None:
        return [
            "PR title is not Conventional Commits (`type(scope): summary`). "
            "Builder titles are `<type>(<scope>): <TASK-ID> … [<criteria>]`; "
            "`chore:` and `docs:` titles are exempt from the format."
        ]
    task_ids = TASK_ID_RE.findall(rest)
    bracket = BRACKET_RE.search(rest)
    title_criteria = expand_criteria(bracket.group(1)) if bracket else []
    commit_criteria = criteria_in_subjects(subjects)

    if typ not in EXEMPT_TYPES and not task_ids:
        errors.append(
            "Builder PR title must contain a task id (`T-NN`), e.g. "
            "`feat(tasks): T-05 list, filter, complete, delete [AC-LIST-1..4]`."
        )

    if commit_criteria:
        title_set, commit_set = set(title_criteria), set(commit_criteria)
        if title_set != commit_set:
            missing = sorted(commit_set - title_set)
            extra = sorted(title_set - commit_set)
            parts = [
                "PR title brackets are not the union of commit criteria "
                "(`CLAUDE.md` rule 3; ARCH-04)."
            ]
            if missing:
                parts.append("missing from the title: %s" % ", ".join(missing))
            if extra:
                parts.append("in the title but in no commit: %s" % ", ".join(extra))
            errors.append(" ".join(parts))
    return errors


def added_ledger_task_ids(diff):
    """task_id cells on markdown rows added in a unified diff of LEDGER.md."""
    ids = []
    for line in (diff or "").splitlines():
        if line.startswith("+++"):
            continue
        if not line.startswith("+"):
            continue
        body = line[1:]
        stripped = body.strip()
        if not stripped.startswith("|"):
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 3:
            continue
        tid = cells[2]
        if TASK_ID_RE.fullmatch(tid) and tid not in ids:
            ids.append(tid)
    return ids


def check_ledger(title, ledger_diff):
    """Reasons the PR fails the ledger-row job, or an empty list."""
    typ, rest = parse_title(title)
    task_ids = TASK_ID_RE.findall(rest)
    # chore:/docs: with no task id are dependabot, Architect docs, etc.
    if typ in EXEMPT_TYPES and not task_ids:
        return []
    if typ is None:
        return []
    if not task_ids:
        return [
            "Builder PR title has no task id, so a ledger row cannot be "
            "attributed to it."
        ]
    task_id = task_ids[0]
    added = added_ledger_task_ids(ledger_diff)
    if task_id not in added:
        return [
            "Builder PR does not add a `docs/LEDGER.md` row for %s. "
            "/task-close is unskippable: without the row, the session is "
            "invisible to the wave gate." % task_id
        ]
    return []


def git(args, cwd):
    proc = subprocess.run(
        ["git"] + args, cwd=cwd, capture_output=True, text=True
    )
    if proc.returncode != 0:
        raise GuardError(
            "git %s failed (exit %d):\n%s"
            % (" ".join(args), proc.returncode, (proc.stderr or proc.stdout).strip())
        )
    return proc.stdout


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--title", required=True, help="the pull request title")
    ap.add_argument("--base", help="base SHA or ref (required unless --subjects/--diff given)")
    ap.add_argument("--head", default="HEAD", help="head SHA or ref (default HEAD)")
    ap.add_argument("--check", choices=("title", "ledger", "all"), default="all")
    ap.add_argument("--subjects", help="newline-separated commit subjects (tests)")
    ap.add_argument("--diff", help="unified diff of docs/LEDGER.md (tests)")
    ap.add_argument("--cwd", default=".", help="git working directory")
    args = ap.parse_args(argv)

    cwd = os.path.abspath(args.cwd)
    if args.subjects is not None:
        subjects = [s for s in args.subjects.split("\n") if s.strip()]
    else:
        if not args.base:
            raise GuardError("--base is required unless --subjects is given")
        log = git(["log", "--format=%s", "%s..%s" % (args.base, args.head)], cwd)
        subjects = [s for s in log.splitlines() if s.strip()]

    if args.diff is not None:
        ledger_diff = args.diff
    else:
        if not args.base:
            raise GuardError("--base is required unless --diff is given")
        ledger_diff = git(
            ["diff", args.base, args.head, "--", "docs/LEDGER.md"], cwd
        )

    errors = []
    if args.check in ("title", "all"):
        errors += check_title(args.title, subjects)
    if args.check in ("ledger", "all"):
        errors += check_ledger(args.title, ledger_diff)

    if errors:
        print("pr_guard: %d check(s) failed:" % len(errors), file=sys.stderr)
        for e in errors:
            print("  - %s" % e, file=sys.stderr)
            print("::error::%s" % e, file=sys.stderr)
        return 1
    print("pr_guard: ok (%s)" % args.check)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except GuardError as exc:
        print("pr_guard: %s" % exc, file=sys.stderr)
        sys.exit(1)
