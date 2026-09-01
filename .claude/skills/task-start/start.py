#!/usr/bin/env python3
"""start.py - claim a task from docs/TASKS.md and load its spec context.

    python3 .claude/skills/task-start/start.py T-04
    python3 .claude/skills/task-start/start.py T-04 AC-ADD-1,AC-ADD-2

Validates first, claims second. Nothing is written to .current-task unless
every check below passes, so a failed run leaves the session exactly as it
found it:

  1. no other task is already claimed (CLAUDE.md rule 2)
  2. the task exists in docs/TASKS.md
  3. every task in every earlier wave has a closed row in docs/LEDGER.md
  4. every criterion the task names exists in docs/ACCEPTANCE.md

The wave gate is deliberately wider than the task's own "Depends on" cell.
TASKS.md rule 2 for concurrent agents is that a wave does not start until the
previous wave is merged and main is green; with three agents running at once,
a per-task dependency check would let an agent start against a half-built
wave and not notice until two waves later.

Stdlib only, to match scripts/ledger.py and scripts/task.sh.
"""
import os
import re
import subprocess
import sys

TASKS_REL = "docs/TASKS.md"
ACCEPTANCE_REL = "docs/ACCEPTANCE.md"
LEDGER_REL = "docs/LEDGER.md"
LEDGER_TABLE_MARKER = "| date | session_id |"

TASK_ID_RE = re.compile(r"\bT-\d+\b")
CRITERION_RE = re.compile(r"\bAC-([A-Z0-9]+)-(\d+)(?:\.\.(\d+))?\b")
ADR_RE = re.compile(r"adr/(\d{4}-[a-z0-9-]+\.md)")


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

def branch_hint(task_id, name):
    """feat/t-05-list, per TASKS.md rule 1 for concurrent agents."""
    slug = re.sub(r"[^a-z0-9]+", "-", re.sub(r"[`*]", "", name).lower()).strip("-")
    first = slug.split("-")[0] if slug else "task"
    kind = "chore" if "tooling" in name.lower() or task_id == "T-00" else "feat"
    return "%s/%s-%s" % (kind, task_id.lower(), first)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0 if argv else 2

    task_id = normalise_task_id(argv[0])
    supplied_criteria_arg = argv[1] if len(argv) > 1 else None
    if len(argv) > 2:
        raise StartError(
            "expected at most two arguments: <TASK-ID> [AC-IDS]. Got %d." % len(argv)
        )

    root = repo_root(os.getcwd())
    task_file = os.path.join(root, ".current-task")

    # (a) one session, one task.
    if os.path.exists(task_file):
        with open(task_file, encoding="utf-8") as fh:
            current = fh.read().strip()
        if current and current != task_id:
            raise StartError(
                "this session already holds %s. CLAUDE.md rule 2 is one session to "
                "one task, so that session totals are task totals.\n"
                "Run /clear (or start a new session) and then /task-start %s."
                % (current, task_id)
            )

    tasks_md = read(os.path.join(root, TASKS_REL))
    acceptance_md = read(os.path.join(root, ACCEPTANCE_REL))
    ledger_md = read(os.path.join(root, LEDGER_REL))

    # (c) the task must exist, in both the table and the detail section.
    rows = sequence_table(tasks_md)
    if task_id not in rows:
        raise StartError(
            "%s is not in the Sequence table of %s. If it is a new task, the "
            "Architect adds it there first." % (task_id, TASKS_REL)
        )
    row = rows[task_id]
    section = detail_section(tasks_md, task_id)
    if section is None:
        raise StartError(
            "%s has a row in the Sequence table of %s but no ### section under "
            "Task detail. The spec is incomplete; stop and report it."
            % (task_id, TASKS_REL)
        )

    name = row.get("Task", task_id)
    criteria_cell = row.get("Criteria", "")
    estimate = row.get("Est.", "-")
    wave = wave_of(row)
    deps = dependencies(row)

    # (d) the gate. With waves, the unit is the wave: every task in an earlier
    # wave must be closed, not merely the ones this task happens to name.
    closed = closed_tasks(ledger_md)
    dep_status = [
        "%s  %s" % (d, "closed (qa: %s)" % closed[d] if d in closed else "NOT CLOSED")
        for d in deps
    ] or ["—"]

    concurrent, blocked = [], []
    if wave is None:
        blocked = [d for d in deps if d not in closed]
        gate = "dependency"
    else:
        gate = "wave"
        for tid, other in rows.items():
            if tid == task_id:
                continue
            w = wave_of(other)
            if w is None:
                continue
            if w < wave and tid not in closed:
                blocked.append(tid)
            elif w == wave:
                concurrent.append(tid)
        blocked.sort()
        concurrent.sort()
    if blocked:
        raise StartError(
            "%s is in wave %s, and %s %s not closed in %s (no row whose qa_result "
            "is set).\nA wave does not start until the previous wave is merged and main is green (TASKS.md,\nRules for concurrent agents #2) - otherwise agents in this wave build against\ndifferent versions of the same contract.\nClose them first, or have the Architect move "
            "%s in %s."
            % (task_id, wave if wave is not None else "?", ", ".join(blocked),
               "is" if len(blocked) == 1 else "are", LEDGER_REL, task_id, TASKS_REL)
            if gate == "wave" else
            "%s depends on %s, which has no closed row in %s (a row whose "
            "qa_result is not '-').\nFinish and close the dependency first, or "
            "have the Architect change the order in %s."
            % (task_id, ", ".join(blocked), LEDGER_REL, TASKS_REL)
        )

    # (f) every criterion must exist in ACCEPTANCE.md.
    index = acceptance_index(acceptance_md)
    criteria = expand_criteria(criteria_cell)
    missing = [c for c in criteria if c not in index]
    if missing:
        raise StartError(
            "%s names %s in %s, which %s does not define. The spec contradicts "
            "itself; stop and report it as a blocker."
            % (task_id, ", ".join(missing), TASKS_REL, ACCEPTANCE_REL)
        )

    supplied = expand_criteria(supplied_criteria_arg) if supplied_criteria_arg else []
    unknown = [c for c in supplied if c not in index]
    if unknown:
        raise StartError(
            "%s is not defined in %s." % (", ".join(unknown), ACCEPTANCE_REL)
        )
    outside = [c for c in supplied if c not in criteria]

    # (e) ADRs referenced by the task's section.
    adrs = []
    for m in ADR_RE.findall(section):
        path = "docs/adr/%s" % m
        if path not in adrs:
            adrs.append(path)
    for path in adrs:
        if not os.path.exists(os.path.join(root, path)):
            raise StartError(
                "%s references %s, which does not exist." % (task_id, path)
            )

    # (b) claim it. Everything above passed, so this cannot leave half a state.
    cmd = [os.path.join(root, "scripts", "task.sh"), task_id]
    if supplied_criteria_arg:
        cmd.append(supplied_criteria_arg)
    proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True)
    # Trust the file, not the exit code: what matters is that the claim landed.
    if not os.path.exists(task_file):
        raise StartError(
            "scripts/task.sh did not claim the task: %s%s"
            % (proc.stdout.strip(), proc.stderr.strip())
        )

    # (g) the summary.
    out = sys.stdout
    w = out.write
    w("\n")
    w("=" * 72 + "\n")
    w("  %s · %s\n" % (task_id, re.sub(r"\*\*", "", name)))
    w("=" * 72 + "\n\n")
    w("  estimate    %s\n" % estimate)
    w("  criteria    %d (%s)\n" % (len(criteria), criteria_cell or "—"))
    w("  depends on  %s\n" % "; ".join(dep_status))
    if wave is not None:
        w("  wave        %s%s\n" % (
            wave,
            "  — running concurrently with %s" % ", ".join(concurrent)
            if concurrent else "  — solo"))
        w("  branch      %s  (off the latest main, never off another agent)\n"
          % branch_hint(task_id, name))
    if supplied_criteria_arg:
        w("  claimed as  %s\n" % supplied_criteria_arg)
        if outside:
            w("  note        %s is not in this task's criteria in %s\n"
              % (", ".join(outside), TASKS_REL))
    w("\n")

    dw = done_when(section)
    w("  DONE WHEN\n")
    w("  %s\n\n" % (dw or "not stated in %s — the task has no exit condition." % TASKS_REL))

    own = ownership_row(tasks_md, task_id)
    if own is not None:
        w("  FILES THIS TASK OWNS (one writer per path, per wave)\n")
        w("  writes  %s\n" % (own.get("Writes") or "—"))
        reads = own.get("Reads (never writes)") or own.get("Reads") or "—"
        w("  reads   %s\n" % reads)
        w("  Writing a file this task does not own is a spec gap, not a\n")
        w("  judgement call: stop and write a blocker. /task-close checks this.\n\n")
    elif wave is not None:
        w("  FILES THIS TASK OWNS\n")
        w("  no File ownership row for %s in %s — ask the Architect for one\n"
          % (task_id, TASKS_REL))
        w("  before writing, or three concurrent branches will collide.\n\n")

    w("  ADRs TO READ IN FULL BEFORE WRITING ANYTHING\n")
    if adrs:
        for path in adrs:
            w("  - %s\n" % path)
    else:
        w("  - none referenced by this task\n")
    w("\n")

    w("-" * 72 + "\n")
    w("TASK DETAIL (%s)\n" % TASKS_REL)
    w("-" * 72 + "\n")
    w(section + "\n\n")

    w("-" * 72 + "\n")
    w("ACCEPTANCE CRITERIA (%s)\n" % ACCEPTANCE_REL)
    w("-" * 72 + "\n")
    if not criteria:
        w("This task carries no acceptance criteria.\n")
    for cid in criteria:
        title, block = index[cid]
        w("\n%s — %s\n" % (cid, title))
        for line in block.split("\n"):
            w("    %s\n" % line)
    w("\n")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except StartError as exc:
        print("task-start: %s" % exc, file=sys.stderr)
        sys.exit(1)
