#!/usr/bin/env python3
"""start.py - claim a task from docs/TASKS.md and load its spec context.

    python3 .claude/skills/task-start/start.py T-04
    python3 .claude/skills/task-start/start.py T-04 AC-ADD-1,AC-ADD-2
    python3 .claude/skills/task-start/start.py --dry-run T-04
    python3 .claude/skills/task-start/start.py --dry-run all

Validates first, claims second. Nothing is written to .current-task unless
every check below passes, so a failed run leaves the session exactly as it
found it:

  0. docs/ passes scripts/spec-lint.py (T-16: the spec checks itself)
  1. no other task is already claimed (CLAUDE.md rule 2)
  2. the task exists in docs/TASKS.md, in the Sequence table and Task detail
  3. every task in every earlier wave has a closed row in docs/LEDGER.md, and
     so does every task this one's own "Depends on" cell names
  4. every criterion the task names exists in docs/ACCEPTANCE.md
  5. every ADR the task's detail references exists

Check 3 is deliberately wider than the task's own "Depends on" cell. TASKS.md
rule 2 for concurrent agents is that a wave does not start until the previous
wave is merged and main is green; with three agents running at once, a
per-task dependency check would let an agent start against a half-built wave
and not notice until two waves later. The cell still holds inside a wave:
wave 5 is a chain, and T-12 does not open until T-11 is closed (B-14).

--dry-run <ID> runs every check and prints the same summary without claiming.
Check 1 is reported rather than enforced, since a dry run claims nothing.

--dry-run all walks every task in the plan, in wave order, against a
simulated ledger that starts empty and closes each task the moment it opens.
It fails on any task that could never open: a dependency in a later wave
(the pre-ARCH-03 T-14 deadlock, B-03), a dependency the table does not list,
a cycle inside a wave, a missing detail section, or a criterion or ADR that
does not resolve. T-00 validated the gate by closing T-00 itself, the one
input that could not trip it; this is the input that can.

Stdlib only, to match scripts/ledger.py and scripts/task.sh.
"""
import os
import re
import subprocess
import sys

TASKS_REL = "docs/TASKS.md"
ACCEPTANCE_REL = "docs/ACCEPTANCE.md"
LEDGER_REL = "docs/LEDGER.md"
BLOCKERS_REL = "docs/BLOCKERS.md"
SPEC_LINT_REL = "scripts/spec-lint.py"
LEDGER_TABLE_MARKER = "| date | session_id |"

TASK_ID_RE = re.compile(r"\bT-\d+\b")
CRITERION_RE = re.compile(r"\bAC-([A-Z0-9]+)-(\d+)(?:\.\.(\d+))?\b")
ADR_RE = re.compile(r"adr/(\d{4}-[a-z0-9-]+\.md)")
BACKTICKED_RE = re.compile(r"`([^`]+)`")


class StartError(Exception):
    """Anything that must stop the run loudly rather than claim a task."""


def repo_root(start):
    try:
        out = subprocess.run(
            ["git", "-C", start, "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return out or start
    except (OSError, subprocess.CalledProcessError):
        return start


def read(path):
    if not os.path.exists(path):
        raise StartError("%s does not exist" % path)
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def normalise_task_id(raw):
    tid = raw.strip().upper()
    if not re.fullmatch(r"[A-Z]+-\d+", tid):
        raise StartError(
            "%r is not a task id. Expected something like T-04." % raw
        )
    return tid


def task_number(tid):
    m = re.search(r"\d+", tid)
    return int(m.group(0)) if m else 0


# ---------------------------------------------------------------------------
# TASKS.md
# ---------------------------------------------------------------------------

def sequence_table(tasks_md):
    """Every row of the Sequence table, keyed by column header.

    Columns are read by name, never by position. The table has grown a column
    before (Wave, between Est. and Depends on) and positional access failed
    open: the dependency gate silently found no dependencies and let every
    task start.
    """
    lines = tasks_md.split("\n")
    header_i = next(
        (i for i, l in enumerate(lines)
         if l.startswith("| #") and "Task" in l and "Depends on" in l),
        None,
    )
    if header_i is None:
        raise StartError(
            "no Sequence table in %s: expected a header row containing '#', "
            "'Task' and 'Depends on'." % TASKS_REL
        )
    columns = [c.strip() for c in lines[header_i].strip().strip("|").split("|")]

    rows = {}
    for line in lines[header_i + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != len(columns):
            continue
        row = dict(zip(columns, cells))
        tid = row["#"].replace("*", "").strip()
        if re.fullmatch(r"[A-Z]+-\d+", tid):
            rows[tid] = row
    if not rows:
        raise StartError("the Sequence table in %s has no task rows" % TASKS_REL)
    return rows


def wave_of(row):
    """The Wave cell as a sortable number, or None if the plan has no waves.

    '4-5' (a task spanning two waves) sorts as the wave it starts in.
    """
    cell = row.get("Wave")
    if cell is None:
        return None
    m = re.search(r"\d+", cell.replace("*", ""))
    return int(m.group(0)) if m else None


def detail_section(tasks_md, task_id):
    """The task's ### block, from its heading to the next heading or rule."""
    lines = tasks_md.split("\n")
    start = None
    for i, line in enumerate(lines):
        if line.startswith("### "):
            heading_id = line[4:].split("·")[0].strip()
            if heading_id == task_id:
                start = i
                break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("### ") or lines[j].startswith("## ") or lines[j] == "---":
            end = j
            break
    return "\n".join(lines[start:end]).rstrip()


def done_when(section):
    """The **Done when:** paragraph, or None."""
    lines = section.split("\n")
    for i, line in enumerate(lines):
        if line.startswith("**Done when:**"):
            block = [line]
            for nxt in lines[i + 1:]:
                if not nxt.strip():
                    break
                block.append(nxt)
            return " ".join(x.strip() for x in block)
    return None


def expand_criteria(cell):
    """'`AC-ADD-1..3`, `AC-DEL-1`' -> ['AC-ADD-1', 'AC-ADD-2', 'AC-ADD-3', 'AC-DEL-1'].

    Ranges are inclusive. Order is preserved, duplicates dropped.
    """
    out = []
    for prefix, lo, hi in CRITERION_RE.findall(cell or ""):
        low, high = int(lo), int(hi) if hi else int(lo)
        if high < low:
            raise StartError(
                "criteria range AC-%s-%s..%s counts backwards" % (prefix, lo, hi)
            )
        for n in range(low, high + 1):
            cid = "AC-%s-%d" % (prefix, n)
            if cid not in out:
                out.append(cid)
    return out


def dependencies(row):
    """Task ids in the 'Depends on' cell of a sequence row."""
    return TASK_ID_RE.findall(row.get("Depends on", ""))


def ownership_row(tasks_md, task_id):
    """The task's row in the File ownership table, or None if there is no table."""
    lines = tasks_md.split("\n")
    header_i = next(
        (i for i, l in enumerate(lines)
         if l.startswith("| Task") and "Writes" in l),
        None,
    )
    if header_i is None:
        return None
    columns = [c.strip() for c in lines[header_i].strip().strip("|").split("|")]
    for line in lines[header_i + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != len(columns):
            continue
        row = dict(zip(columns, cells))
        if row["Task"].replace("*", "").strip() == task_id:
            return row
    return None


# ---------------------------------------------------------------------------
# ACCEPTANCE.md
# ---------------------------------------------------------------------------

def acceptance_index(acceptance_md):
    """{criterion id: (title, gherkin block)} for every #### heading."""
    index = {}
    lines = acceptance_md.split("\n")
    for i, line in enumerate(lines):
        if not line.startswith("#### "):
            continue
        head = line[5:].strip()
        m = re.match(r"(AC-[A-Z0-9]+-\d+)\s*(?:—|-)?\s*(.*)", head)
        if not m:
            continue
        cid, title = m.group(1), m.group(2).strip()
        block, inside = [], False
        for nxt in lines[i + 1:]:
            if nxt.startswith("```"):
                if inside:
                    break
                inside = True
                continue
            if inside:
                block.append(nxt)
            elif nxt.startswith("#"):
                break
        index[cid] = (title, "\n".join(block).rstrip())
    return index


# ---------------------------------------------------------------------------
# LEDGER.md
# ---------------------------------------------------------------------------

def parse_blocker_rows(blockers_md):
    """Log table rows from BLOCKERS.md, keyed by column header."""
    lines = blockers_md.split("\n")
    header_i = next(
        (i for i, l in enumerate(lines)
         if l.startswith("| ID") and "Resolution" in l),
        None,
    )
    if header_i is None:
        return []
    columns = [c.strip() for c in lines[header_i].strip().strip("|").split("|")]
    rows = []
    for line in lines[header_i + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != len(columns):
            continue
        rows.append(dict(zip(columns, cells)))
    return rows


def open_blockers(blockers_md):
    """Rows whose Resolution cell is exactly `open` (case-insensitive)."""
    return [
        r for r in parse_blocker_rows(blockers_md)
        if (r.get("Resolution") or "").strip().lower() == "open"
    ]


def blocker_blob(row):
    return " ".join(row.get(k) or "" for k in
                    ("ID", "Raised by", "Finding", "Resolution", "Commit"))


def blocker_rank(row, task_id, owned_paths):
    """0 = names this task, 1 = names a path this task owns, 2 = other."""
    blob = blocker_blob(row)
    if task_id and task_id in blob:
        return 0
    for path in owned_paths:
        if path and path in blob:
            return 1
    return 2


def prioritise_blockers(rows, task_id, owned_paths):
    return sorted(
        rows,
        key=lambda r: (blocker_rank(r, task_id, owned_paths), r.get("ID") or ""),
    )


def format_open_blockers(rows, task_id, owned_paths):
    """A warning block, or None when there is nothing to print."""
    if not rows:
        return None
    ranked = prioritise_blockers(rows, task_id, owned_paths)
    lines = [
        "OPEN BLOCKERS (%s) — warning, not a refusal" % BLOCKERS_REL,
        "A wave that opens over an open row builds on a spec someone has",
        "already said is wrong. Resolve them in an Architect session before",
        "the next wave. task-start does not refuse.",
        "",
    ]
    for row in ranked:
        bid = row.get("ID") or "?"
        raised = row.get("Raised by") or ""
        finding = row.get("Finding") or ""
        finding_one = finding.split(".")[0].strip()
        why = []
        blob = blocker_blob(row)
        if task_id and task_id in blob:
            why.append("names %s" % task_id)
        elif any(p and p in blob for p in owned_paths):
            why.append("names a path this task owns")
        tag = "  [%s]" % "; ".join(why) if why else ""
        lines.append("  %-6s %s — %s%s" % (bid, raised, finding_one, tag))
    return "\n".join(lines)


def closed_tasks(ledger_md):
    """{task_id: qa_result} for every ledger row whose qa_result is not '-'."""
    lines = ledger_md.split("\n")
    header_i = next(
        (i for i, l in enumerate(lines) if l.startswith(LEDGER_TABLE_MARKER)), None
    )
    if header_i is None:
        raise StartError(
            "no ledger table header in %s; cannot check dependencies" % LEDGER_REL
        )
    columns = [c.strip() for c in lines[header_i].strip().strip("|").split("|")]
    try:
        task_col, qa_col = columns.index("task_id"), columns.index("qa_result")
    except ValueError:
        raise StartError("ledger table is missing a task_id or qa_result column")

    closed = {}
    for line in lines[header_i + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != len(columns):
            continue
        if cells[qa_col] and cells[qa_col] != "-":
            closed[cells[task_col]] = cells[qa_col]
    return closed


# ---------------------------------------------------------------------------
# Check 0: the spec checks itself
# ---------------------------------------------------------------------------

def spec_lint(root):
    """Run scripts/spec-lint.py. Returns a one-line status; raises on findings."""
    script = os.path.join(root, SPEC_LINT_REL)
    if not os.path.exists(script):
        return "%s not present; skipped" % SPEC_LINT_REL
    proc = subprocess.run(
        [sys.executable, script, "--quiet", "--root", root],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise StartError(
            "%s failed on docs/, so the spec contradicts itself and nothing "
            "should be built against it until the Architect resolves the "
            "finding (docs/BLOCKERS.md):\n%s"
            % (SPEC_LINT_REL, (proc.stdout + proc.stderr).rstrip())
        )
    return "docs/ passes %s" % SPEC_LINT_REL


# ---------------------------------------------------------------------------
# The gate, and the rest of the per-task validation
# ---------------------------------------------------------------------------

class Plan:
    """docs/TASKS.md and docs/ACCEPTANCE.md, parsed once."""

    def __init__(self, root):
        self.root = root
        self.tasks_md = read(os.path.join(root, TASKS_REL))
        self.acceptance_md = read(os.path.join(root, ACCEPTANCE_REL))
        self.rows = sequence_table(self.tasks_md)
        self.index = acceptance_index(self.acceptance_md)
        self.waved = any(wave_of(r) is not None for r in self.rows.values())


class Summary:
    """Everything the printed summary needs, plus the problems found."""

    def __init__(self, task_id):
        self.task_id = task_id
        self.problems = []


def gate(plan, task_id, closed):
    """Who must be closed before task_id opens, and who is not.

    Returns (blocked_wave, blocked_deps, concurrent, followers):
      blocked_wave  earlier-wave tasks with no closed ledger row
      blocked_deps  tasks in this task's own Depends on cell with no closed row
                    (inside the wave, or in a plan without waves)
      concurrent    same-wave tasks with no dependency either way
      followers     same-wave tasks that depend on this one
    """
    row = plan.rows[task_id]
    wave = wave_of(row)
    deps = dependencies(row)
    blocked_wave, concurrent, followers = [], [], []
    if wave is None:
        blocked_deps = [d for d in deps if d not in closed]
    else:
        for tid, other in plan.rows.items():
            if tid == task_id:
                continue
            w = wave_of(other)
            if w is None:
                continue
            if w < wave and tid not in closed:
                blocked_wave.append(tid)
            elif w == wave and tid not in deps:
                (followers if task_id in dependencies(other) else concurrent).append(tid)
        blocked_deps = [d for d in deps if d not in closed and d not in blocked_wave]
    key = task_number
    return (sorted(blocked_wave, key=key), blocked_deps,
            sorted(concurrent, key=key), sorted(followers, key=key))


def validate(plan, task_id, closed, supplied_criteria_arg=None, gate_checks=True):
    """Checks 2-5 for one task. Problems are collected, not raised, so a
    plan-wide dry run can report every defect at once. The plan-wide walk
    does its own gate (check 3) against the simulated ledger and passes
    gate_checks=False so a defect is reported once."""
    s = Summary(task_id)
    if task_id not in plan.rows:
        s.problems.append(
            "%s is not in the Sequence table of %s. If it is a new task, the "
            "Architect adds it there first." % (task_id, TASKS_REL))
        return s
    row = plan.rows[task_id]
    s.row = row
    s.name = row.get("Task", task_id)
    s.criteria_cell = row.get("Criteria", "")
    s.estimate = row.get("Est.", "-")
    s.wave = wave_of(row)
    s.deps = dependencies(row)
    s.section = detail_section(plan.tasks_md, task_id)
    if s.section is None:
        s.problems.append(
            "%s has a row in the Sequence table of %s but no ### section under "
            "Task detail. The spec is incomplete; stop and report it."
            % (task_id, TASKS_REL))

    # (3) the gate.
    s.dep_status = [
        "%s  %s" % (d, "closed (qa: %s)" % closed[d] if d in closed else "NOT CLOSED")
        for d in s.deps
    ] or ["—"]
    s.blocked_wave, s.blocked_deps, s.concurrent, s.followers = gate(plan, task_id, closed)
    unknown = [d for d in s.deps if d not in plan.rows]
    if not gate_checks:
        unknown, blocked_deps = [], []
        s.blocked_wave = []
    if unknown:
        s.problems.append(
            "%s depends on %s, which the Sequence table of %s does not list."
            % (task_id, ", ".join(unknown), TASKS_REL))
    if s.blocked_wave:
        s.problems.append(
            "%s is in wave %s, and %s %s not closed in %s (no row whose qa_result "
            "is set).\nA wave does not start until the previous wave is merged and "
            "main is green (TASKS.md,\nRules for concurrent agents #2) - otherwise "
            "agents in this wave build against\ndifferent versions of the same "
            "contract.\nClose them first, or have the Architect move %s in %s."
            % (task_id, s.wave, ", ".join(s.blocked_wave),
               "is" if len(s.blocked_wave) == 1 else "are", LEDGER_REL,
               task_id, TASKS_REL))
    if gate_checks:
        blocked_deps = [d for d in s.blocked_deps if d not in unknown]
    if blocked_deps:
        if s.wave is None:
            s.problems.append(
                "%s depends on %s, which has no closed row in %s (a row whose "
                "qa_result is not '-').\nFinish and close the dependency first, or "
                "have the Architect change the order in %s."
                % (task_id, ", ".join(blocked_deps), LEDGER_REL, TASKS_REL))
        else:
            later = [d for d in blocked_deps
                     if (wave_of(plan.rows[d]) or 0) > s.wave]
            same = [d for d in blocked_deps if d not in later]
            if same:
                s.problems.append(
                    "%s depends on %s, in the same wave, and %s not closed in %s "
                    "(no row whose qa_result is set).\nInside a wave the Depends "
                    "on cell still holds (TASKS.md, Rules for concurrent agents "
                    "#2): wave 5 is a chain, and T-12 does not open until T-11 is "
                    "closed. Close %s first."
                    % (task_id, ", ".join(same),
                       "it is" if len(same) == 1 else "they are", LEDGER_REL,
                       ", ".join(same)))
            if later:
                s.problems.append(
                    "%s is in wave %s but depends on %s, in a later wave. It can "
                    "never open: the wave gate holds the later task until this "
                    "wave is closed, and this task cannot close until the later "
                    "one has (the B-03 deadlock). The Architect moves one of them "
                    "in %s."
                    % (task_id, s.wave,
                       ", ".join("%s (wave %s)" % (d, wave_of(plan.rows[d]))
                                 for d in later),
                       TASKS_REL))

    # (4) every criterion must exist in ACCEPTANCE.md.
    s.criteria = expand_criteria(s.criteria_cell)
    missing = [c for c in s.criteria if c not in plan.index]
    if missing:
        s.problems.append(
            "%s names %s in %s, which %s does not define. The spec contradicts "
            "itself; stop and report it as a blocker."
            % (task_id, ", ".join(missing), TASKS_REL, ACCEPTANCE_REL))

    s.supplied = expand_criteria(supplied_criteria_arg) if supplied_criteria_arg else []
    unknown_supplied = [c for c in s.supplied if c not in plan.index]
    if unknown_supplied:
        s.problems.append(
            "%s is not defined in %s." % (", ".join(unknown_supplied), ACCEPTANCE_REL))
    s.outside = [c for c in s.supplied if c not in s.criteria]

    # (5) ADRs referenced by the task's section.
    s.adrs = []
    for m in ADR_RE.findall(s.section or ""):
        path = "docs/adr/%s" % m
        if path not in s.adrs:
            s.adrs.append(path)
    for path in s.adrs:
        if not os.path.exists(os.path.join(plan.root, path)):
            s.problems.append("%s references %s, which does not exist." % (task_id, path))

    s.own = ownership_row(plan.tasks_md, task_id)
    return s


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def branch_hint(task_id, name):
    """feat/t-05-list, per TASKS.md rule 1 for concurrent agents."""
    slug = re.sub(r"[^a-z0-9]+", "-", re.sub(r"[`*]", "", name).lower()).strip("-")
    first = slug.split("-")[0] if slug else "task"
    kind = "chore" if "tooling" in name.lower() or task_id == "T-00" else "feat"
    return "%s/%s-%s" % (kind, task_id.lower(), first)


def print_summary(plan, s, supplied_criteria_arg, dry_run, notes):
    out = sys.stdout
    w = out.write
    task_id = s.task_id
    w("\n")
    w("=" * 72 + "\n")
    w("  %s · %s%s\n" % (task_id, re.sub(r"\*\*", "", s.name),
                          "   [DRY RUN — nothing claimed]" if dry_run else ""))
    w("=" * 72 + "\n\n")
    for note in notes:
        w("  %s\n" % note)
    if notes:
        w("\n")
    w("  estimate    %s\n" % s.estimate)
    w("  criteria    %d (%s)\n" % (len(s.criteria), s.criteria_cell or "—"))
    w("  depends on  %s\n" % "; ".join(s.dep_status))
    if s.wave is not None:
        parallel = []
        if s.concurrent:
            parallel.append("running concurrently with %s" % ", ".join(s.concurrent))
        if s.followers:
            parallel.append("%s wait%s for this task to close"
                            % (", ".join(s.followers),
                               "s" if len(s.followers) == 1 else ""))
        w("  wave        %s  — %s\n" % (s.wave, "; ".join(parallel) or "solo"))
        w("  branch      %s  (off the latest main, never off another agent)\n"
          % branch_hint(task_id, s.name))
    if supplied_criteria_arg:
        w("  claimed as  %s\n" % supplied_criteria_arg)
        if s.outside:
            w("  note        %s is not in this task's criteria in %s\n"
              % (", ".join(s.outside), TASKS_REL))
    w("\n")

    dw = done_when(s.section)
    w("  DONE WHEN\n")
    w("  %s\n\n" % (dw or "not stated in %s — the task has no exit condition." % TASKS_REL))

    if s.own is not None:
        w("  FILES THIS TASK OWNS (one writer per path, per wave)\n")
        w("  writes  %s\n" % (s.own.get("Writes") or "—"))
        reads = s.own.get("Reads (never writes)") or s.own.get("Reads") or "—"
        w("  reads   %s\n" % reads)
        w("  Writing a file this task does not own is a spec gap, not a\n")
        w("  judgement call: stop and write a blocker. /task-close checks this.\n\n")
    elif s.wave is not None:
        w("  FILES THIS TASK OWNS\n")
        w("  no File ownership row for %s in %s — this task writes no\n"
          % (task_id, TASKS_REL))
        w("  application code. If it turns out to need to, that is a spec gap:\n")
        w("  ask the Architect for a row before writing, or /task-close fails.\n\n")

    w("  ADRs TO READ IN FULL BEFORE WRITING ANYTHING\n")
    if s.adrs:
        for path in s.adrs:
            w("  - %s\n" % path)
    else:
        w("  - none referenced by this task\n")
    w("\n")

    w("-" * 72 + "\n")
    w("TASK DETAIL (%s)\n" % TASKS_REL)
    w("-" * 72 + "\n")
    w(s.section + "\n\n")

    w("-" * 72 + "\n")
    w("ACCEPTANCE CRITERIA (%s)\n" % ACCEPTANCE_REL)
    w("-" * 72 + "\n")
    if not s.criteria:
        w("This task carries no acceptance criteria.\n")
    for cid in s.criteria:
        title, block = plan.index[cid]
        w("\n%s — %s\n" % (cid, title))
        for line in block.split("\n"):
            w("    %s\n" % line)
    w("\n")


# ---------------------------------------------------------------------------
# --dry-run all: the plan against a simulated ledger
# ---------------------------------------------------------------------------

def find_cycle(rows, members, start):
    """A dependency path from start back to itself through members, as a
    list of ids ending in start again, or None if start is not on a cycle."""
    stack = [(start, [start])]
    seen = set()
    while stack:
        tid, path = stack.pop()
        for d in dependencies(rows[tid]):
            if d == start:
                return path + [start]
            if d in members and d not in seen:
                seen.add(d)
                stack.append((d, path + [d]))
    return None


def dry_run_all(plan, lint_status):
    """Walk every task in wave order. Returns the number of tasks that could
    never open, after printing the walk."""
    rows = plan.rows
    groups = {}
    for tid, row in rows.items():
        groups.setdefault(wave_of(row) if plan.waved else 0, []).append(tid)
    unwaved = groups.pop(None, [])
    for tid in unwaved:
        groups.setdefault(-1, []).append(tid)

    closed = {}
    problems = {}   # tid -> [reason]
    lines = []

    def fail(tid, reason):
        problems.setdefault(tid, []).append(reason)

    for wave in sorted(groups):
        pending = sorted(groups[wave], key=task_number)
        label = "wave %s" % wave if wave >= 0 else "no wave"
        first = True
        while pending:
            progressed = False
            for tid in list(pending):
                deps = dependencies(rows[tid])
                unknown = [d for d in deps if d not in rows]
                later = [d for d in deps if d in rows
                         and (wave_of(rows[d]) if plan.waved else 0) is not None
                         and (wave_of(rows[d]) or 0) > wave]
                waiting = [d for d in deps if d in rows and d not in closed
                           and d not in later]
                if unknown:
                    fail(tid, "depends on %s, which the Sequence table does not list"
                         % ", ".join(unknown))
                if later:
                    fail(tid, "depends on %s in a later wave: it can never open "
                         "(the B-03 deadlock)"
                         % ", ".join("%s (wave %s)" % (d, wave_of(rows[d])) for d in later))
                if unknown or later:
                    how = "NEVER OPENS"
                elif waiting:
                    continue
                else:
                    how = "opens" if not deps else "after %s" % ", ".join(deps)
                lines.append((label if first else "", tid, how))
                first = False
                closed[tid] = "simulated"
                pending.remove(tid)
                progressed = True
            if not progressed:
                # Every remaining task waits on another remaining task: either
                # it sits on a cycle, or it is downstream of one.
                for tid in pending:
                    cycle = find_cycle(rows, pending, tid)
                    if cycle:
                        fail(tid, "sits on a dependency cycle inside %s: %s"
                             % (label, " → ".join(cycle)))
                    else:
                        waits = [d for d in dependencies(rows[tid]) if d in pending]
                        fail(tid, "waits on %s, which never opens" % ", ".join(waits))
                    lines.append((label if first else "", tid, "NEVER OPENS"))
                    first = False
                    closed[tid] = "simulated"
                pending = []

    # Static validation of every task: detail section, criteria, ADRs. The
    # gate was walked above, so it is not re-checked here.
    for tid in rows:
        s = validate(plan, tid, closed, gate_checks=False)
        for p in s.problems:
            fail(tid, p.split("\n")[0])

    w = sys.stdout.write
    w("\ntask-start --dry-run all · %s\n" % TASKS_REL)
    w("  %s\n" % lint_status)
    w("  simulated ledger starts empty; each task closes the moment it opens\n\n")
    for label, tid, how in lines:
        lane = ownership_row(plan.tasks_md, tid)
        lane_txt = ((lane.get("Writes") or "—") if lane else "no ownership row")
        if len(lane_txt) > 44:
            lane_txt = lane_txt[:41] + "..."
        flag = "  !!" if tid in problems else ""
        w("  %-8s %-6s %-22s %s%s\n" % (label, tid, how, lane_txt, flag))
    w("\n")
    if problems:
        w("  %d task(s) could never open:\n" % len(problems))
        for tid in sorted(problems, key=task_number):
            for reason in problems[tid]:
                w("    %-6s %s\n" % (tid, reason))
        w("\n")
    else:
        w("  %d tasks in %d wave(s): every task can open in plan order.\n\n"
          % (len(rows), len(groups)))
    return len(problems)


# ---------------------------------------------------------------------------

def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0 if argv else 2

    dry_run, root = False, None
    positional = []
    args = list(argv)
    while args:
        a = args.pop(0)
        if a == "--dry-run":
            dry_run = True
        elif a == "--root":
            if not args:
                raise StartError("--root needs a directory")
            root = args.pop(0)
        elif a.startswith("-"):
            raise StartError("unknown option %s" % a)
        else:
            positional.append(a)
    if not positional:
        raise StartError("expected a task id: start.py [--dry-run] <TASK-ID|all> [AC-IDS]")
    if len(positional) > 2:
        raise StartError(
            "expected at most two arguments: <TASK-ID> [AC-IDS]. Got %d." % len(positional))
    root = os.path.abspath(root) if root else repo_root(os.getcwd())

    if positional[0].strip().lower() == "all":
        if not dry_run:
            raise StartError("'all' is only meaningful with --dry-run; a session claims one task.")
        lint_status = spec_lint(root)
        plan = Plan(root)
        failed = dry_run_all(plan, lint_status)
        return 1 if failed else 0

    task_id = normalise_task_id(positional[0])
    supplied_criteria_arg = positional[1] if len(positional) > 1 else None
    task_file = os.path.join(root, ".current-task")
    notes = []

    # (0) the spec checks itself.
    notes.append(spec_lint(root))

    # (1) one session, one task.
    if os.path.exists(task_file):
        with open(task_file, encoding="utf-8") as fh:
            current = fh.read().strip()
        if current and current != task_id:
            if not dry_run:
                raise StartError(
                    "this session already holds %s. CLAUDE.md rule 2 is one session to "
                    "one task, so that session totals are task totals.\n"
                    "Run /clear (or start a new session) and then /task-start %s."
                    % (current, task_id))
            notes.append("this session holds %s; a real /task-start %s would refuse "
                         "(rule 2) until /clear" % (current, task_id))

    plan = Plan(root)
    closed = closed_tasks(read(os.path.join(root, LEDGER_REL)))
    s = validate(plan, task_id, closed, supplied_criteria_arg)
    if s.problems:
        raise StartError("\n\n".join(s.problems))

    # T-17: print open blockers. Warns; does not refuse.
    blocker_block = None
    blockers_path = os.path.join(root, BLOCKERS_REL)
    owned = BACKTICKED_RE.findall((s.own or {}).get("Writes") or "")
    if os.path.exists(blockers_path):
        opened = open_blockers(read(blockers_path))
        if opened:
            notes.append("open blockers  %d (warning, not a refusal)" % len(opened))
            blocker_block = format_open_blockers(opened, task_id, owned)
        else:
            notes.append("open blockers  none")
    else:
        notes.append("open blockers  %s absent" % BLOCKERS_REL)

    if not dry_run:
        # (6) claim it. Everything above passed, so this cannot leave half a state.
        cmd = [os.path.join(root, "scripts", "task.sh"), task_id]
        if supplied_criteria_arg:
            cmd.append(supplied_criteria_arg)
        proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True)
        # Trust the file, not the exit code: what matters is that the claim landed.
        if not os.path.exists(task_file):
            raise StartError(
                "scripts/task.sh did not claim the task: %s%s"
                % (proc.stdout.strip(), proc.stderr.strip()))

    print_summary(plan, s, supplied_criteria_arg, dry_run, notes)
    if blocker_block:
        sys.stdout.write("-" * 72 + "\n")
        sys.stdout.write(blocker_block + "\n\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except StartError as exc:
        print("task-start: %s" % exc, file=sys.stderr)
        sys.exit(1)
