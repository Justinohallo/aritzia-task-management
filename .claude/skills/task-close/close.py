#!/usr/bin/env python3
"""close.py - verify CLAUDE.md rules 3, 4 and 5, then write the ledger row.

    python3 .claude/skills/task-close/close.py                # checks only
    python3 .claude/skills/task-close/close.py \
        --interventions 7/3/1 --tests-added 12 --qa-result pass \
        --notes "optimistic delete; rollback ordering was the hard part"

Run with no annotation flags to see the checks and the three questions the
annotation needs. Run again with the answers to write the row.

Checks, in order. Any FAIL stops the run before the ledger is touched:

  1. a task is claimed                    (rule 1)
  2. npm typecheck / lint / test, then build and test:bundle, pass
                                          (skipped before the scaffold exists)
  3. every claimed criterion has a test naming it   (rule 5, reported not enforced)
  4. every commit touching application code names a criterion   (rule 3)
  5. every new runtime dependency has an ADR on the branch      (rule 4)
  6. every file written is one this task owns  (TASKS.md, File ownership)

Stdlib only, to match scripts/ledger.py and scripts/task.sh.
"""
import argparse
import json
import os
import re
import subprocess
import sys

LEDGER_REL = "docs/LEDGER.md"
TASKS_REL = "docs/TASKS.md"
LEDGER_TABLE_MARKER = "| date | session_id |"
BASE_REFS = ("main", "origin/main")

TEST_FILE_RE = re.compile(r"\.(test)\.(ts|tsx|js|jsx)$|\.spec\.[a-z]+$", re.I)

# Paths that are not application code. A commit touching only these is exempt
# from the criterion-ID rule (CLAUDE.md rule 3).
EXEMPT_DIRS = ("docs/", ".github/", ".claude/", "scripts/")
EXEMPT_ROOT_FILES = {
    "package.json", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock",
    "pnpm-lock.yaml", "components.json", "vercel.json", "LICENSE",
}
EXEMPT_ROOT_RE = re.compile(
    r"^(\.|.*\.md$|.*\.config\.(js|cjs|mjs|ts|mts|json)$|tsconfig.*\.json$"
    r"|jest\.setup\.[a-z]+$|next-env\.d\.ts$)"
)

CRITERION_IN_SUBJECT_RE = re.compile(r"\[\s*AC-[A-Z0-9]+-\d+")
INTERVENTIONS_RE = re.compile(r"^\d+/\d+/\d+$")
QA_RESULTS = ("pass", "fail", "partial", "n/a")


class CloseError(Exception):
    """Anything that must stop the run loudly rather than write a bad row."""


def run(cmd, cwd, check=False):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise CloseError(
            "%s failed (exit %d):\n%s" % (" ".join(cmd), proc.returncode,
                                          (proc.stderr or proc.stdout).strip())
        )
    return proc


def repo_root(start):
    proc = subprocess.run(
        ["git", "-C", start, "rev-parse", "--show-toplevel"],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise CloseError("not inside a git repository")
    return proc.stdout.strip()


def base_ref(root):
    for ref in BASE_REFS:
        if run(["git", "rev-parse", "--verify", "--quiet", ref], root).returncode == 0:
            return ref
    raise CloseError(
        "neither %s exists; cannot work out which commits belong to this branch."
        % " nor ".join(BASE_REFS)
    )


def is_app_source(path):
    if any(path.startswith(d) for d in EXEMPT_DIRS):
        return False
    if "/" not in path:
        base = os.path.basename(path)
        if base in EXEMPT_ROOT_FILES or EXEMPT_ROOT_RE.match(base):
            return False
    return True


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

# In order. build and test:bundle come after test so the AC-API-3 bundle
# search runs against a production build every close, not only in CI (B-09).
NPM_SCRIPTS = ("typecheck", "lint", "test", "build", "test:bundle")


def check_npm(root, report):
    """(b) The repo's own gates, once there is a package.json to run them from."""
    if not os.path.exists(os.path.join(root, "package.json")):
        report("SKIP", "checks", "no package.json — skipping %s" % "/".join(NPM_SCRIPTS))
        return []
    failures = []
    for script in NPM_SCRIPTS:
        proc = run(["npm", "run", script], root)
        if proc.returncode == 0:
            report("PASS", "npm run %s" % script, "")
        else:
            report("FAIL", "npm run %s" % script, "exit %d" % proc.returncode)
            tail = (proc.stdout + proc.stderr).strip().split("\n")[-15:]
            failures.append("npm run %s:\n%s" % (script, "\n".join(tail)))
    return failures


def tracked_test_files(root):
    proc = run(["git", "ls-files", "--cached", "--others", "--exclude-standard"],
               root, check=True)
    return [p for p in proc.stdout.split("\n") if p and TEST_FILE_RE.search(p)]


def check_criteria(root, criteria, report):
    """(c) Rule 5: a criterion is not met until a test names it. Reported, not enforced."""
    if not criteria:
        report("SKIP", "criteria", "no criteria claimed for this task")
        return 0, 0
    files = tracked_test_files(root)
    met = 0
    print("\n  criterion proof (rule 5)")
    for cid in criteria:
        pattern = re.compile(r"(?<![A-Za-z0-9-])%s(?![0-9])" % re.escape(cid))
        where = None
        for path in files:
            full = os.path.join(root, path)
            try:
                with open(full, encoding="utf-8", errors="replace") as fh:
                    for n, line in enumerate(fh, 1):
                        if pattern.search(line):
                            where = "%s:%d" % (path, n)
                            break
            except OSError:
                continue
            if where:
                break
        if where:
            met += 1
            print("    %-16s met   %s" % (cid, where))
        else:
            print("    %-16s part  no test names it" % cid)
    total = len(criteria)
    report("INFO", "criteria", "%d/%d met (a test names it); %d implemented-but-untested"
           % (met, total, total - met))
    return met, total


def check_commits(root, base, report):
    """(d) Rule 3: a commit touching application code names a criterion."""
    proc = run(["git", "log", "--format=%H%x00%s", "%s..HEAD" % base], root, check=True)
    offenders = []
    counted = 0
    for line in proc.stdout.split("\n"):
        if not line.strip():
            continue
        sha, subject = line.split("\0", 1)
        counted += 1
        files = run(["git", "show", "--name-only", "--format=", sha], root,
                    check=True).stdout.split("\n")
        app = [f for f in files if f.strip() and is_app_source(f.strip())]
        if app and not CRITERION_IN_SUBJECT_RE.search(subject):
            offenders.append((sha[:9], subject, app[:5]))
    if offenders:
        report("FAIL", "commits", "%d of %d touch application code without an [AC-...] id"
               % (len(offenders), counted))
        for sha, subject, app in offenders:
            print("    %s  %s" % (sha, subject))
            for f in app:
                print("        %s" % f)
        return ["%d commit(s) touch application code with no criterion id in the subject"
                % len(offenders)]
    report("PASS", "commits", "%d on this branch, all conformant" % counted)
    return []


def runtime_deps(text):
    if not text:
        return {}
    try:
        return json.loads(text).get("dependencies") or {}
    except ValueError:
        raise CloseError("package.json is not valid JSON; cannot diff dependencies")


def check_dependencies(root, base, report):
    """(e) Rule 4: an ADR before any new runtime dependency."""
    head_path = os.path.join(root, "package.json")
    head = open(head_path, encoding="utf-8").read() if os.path.exists(head_path) else ""
    proc = run(["git", "show", "%s:package.json" % base], root)
    prior = proc.stdout if proc.returncode == 0 else ""

    added = sorted(set(runtime_deps(head)) - set(runtime_deps(prior)))
    if not added:
        report("PASS", "dependencies", "no new runtime dependency on this branch")
        return []
    changed = run(["git", "diff", "--name-only", base], root, check=True).stdout
    adrs = [p for p in changed.split("\n") if p.startswith("docs/adr/")]
    if adrs:
        report("PASS", "dependencies", "%s, covered by %s"
               % (", ".join(added), ", ".join(adrs)))
        return []
    report("FAIL", "dependencies", "%s added with no ADR touched on this branch"
           % ", ".join(added))
    return ["new runtime dependency %s has no ADR. CLAUDE.md rule 4: the ADR comes "
            "first, with its build-vs-buy section." % ", ".join(added)]


# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# File ownership (TASKS.md) - one writer per path, per wave
# ---------------------------------------------------------------------------

BACKTICKED_RE = re.compile(r"`([^`]+)`")


def ownership_table(root):
    """{task_id: {'writes': [pattern], 'reads': [pattern]}} from TASKS.md.

    Returns None when the plan has no File ownership table, so an older plan
    degrades to a printed skip rather than a false accusation.
    """
    path = os.path.join(root, TASKS_REL)
    if not os.path.exists(path):
        return None
    lines = open(path, encoding="utf-8").read().split("\n")
    header_i = next((i for i, l in enumerate(lines)
                     if l.startswith("| Task") and "Writes" in l), None)
    if header_i is None:
        return None
    columns = [c.strip() for c in lines[header_i].strip().strip("|").split("|")]
    reads_col = next((c for c in columns if c.startswith("Reads")), None)

    table = {}
    for line in lines[header_i + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != len(columns):
            continue
        row = dict(zip(columns, cells))
        tid = row["Task"].replace("*", "").strip()
        writes = row.get("Writes", "")
        table[tid] = {
            # "everything" is T-01's cell; it owns the repo for the life of wave 0.
            "all": "everything" in writes.lower(),
            "writes": BACKTICKED_RE.findall(writes),
            "reads": BACKTICKED_RE.findall(row.get(reads_col, "") if reads_col else ""),
        }
    return table or None


def pattern_to_re(pattern):
    """A TASKS.md path glob as a regex. '**' crosses separators, '*' does not."""
    out, i = [], 0
    while i < len(pattern):
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif pattern[i] == "*":
            out.append("[^/]*")
            i += 1
        else:
            out.append(re.escape(pattern[i]))
            i += 1
    body = "".join(out).rstrip("/")
    # A bare directory or a stem such as `jest.config` owns what sits under it.
    alts = [r"%s(/.*)?" % body, r"%s\..*" % body]
    # TASKS.md abbreviates a run of siblings to bare filenames - T-05's cell is
    # "components/tasks/task-list.tsx, task-item.tsx, task-filters.tsx". Match a
    # wildcard-free basename anywhere, or that shorthand reads as a violation.
    if "/" not in pattern and "*" not in pattern:
        alts.append(r"(.*/)?%s" % body)
    return re.compile("^(?:%s)$" % "|".join(alts))


def check_ownership(root, base, task_id, report):
    """(6) One writer per path, per wave. This is what lets three PRs merge."""
    table = ownership_table(root)
    if table is None:
        report("SKIP", "ownership", "%s has no File ownership table" % TASKS_REL)
        return []
    lane = table.get(task_id)
    changed = [p for p in run(["git", "diff", "--name-only", base], root,
                              check=True).stdout.split("\n") if p.strip()]
    if lane is None:
        # T-12, T-13 and T-15 verify, QA and rehearse; the plan gives them no
        # lane because they write no application code. That is only a
        # defect once such a task does write some (T-16 dry run).
        app = [p for p in changed if is_app_source(p) and not TEST_FILE_RE.search(p)]
        if not app:
            report("PASS", "ownership", "%s has no File ownership row and wrote "
                   "no application code" % task_id)
            return []
        report("FAIL", "ownership", "%s has no File ownership row in %s, and wrote %d "
               "application file(s)" % (task_id, TASKS_REL, len(app)))
        for path in app:
            print("    %s" % path)
        return ["%s has no row in the File ownership table of %s, and this branch "
                "writes application code. Ask the Architect for a row before three "
                "branches collide." % (task_id, TASKS_REL)]
    if lane["all"]:
        report("PASS", "ownership", "%s owns everything for this wave" % task_id)
        return []

    owned = [pattern_to_re(x) for x in lane["writes"]]
    read_only = {x: pattern_to_re(x) for x in lane["reads"]}

    strays, frozen = [], []
    for path in changed:
        # Spec, tooling, CI and tests are not contended: every task writes tests
        # (rule 5) and appends its own ledger row.
        if not is_app_source(path) or TEST_FILE_RE.search(path):
            continue
        if any(r.match(path) for r in owned):
            continue
        hit = next((x for x, r in read_only.items() if r.match(path)), None)
        (frozen if hit else strays).append((path, hit))

    if not strays and not frozen:
        report("PASS", "ownership", "%d changed file(s), all within this task's lane"
               % len(changed))
        return []

    report("FAIL", "ownership", "%d file(s) written outside this task's lane"
           % (len(strays) + len(frozen)))
    for path, hit in frozen:
        print("    %s  — listed under Reads (never writes) as %s" % (path, hit))
    for path, _ in strays:
        print("    %s  — owned by no pattern in this task's Writes cell" % path)
    print("    this task writes: %s" % (", ".join(lane["writes"]) or "—"))

    problems = []
    if frozen:
        problems.append(
            "%s edits %s, which %s reads and does not write. A contract an agent "
            "edits mid-wave silently breaks every other agent in the wave and "
            "surfaces two waves later in someone else's tests. Stop and write a "
            "blocker for the Architect (CLAUDE.md, Roles)."
            % (task_id, ", ".join(p for p, _ in frozen), task_id))
    if strays:
        problems.append(
            "%s writes %s, which the File ownership table in %s does not give it. "
            "One writer per path per wave is what makes concurrent pull requests "
            "merge. Either the file belongs to another task, or the table has a "
            "gap - both are the Architect's to resolve."
            % (task_id, ", ".join(p for p, _ in strays), TASKS_REL))
    return problems


def latest_ledger_task(root):
    """task_id on the row `ledger.py --annotate latest` would write to."""
    path = os.path.join(root, LEDGER_REL)
    if not os.path.exists(path):
        raise CloseError("%s does not exist" % LEDGER_REL)
    lines = open(path, encoding="utf-8").read().split("\n")
    header_i = next((i for i, l in enumerate(lines)
                     if l.startswith(LEDGER_TABLE_MARKER)), None)
    if header_i is None:
        raise CloseError("no ledger table header in %s" % LEDGER_REL)
    columns = [c.strip() for c in lines[header_i].strip().strip("|").split("|")]
    last = None
    for line in lines[header_i + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == len(columns):
            last = dict(zip(columns, cells))
    if last is None:
        raise CloseError("%s has no data rows to annotate" % LEDGER_REL)
    return last["task_id"], last["session_id"]


def report_line(status, name, detail):
    print("  [%-4s] %-14s %s" % (status, name, detail))


def main(argv):
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--interventions", help="accepted/edited/rejected, e.g. 7/3/1")
    ap.add_argument("--tests-added", help="count of tests added this session")
    ap.add_argument("--qa-result", help="pass | fail | partial | n/a")
    ap.add_argument("--notes", help="free-text notes cell")
    args = ap.parse_args(argv)

    root = repo_root(os.getcwd())

    # (a) a task must be claimed.
    task_file = os.path.join(root, ".current-task")
    if not os.path.exists(task_file):
        raise CloseError(
            "no task is claimed, so this session's ledger row cannot be attributed "
            "to anything (CLAUDE.md rule 1). Run /task-start <TASK-ID> before working, "
            "or scripts/task.sh <TASK-ID> now if the work is already done."
        )
    task_id = open(task_file, encoding="utf-8").read().strip()
    if not task_id:
        raise CloseError(".current-task is empty")
    crit_file = os.path.join(root, ".current-criteria")
    raw_criteria = open(crit_file, encoding="utf-8").read().strip() if os.path.exists(crit_file) else ""
    criteria = [c.strip() for c in raw_criteria.split(",") if c.strip()]

    base = base_ref(root)
    print("\nclosing %s  (branch base: %s)\n" % (task_id, base))

    failures = []
    failures += check_npm(root, report_line)
    met, total = check_criteria(root, criteria, report_line)
    print("")
    failures += check_commits(root, base, report_line)
    failures += check_dependencies(root, base, report_line)
    failures += check_ownership(root, base, task_id, report_line)

    if failures:
        raise CloseError(
            "%d check(s) failed; the ledger row was not annotated.\n\n%s"
            % (len(failures), "\n\n".join(failures))
        )

    # (f) the three cells no transcript can report.
    supplied = [x for x in (args.interventions, args.tests_added, args.qa_result) if x]
    if not supplied and args.notes is None:
        print("\n  all checks passed. Three answers are needed to write the row:\n")
        print("    interventions   accepted/edited/rejected against proposals the")
        print("                    agent made, e.g. 7/3/1")
        print("    tests added     count of tests added this session")
        print("    qa result       pass | fail | partial | n/a\n")
        print("  Then re-run:\n")
        print("    python3 .claude/skills/task-close/close.py \\")
        print("        --interventions A/E/R --tests-added N --qa-result R \\")
        print("        --notes \"...\"\n")
        return 0

    missing = [n for n, v in (("--interventions", args.interventions),
                              ("--tests-added", args.tests_added),
                              ("--qa-result", args.qa_result)) if not v]
    if missing:
        raise CloseError(
            "annotation is partial: %s not given. A half-filled row is worse than "
            "an empty one — supply all three." % ", ".join(missing)
        )
    # "-" is a deliberate decline, not a forgotten flag: the count was
    # considered and judged not worth recording. The note should say why.
    if args.interventions != "-" and not INTERVENTIONS_RE.match(args.interventions):
        raise CloseError(
            "--interventions %r is not accepted/edited/rejected, e.g. 7/3/1. "
            "Pass '-' to record deliberately that it was not counted, and say "
            "why in --notes." % args.interventions
        )
    if args.interventions == "-" and not args.notes:
        raise CloseError(
            "--interventions '-' needs --notes saying why the count was not "
            "taken. A blank cell with no reason reads as an oversight, and a "
            "reader cannot tell it apart from one."
        )
    if not re.fullmatch(r"\d+", args.tests_added):
        raise CloseError("--tests-added %r is not a count" % args.tests_added)
    if args.qa_result not in QA_RESULTS:
        raise CloseError("--qa-result %r is not one of %s"
                         % (args.qa_result, " | ".join(QA_RESULTS)))

    # The row --annotate latest will write to must be this task's row. If the
    # hook has not written it yet, annotating would overwrite someone else's.
    latest_task, latest_session = latest_ledger_task(root)
    if latest_task != task_id:
        raise CloseError(
            "the last row in %s is %s (session %s), not %s. Annotating it would "
            "put this task's answers on another task's row.\n"
            "The Stop hook writes the row for this session; if it has not run, "
            "let the turn finish and try again. If the row exists further up the "
            "table, annotate it by session id:\n"
            "  python3 scripts/ledger.py --annotate <session-id> ..."
            % (LEDGER_REL, latest_task, latest_session, task_id)
        )

    cmd = [sys.executable, os.path.join(root, "scripts", "ledger.py"),
           "--annotate", "latest",
           "--criteria-ids", raw_criteria or "-",
           "--interventions", args.interventions,
           "--tests-added", args.tests_added,
           "--qa-result", args.qa_result]
    if args.notes:
        cmd += ["--notes", args.notes]
    proc = run(cmd, root)
    sys.stderr.write(proc.stderr)
    if proc.returncode != 0:
        raise CloseError("ledger.py --annotate failed (exit %d)" % proc.returncode)

    # (g) stage the row with the work it measures.
    run(["git", "add", LEDGER_REL], root, check=True)

    ids = ", ".join(criteria) if criteria else None
    subject = ("<type>(<scope>): <summary> [%s]" % ids) if ids else \
              "chore(<scope>): <summary>"
    print("\n  %s is staged. Suggested final commit subject:\n" % LEDGER_REL)
    print("    %s\n" % subject)
    if not ids:
        print("  This task carries no criteria, so the commit is exempt from rule 3.\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except CloseError as exc:
        print("task-close: %s" % exc, file=sys.stderr)
        sys.exit(1)
