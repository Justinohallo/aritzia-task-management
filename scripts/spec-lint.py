#!/usr/bin/env python3
"""spec-lint.py - the spec system checks itself.

    python3 scripts/spec-lint.py            # lint docs/ under the repo root
    python3 scripts/spec-lint.py --quiet    # print findings only
    python3 scripts/spec-lint.py --root DIR # lint another checkout

Exit 0 when every check passes, 1 on any finding, 2 when a file the checks
need cannot be read. task-start runs this before it claims a task, and CI
runs it on any pull request touching docs/.

The checks, from TASKS.md T-16:

  estimates    the Sequence table's Est. column sums to the totals stated in
               the TASKS.md header (total, build-only, task count), and the
               wave table's Wall clock column sums to the header's wall clock
  references   every AC- reference in docs/ resolves to a #### heading in
               ACCEPTANCE.md; every ADR-NNNN and every relative .md link
               resolves to a file
  adr-count    the number of ADR files matches the adr/README.md index and
               the count PROJECT.md (and TASKS.md, README.md) state in prose
  assignment   every criterion in ACCEPTANCE.md is assigned to exactly one
               task in the Sequence table, or to several with a distinct
               labelled parenthetical on each - `AC-API-10` (server) /
               `AC-API-10` (client)

Stdlib only, to match scripts/ledger.py and the repo skills. ARCH-03's
critic pass found fifteen contradictions by hand (B-01..B-15); most of the
numeric ones would have been a one-line failure here.
"""
import os
import re
import subprocess
import sys

DOCS_REL = "docs"
TASKS_REL = "docs/TASKS.md"
ACCEPTANCE_REL = "docs/ACCEPTANCE.md"
PROJECT_REL = "docs/PROJECT.md"
ADR_DIR_REL = "docs/adr"
ADR_README_REL = "docs/adr/README.md"

# Files whose "N ADRs" phrases are claims about the present. BLOCKERS.md is
# deliberately absent: B-15 quotes the stale "five ADRs" as history.
ADR_COUNT_CLAIM_FILES = (PROJECT_REL, TASKS_REL, "README.md")

CRITERION_RE = re.compile(r"\bAC-([A-Z0-9]+)-(\d+)(?:\.\.(\d+))?\b")
ADR_ID_RE = re.compile(r"\bADR-(\d{4})\b")
ADR_FILE_RE = re.compile(r"^(\d{4})-[a-z0-9-]+\.md$")
MD_LINK_RE = re.compile(r"\]\(([^)\s]+\.md)(?:#[^)]*)?\)")
DURATION_RE = re.compile(r"^(?:(\d+)h)?(?:(\d+)m)?$")
ADR_COUNT_RE = re.compile(r"\b([A-Za-z]+|\d+) ADRs\b")
CRITERIA_CELL_RE = re.compile(r"`([^`]+)`(?:\s*\(([^)]*)\))?")

WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}


class LintError(Exception):
    """A file the checks need is missing or unreadable. Exit 2, not 1."""


def repo_root(start):
    try:
        out = subprocess.run(
            ["git", "-C", start, "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        return out or start
    except (OSError, subprocess.CalledProcessError):
        return start


def read(root, rel):
    path = os.path.join(root, rel)
    if not os.path.exists(path):
        raise LintError("%s does not exist" % rel)
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def docs_files(root):
    """Every .md under docs/, repo-relative, sorted."""
    out = []
    for base, _dirs, files in os.walk(os.path.join(root, DOCS_REL)):
        for f in files:
            if f.endswith(".md"):
                out.append(os.path.relpath(os.path.join(base, f), root))
    return sorted(out)


def table_rows(text, header_predicate, key_column):
    """Rows of the first pipe table whose header satisfies the predicate.

    Read by column name, never by position - the Sequence table has grown a
    column before and positional access failed open. Returns (columns, rows)
    where rows is an ordered list of dicts; only rows whose key column is
    non-empty after stripping bold markers are kept.
    """
    lines = text.split("\n")
    header_i = next((i for i, l in enumerate(lines) if header_predicate(l)), None)
    if header_i is None:
        return None, []
    columns = [c.strip() for c in lines[header_i].strip().strip("|").split("|")]
    rows = []
    for line in lines[header_i + 2:]:
        if not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != len(columns):
            continue
        row = dict(zip(columns, cells))
        if row.get(key_column, "").replace("*", "").strip():
            rows.append(row)
    return columns, rows


def sequence_rows(tasks_md):
    columns, rows = table_rows(
        tasks_md,
        lambda l: l.startswith("| #") and "Task" in l and "Depends on" in l,
        "#",
    )
    if columns is None:
        raise LintError("%s has no Sequence table (header with '#', 'Task', "
                        "'Depends on')" % TASKS_REL)
    out = []
    for row in rows:
        tid = row["#"].replace("*", "").strip()
        if re.fullmatch(r"[A-Z]+-\d+", tid):
            row["_id"] = tid
            out.append(row)
    return out


def parse_minutes(cell):
    m = DURATION_RE.match(cell.replace("*", "").strip())
    if not m or not (m.group(1) or m.group(2)):
        return None
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


def fmt_minutes(minutes):
    h, m = divmod(minutes, 60)
    if h and m:
        return "%dh%02dm" % (h, m)
    if h:
        return "%dh" % h
    return "%dm" % m


def expand(prefix, lo, hi):
    low, high = int(lo), int(hi) if hi else int(lo)
    return ["AC-%s-%d" % (prefix, n) for n in range(low, high + 1)]


def acceptance_ids(acceptance_md):
    ids = []
    for line in acceptance_md.split("\n"):
        if line.startswith("#### "):
            m = re.match(r"(AC-[A-Z0-9]+-\d+)\b", line[5:].strip())
            if m:
                ids.append(m.group(1))
    return ids


def flatten(text):
    """Blockquote prefixes and line breaks removed, for prose regexes."""
    return re.sub(r"\s+", " ", re.sub(r"^>\s?", "", text, flags=re.M))


# ---------------------------------------------------------------------------
# Checks. Each returns (findings, detail): findings is a list of strings,
# empty on success; detail is the one-line summary printed beside PASS/FAIL.
# ---------------------------------------------------------------------------

def check_estimates(root):
    tasks_md = read(root, TASKS_REL)
    rows = sequence_rows(tasks_md)
    findings = []

    total = build = 0
    tooling = []
    for row in rows:
        minutes = parse_minutes(row.get("Est.", ""))
        if minutes is None:
            findings.append("%s: Est. cell %r is not a duration like 45m or 1h30m"
                            % (row["_id"], row.get("Est.", "")))
            continue
        total += minutes
        if "tooling" in row.get("Criteria", "").lower():
            tooling.append(row["_id"])
        else:
            build += minutes

    flat = flatten(tasks_md)
    m = re.search(
        r"\*\*Estimated:\*\*\s*(\S+) of work across (\d+) tasks\s*[—-]+\s*(\S+) of build",
        flat,
    )
    if not m:
        findings.append("%s header has no '**Estimated:** <total> of work across "
                        "<N> tasks — <build> of build' sentence to check against"
                        % TASKS_REL)
        return findings, ""
    stated_total, stated_count, stated_build = m.group(1), int(m.group(2)), m.group(3)
    if parse_minutes(stated_total) != total:
        findings.append("header says %s of work; the Sequence table sums to %s"
                        % (stated_total, fmt_minutes(total)))
    if stated_count != len(rows):
        findings.append("header says %d tasks; the Sequence table has %d"
                        % (stated_count, len(rows)))
    if parse_minutes(stated_build) != build:
        findings.append("header says %s of build; the non-tooling rows sum to %s "
                        "(tooling: %s)" % (stated_build, fmt_minutes(build),
                                           ", ".join(tooling) or "none"))

    wall = re.search(r"\*\*(\S+) of wall clock\*\*", flat)
    _cols, waves = table_rows(
        tasks_md, lambda l: l.startswith("| Wave") and "Wall clock" in l, "Wave")
    wave_total = 0
    if wall and waves:
        for w in waves:
            minutes = parse_minutes(w.get("Wall clock", ""))
            if minutes is None:
                findings.append("wave %s: Wall clock cell %r is not a duration"
                                % (w["Wave"].replace("*", ""), w.get("Wall clock")))
            else:
                wave_total += minutes
        if parse_minutes(wall.group(1)) != wave_total:
            findings.append("header says %s of wall clock; the wave table sums to %s"
                            % (wall.group(1), fmt_minutes(wave_total)))

    detail = "%s across %d tasks, %s of build" % (
        fmt_minutes(total), len(rows), fmt_minutes(build))
    if wall and waves:
        detail += ", %s of wall clock" % fmt_minutes(wave_total)
    return findings, detail


def check_references(root):
    acceptance = set(acceptance_ids(read(root, ACCEPTANCE_REL)))
    adr_dir = os.path.join(root, ADR_DIR_REL)
    adr_numbers = {
        ADR_FILE_RE.match(f).group(1)
        for f in (os.listdir(adr_dir) if os.path.isdir(adr_dir) else [])
        if ADR_FILE_RE.match(f)
    }
    findings = []
    n_ac = n_adr = n_links = 0

    for rel in docs_files(root):
        text = read(root, rel)
        for n, line in enumerate(text.split("\n"), 1):
            for prefix, lo, hi in CRITERION_RE.findall(line):
                n_ac += 1
                for cid in expand(prefix, lo, hi):
                    if cid not in acceptance:
                        findings.append("%s:%d references %s, which %s does not define"
                                        % (rel, n, cid, ACCEPTANCE_REL))
            for num in ADR_ID_RE.findall(line):
                n_adr += 1
                if num not in adr_numbers:
                    findings.append("%s:%d references ADR-%s, and %s has no %s-*.md"
                                    % (rel, n, num, ADR_DIR_REL, num))
            for target in MD_LINK_RE.findall(line):
                if "://" in target:
                    continue
                n_links += 1
                full = os.path.normpath(os.path.join(root, os.path.dirname(rel), target))
                if not os.path.exists(full):
                    findings.append("%s:%d links to %s, which does not exist"
                                    % (rel, n, target))
    detail = "%d AC- references, %d ADR ids, %d .md links" % (n_ac, n_adr, n_links)
    return findings, detail


def check_adr_count(root):
    adr_dir = os.path.join(root, ADR_DIR_REL)
    if not os.path.isdir(adr_dir):
        raise LintError("%s does not exist" % ADR_DIR_REL)
    files = sorted(f for f in os.listdir(adr_dir) if ADR_FILE_RE.match(f))
    findings = []

    _cols, index_rows = table_rows(
        read(root, ADR_README_REL), lambda l: l.startswith("| #") and "Decision" in l, "#")
    indexed = [r for r in index_rows if re.search(r"\d{4}", r["#"])]
    if len(indexed) != len(files):
        findings.append("%s indexes %d ADRs; %s holds %d files"
                        % (ADR_README_REL, len(indexed), ADR_DIR_REL, len(files)))
    for f in files:
        num = ADR_FILE_RE.match(f).group(1)
        if not any(num in r["#"] for r in indexed):
            findings.append("%s is not indexed in %s" % (f, ADR_README_REL))

    claims = []
    for rel in ADR_COUNT_CLAIM_FILES:
        if not os.path.exists(os.path.join(root, rel)):
            continue
        for n, line in enumerate(read(root, rel).split("\n"), 1):
            for word in ADR_COUNT_RE.findall(line):
                count = WORDS.get(word.lower()) if not word.isdigit() else int(word)
                if count is None:
                    continue
                claims.append((rel, n, word, count))
                if count != len(files):
                    findings.append("%s:%d says %s ADRs; %s holds %d"
                                    % (rel, n, word, ADR_DIR_REL, len(files)))
    if not any(rel == PROJECT_REL for rel, _n, _w, _c in claims):
        findings.append("%s states no ADR count to check against %s"
                        % (PROJECT_REL, ADR_README_REL))
    detail = "%d files, %d indexed, %d prose claim(s)" % (
        len(files), len(indexed), len(claims))
    return findings, detail


def check_assignment(root):
    ids = acceptance_ids(read(root, ACCEPTANCE_REL))
    rows = sequence_rows(read(root, TASKS_REL))
    findings = []
    assigned = {}  # cid -> [(task, label)]
    for row in rows:
        for group, label in CRITERIA_CELL_RE.findall(row.get("Criteria", "")):
            for prefix, lo, hi in CRITERION_RE.findall(group):
                for cid in expand(prefix, lo, hi):
                    assigned.setdefault(cid, []).append((row["_id"], label.strip()))

    for cid in assigned:
        if cid not in ids:
            findings.append("%s assigns %s to %s, and %s does not define it"
                            % (TASKS_REL, cid, ", ".join(t for t, _ in assigned[cid]),
                               ACCEPTANCE_REL))

    split = []
    for cid in ids:
        holders = assigned.get(cid, [])
        if not holders:
            findings.append("%s is assigned to no task in the Sequence table" % cid)
        elif len(holders) > 1:
            unlabelled = [t for t, label in holders if not label]
            labels = [label for _t, label in holders if label]
            if unlabelled:
                findings.append(
                    "%s is assigned to %s; a criterion in more than one task needs "
                    "a labelled parenthetical on every occurrence, as `AC-API-10` "
                    "(server) / (client) has - unlabelled in %s"
                    % (cid, ", ".join(t for t, _ in holders), ", ".join(unlabelled)))
            elif len(set(labels)) != len(labels):
                findings.append("%s is split with a repeated label: %s"
                                % (cid, ", ".join("%s (%s)" % h for h in holders)))
            else:
                split.append(cid)
    detail = "%d criteria, %d assigned once, %d split with labels" % (
        len(ids), len(ids) - len(split), len(split))
    if split:
        detail += " (%s)" % ", ".join(split)
    return findings, detail


CHECKS = (
    ("estimates", check_estimates),
    ("references", check_references),
    ("adr-count", check_adr_count),
    ("assignment", check_assignment),
)


def main(argv):
    quiet, root = False, None
    args = list(argv)
    while args:
        a = args.pop(0)
        if a in ("-h", "--help"):
            print(__doc__)
            return 0
        if a in ("-q", "--quiet"):
            quiet = True
        elif a == "--root":
            if not args:
                print("spec-lint: --root needs a directory", file=sys.stderr)
                return 2
            root = args.pop(0)
        else:
            print("spec-lint: unknown argument %r" % a, file=sys.stderr)
            return 2
    root = os.path.abspath(root) if root else repo_root(os.getcwd())

    total = 0
    lines = []
    for name, check in CHECKS:
        findings, detail = check(root)
        total += len(findings)
        status = "FAIL" if findings else "PASS"
        if not quiet or findings:
            lines.append("  [%s] %-12s %s" % (status, name, detail))
        for f in findings:
            lines.append("         - %s" % f)

    if not quiet:
        print("spec-lint: %s/" % os.path.join(root, DOCS_REL))
    for line in lines:
        print(line)
    if total:
        print("spec-lint: %d finding(s). The spec contradicts itself; that goes to "
              "the Architect (docs/BLOCKERS.md), not to whoever noticed." % total)
        return 1
    if not quiet:
        print("spec-lint: 0 findings")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except LintError as exc:
        print("spec-lint: %s" % exc, file=sys.stderr)
        sys.exit(2)
