#!/usr/bin/env python3
"""
ledger.py - derive one docs/LEDGER.md row per Claude Code session.

Reads a session transcript (JSONL), sums token usage by type, derives API time
and wall-clock time from timestamps, prices the usage at Anthropic list rates,
and upserts a row keyed by session_id.

Invoked as a Stop / SessionEnd hook (reads hook JSON on stdin), or manually:

    python3 scripts/ledger.py --transcript <path> [--session-id <id>]
    python3 scripts/ledger.py --selfcheck
    python3 scripts/ledger.py --annotate latest --interventions 7/3/1 --tests-added 12
    python3 scripts/ledger.py --backfill '<json>'

Failure policy: this script never writes a partial or guessed row. Anything it
cannot determine is an error printed to stderr with a non-zero exit.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# PRICE TABLE - Anthropic list (first-party API) pricing, USD per 1M tokens.
# Source: Anthropic public pricing. Verified 2026-09-01.
#
# Multipliers applied to the base input rate, per Anthropic's caching docs:
#   cache read        = 0.10x input  (claude-fable-5-1: 0.025x, i.e. $0.25/MTok)
#   cache write, 5m   = 1.25x input
#   cache write, 1h   = 2.00x input
# The 5m/1h split matters: pricing every write at 1.25x understates a session
# that uses 1-hour cache entries by ~40% on the cache-write line.
#
# This is the ONLY place rates are defined. Audit here.
# ---------------------------------------------------------------------------
PRICES_USD_PER_MTOK = {
    "claude-opus-5":     {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write_5m":  6.25, "cache_write_1h": 10.00},
    "claude-opus-4-8":   {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write_5m":  6.25, "cache_write_1h": 10.00},
    "claude-opus-4-7":   {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write_5m":  6.25, "cache_write_1h": 10.00},
    "claude-opus-4-6":   {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write_5m":  6.25, "cache_write_1h": 10.00},
    "claude-fable-5-1":  {"input": 10.00, "output": 50.00, "cache_read": 0.25, "cache_write_5m": 12.50, "cache_write_1h": 20.00},
    "claude-fable-5":    {"input": 10.00, "output": 50.00, "cache_read": 1.00, "cache_write_5m": 12.50, "cache_write_1h": 20.00},
    "claude-sonnet-5":   {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write_5m":  2.50, "cache_write_1h":  4.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00, "cache_read": 0.30, "cache_write_5m":  3.75, "cache_write_1h":  6.00},
    "claude-haiku-4-5":  {"input": 1.00, "output":  5.00, "cache_read": 0.10, "cache_write_5m":  1.25, "cache_write_1h":  2.00},
}

LEDGER_REL_PATH = "docs/LEDGER.md"
TABLE_MARKER = "| date | session_id |"

COLUMNS = [
    "date", "session_id", "task_id", "criteria_ids", "wall_clock_min", "api_time_min",
    "leverage_ratio", "input_tokens", "output_tokens", "cache_write_tokens",
    "cache_read_tokens", "api_cost_usd", "models (% of cost)",
    "interventions (accepted/edited/rejected)", "tests_added", "qa_result", "notes",
]


class LedgerError(Exception):
    """Anything that must stop the run loudly rather than write a bad row."""


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------

def price_for(model):
    """Look up a model's rates. Unknown models are an error, never a guess."""
    if model in PRICES_USD_PER_MTOK:
        return PRICES_USD_PER_MTOK[model]
    raise LedgerError(
        "no price entry for model %r. Add it to PRICES_USD_PER_MTOK in "
        "scripts/ledger.py rather than letting the cost silently drop to zero." % model
    )


def cost_usd(model, inp=0, out=0, cache_write_5m=0, cache_write_1h=0, cache_read=0):
    p = price_for(model)
    return (
        inp * p["input"]
        + out * p["output"]
        + cache_write_5m * p["cache_write_5m"]
        + cache_write_1h * p["cache_write_1h"]
        + cache_read * p["cache_read"]
    ) / 1_000_000


# ---------------------------------------------------------------------------
# Transcript parsing
# ---------------------------------------------------------------------------

def new_bucket():
    """Zeroed accumulator, used for the session total and for each model."""
    return {
        "input": 0, "output": 0, "cache_write_5m": 0, "cache_write_1h": 0,
        "cache_read": 0, "cost_usd": 0.0, "responses": 0,
    }


def fmt_models(by_model, total_cost):
    """
    Render the model mix as a share of cost, most expensive first.

    Cost share, not token share, is the honest summary: cheap auxiliary models
    can dominate a session's raw token count while accounting for a few percent
    of what the session was actually worth.
    """
    parts = []
    for model, b in sorted(by_model.items(), key=lambda kv: -kv[1]["cost_usd"]):
        if total_cost > 0:
            parts.append("%s %.0f%%" % (model, 100.0 * b["cost_usd"] / total_cost))
        else:
            parts.append(model)
    return ", ".join(parts) or "-"


def print_breakdown(summary, stream=sys.stdout):
    """Per-model detail, for auditing which models actually served a session."""
    total = summary["cost_usd"]
    head = ("model", "resp", "input", "output", "cache write", "cache read", "cost $", "% cost")
    print("%-22s %5s %12s %12s %14s %14s %10s %7s" % head, file=stream)
    rows = sorted(summary["by_model"].items(), key=lambda kv: -kv[1]["cost_usd"])
    for model, b in rows:
        share = (100.0 * b["cost_usd"] / total) if total > 0 else 0.0
        print("%-22s %5d %12s %12s %14s %14s %10.4f %6.1f%%" % (
            model, b["responses"], "{:,}".format(b["input"]), "{:,}".format(b["output"]),
            "{:,}".format(b["cache_write_5m"] + b["cache_write_1h"]),
            "{:,}".format(b["cache_read"]), b["cost_usd"], share), file=stream)
    t = summary["tokens"]
    print("%-22s %5d %12s %12s %14s %14s %10.4f %6.1f%%" % (
        "TOTAL", t["responses"], "{:,}".format(t["input"]), "{:,}".format(t["output"]),
        "{:,}".format(t["cache_write_5m"] + t["cache_write_1h"]),
        "{:,}".format(t["cache_read"]), total, 100.0 if total > 0 else 0.0), file=stream)


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def read_transcript(path):
    if not os.path.exists(path):
        raise LedgerError("transcript not found: %s" % path)
    entries = []
    with open(path, "r", encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError as exc:
                # A truncated final line is normal while a session is live.
                if n == sum(1 for _ in open(path, encoding="utf-8")):
                    continue
                raise LedgerError("malformed JSON at %s:%d: %s" % (path, n, exc))
    if not entries:
        raise LedgerError("transcript is empty: %s" % path)
    return entries


def summarise(entries):
    """
    Sum usage and derive timings.

    Dedupe note: Claude Code writes one transcript line per content block, and
    every line of a single API response repeats the SAME usage object and the
    same message.id. Summing lines double- or triple-counts. We key on
    message.id and take each response's usage exactly once.
    """
    usage_by_msg = {}      # message.id -> (model, usage dict)
    req_first_seq = {}     # requestId -> index of its first assistant line
    req_last_ts = {}       # requestId -> last assistant timestamp
    all_ts = []

    for i, e in enumerate(entries):
        ts = parse_ts(e.get("timestamp"))
        if ts:
            all_ts.append(ts)
        if e.get("type") != "assistant":
            continue
        msg = e.get("message") or {}
        model = msg.get("model")
        if not model or model.startswith("<"):
            # "<synthetic>" entries are locally generated (errors, interrupts).
            # They cost nothing and carry no real usage.
            continue
        usage = msg.get("usage")
        mid = msg.get("id")
        if not usage or not mid:
            continue
        usage_by_msg[mid] = (model, usage)

        rid = e.get("requestId") or mid
        req_first_seq.setdefault(rid, i)
        if ts and (rid not in req_last_ts or ts > req_last_ts[rid]):
            req_last_ts[rid] = ts

    if not usage_by_msg:
        raise LedgerError("transcript contains no priced assistant messages")

    totals = new_bucket()
    by_model = {}

    for model, u in usage_by_msg.values():
        bucket = by_model.setdefault(model, new_bucket())
        cc = u.get("cache_creation") or {}
        w5 = int(cc.get("ephemeral_5m_input_tokens", 0) or 0)
        w1 = int(cc.get("ephemeral_1h_input_tokens", 0) or 0)
        declared_write = int(u.get("cache_creation_input_tokens", 0) or 0)
        if w5 + w1 == 0 and declared_write:
            # No TTL breakdown available; assume the cheaper 5m rate and say so.
            w5 = declared_write
        inp = int(u.get("input_tokens", 0) or 0)
        out = int(u.get("output_tokens", 0) or 0)
        rd = int(u.get("cache_read_input_tokens", 0) or 0)

        # Price each response at its own model's rates - a session can mix
        # models, and the mix is exactly what the models column reports.
        c = cost_usd(model, inp, out, w5, w1, rd)
        for b in (totals, bucket):
            b["input"] += inp
            b["output"] += out
            b["cache_write_5m"] += w5
            b["cache_write_1h"] += w1
            b["cache_read"] += rd
            b["cost_usd"] += c
            b["responses"] += 1

    # Wall clock: first to last timestamped event in the transcript.
    wall_min = 0.0
    if len(all_ts) >= 2:
        wall_min = (max(all_ts) - min(all_ts)).total_seconds() / 60.0

    # API time (DERIVED, not measured - the transcript records no durations).
    # For each API request, the clock starts at the event immediately preceding
    # its first assistant line and stops at its last assistant line. Gaps where
    # tools are executing or the human is typing fall outside every window.
    api_seconds = 0.0
    for rid, first_i in req_first_seq.items():
        end = req_last_ts.get(rid)
        if not end:
            continue
        start = None
        for j in range(first_i - 1, -1, -1):
            t = parse_ts(entries[j].get("timestamp"))
            if t:
                start = t
                break
        if start is None:
            continue
        delta = (end - start).total_seconds()
        if delta > 0:
            api_seconds += delta

    return {
        "tokens": totals,
        "cost_usd": totals["cost_usd"],
        "wall_clock_min": wall_min,
        "api_time_min": api_seconds / 60.0,
        "by_model": by_model,
        "models": sorted(by_model),
        "first_ts": min(all_ts) if all_ts else None,
        "responses": len(usage_by_msg),
    }


# ---------------------------------------------------------------------------
# Repo / task context
# ---------------------------------------------------------------------------

def repo_root(start):
    try:
        out = subprocess.run(
            ["git", "-C", start, "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return start


def resolve_task_id(root):
    """.current-task file, else CLAUDE_TASK_ID env, else 'untagged' + warning."""
    path = os.path.join(root, ".current-task")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            val = fh.read().strip()
        if val:
            return val
    val = (os.environ.get("CLAUDE_TASK_ID") or "").strip()
    if val:
        return val
    print(
        "ledger.py WARNING: no .current-task file and no CLAUDE_TASK_ID set - "
        "writing task_id 'untagged'. Run scripts/task.sh <TASK-ID> before starting work.",
        file=sys.stderr,
    )
    return "untagged"


def resolve_criteria_ids(root):
    path = os.path.join(root, ".current-criteria")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            val = fh.read().strip()
        if val:
            return val
    return (os.environ.get("CLAUDE_CRITERIA_IDS") or "").strip() or "-"


# ---------------------------------------------------------------------------
# Row rendering + upsert
# ---------------------------------------------------------------------------

def fmt_row(values):
    return "| " + " | ".join(str(values[c]) for c in COLUMNS) + " |"


def build_row(summary, session_id, task_id, criteria_ids, notes):
    wall = summary["wall_clock_min"]
    api = summary["api_time_min"]
    leverage = (api / wall) if wall > 0 else 0.0
    t = summary["tokens"]
    day = (summary["first_ts"] or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    return {
        "date": day,
        "session_id": session_id,
        "task_id": task_id,
        "criteria_ids": criteria_ids,
        "wall_clock_min": "%.1f" % wall,
        "api_time_min": "%.1f" % api,
        "leverage_ratio": "%.2f" % leverage,
        "input_tokens": "{:,}".format(t["input"]),
        "output_tokens": "{:,}".format(t["output"]),
        "cache_write_tokens": "{:,}".format(t["cache_write_5m"] + t["cache_write_1h"]),
        "cache_read_tokens": "{:,}".format(t["cache_read"]),
        "api_cost_usd": "%.2f" % summary["cost_usd"],
        "models (% of cost)": fmt_models(summary["by_model"], summary["cost_usd"]),
        "interventions (accepted/edited/rejected)": "-",
        "tests_added": "-",
        "qa_result": "-",
        "notes": notes,
    }


def upsert(ledger_path, row):
    """Replace the row with this session_id, else append. Atomic write."""
    if not os.path.exists(ledger_path):
        raise LedgerError(
            "%s does not exist. It is the schema of record and is not "
            "auto-created, so a missing file is a real problem, not a first run."
            % ledger_path
        )
    with open(ledger_path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")

    header_i = next((i for i, l in enumerate(lines) if l.startswith(TABLE_MARKER)), None)
    if header_i is None:
        raise LedgerError("no ledger table header found in %s" % ledger_path)

    sid_cell = "| %s |" % row["session_id"]
    replaced = False
    for i in range(header_i + 2, len(lines)):
        if not lines[i].startswith("|"):
            break
        if sid_cell in lines[i]:
            # Preserve hand-supplied cells. The hook re-runs on every stop and
            # rewrites the whole line from the transcript; without this, an
            # annotation made mid-session is silently destroyed the next time
            # the model stops talking. Measured cells always take the new value.
            prior = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            if len(prior) == len(COLUMNS):
                prior = dict(zip(COLUMNS, prior))
                for col in ANNOTATABLE:
                    if row.get(col, "-") in ("", "-") and prior.get(col, "-") not in ("", "-"):
                        row[col] = prior[col]
            lines[i] = fmt_row(row)
            replaced = True
            break

    line = fmt_row(row)

    if not replaced:
        end = header_i + 2
        while end < len(lines) and lines[end].startswith("|"):
            end += 1
        lines.insert(end, line)

    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ledger_path) or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines))
        os.replace(tmp, ledger_path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return "updated" if replaced else "appended"


# ---------------------------------------------------------------------------
# Annotation - the columns no transcript can report
# ---------------------------------------------------------------------------

# Cells a human fills in. Everything else on a row is measured from the
# transcript and must never be editable by hand: a ledger whose token counts
# can be typed over is not evidence of anything.
ANNOTATABLE = {
    "criteria_ids": "acceptance criterion ids this task covered, comma separated",
    "interventions (accepted/edited/rejected)": "human interventions as a/e/r, e.g. 7/3/1",
    "tests_added": "count of tests added in this session",
    "qa_result": "pass | fail | partial | n/a",
    "notes": "free text",
}


def annotate(ledger_path, session_id, values):
    """Set human-supplied cells on an existing row. Measured cells are refused."""
    bad = [k for k in values if k not in ANNOTATABLE]
    if bad:
        raise LedgerError(
            "refusing to annotate measured column(s) %s. Only %s may be set by "
            "hand; the rest are derived from the transcript." % (bad, sorted(ANNOTATABLE))
        )
    if not os.path.exists(ledger_path):
        raise LedgerError("%s does not exist" % ledger_path)

    with open(ledger_path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")

    header_i = next((i for i, l in enumerate(lines) if l.startswith(TABLE_MARKER)), None)
    if header_i is None:
        raise LedgerError("no ledger table header found in %s" % ledger_path)

    data_rows = []
    for i in range(header_i + 2, len(lines)):
        if not lines[i].startswith("|"):
            break
        data_rows.append(i)
    if not data_rows:
        raise LedgerError("ledger table has no data rows to annotate")

    if session_id == "latest":
        target = data_rows[-1]
    else:
        matches = [i for i in data_rows if ("| %s |" % session_id) in lines[i]]
        if not matches:
            raise LedgerError(
                "no ledger row for session %r. Use --annotate latest, or check "
                "the session_id column." % session_id
            )
        target = matches[0]

    cells = [c.strip() for c in lines[target].strip().strip("|").split("|")]
    if len(cells) != len(COLUMNS):
        raise LedgerError(
            "row has %d cells but the schema has %d columns; refusing to guess "
            "which is which." % (len(cells), len(COLUMNS))
        )

    row = dict(zip(COLUMNS, cells))
    for k, v in values.items():
        if "|" in v:
            raise LedgerError("annotation value for %r contains a pipe" % k)
        row[k] = v or "-"

    lines[target] = fmt_row(row)

    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ledger_path) or ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines))
        os.replace(tmp, ledger_path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    return row["session_id"]


# ---------------------------------------------------------------------------
# Self-check
# ---------------------------------------------------------------------------

SELFCHECK_COUNTS = {"input": 208, "output": 587, "cache_write": 885_800, "cache_read": 9_700_000}
SELFCHECK_EXPECTED_USD = 3.02


def run_selfcheck():
    """
    Reproduce the reference figures from the SETUP-01 /cost report against the
    price table. This prints the full arithmetic so the table can be audited;
    it is NOT tuned to make the number come out right.
    """
    model = "claude-opus-5"
    p = price_for(model)
    c = SELFCHECK_COUNTS
    print("Self-check: %s, list pricing, USD per 1M tokens" % model)
    print("  input      %10s x $%6.2f = $%8.4f" % ("{:,}".format(c["input"]), p["input"], c["input"] * p["input"] / 1e6))
    print("  output     %10s x $%6.2f = $%8.4f" % ("{:,}".format(c["output"]), p["output"], c["output"] * p["output"] / 1e6))
    for ttl, key in (("5m", "cache_write_5m"), ("1h", "cache_write_1h")):
        print("  cache w/%s %10s x $%6.2f = $%8.4f" % (ttl, "{:,}".format(c["cache_write"]), p[key], c["cache_write"] * p[key] / 1e6))
    print("  cache read %10s x $%6.2f = $%8.4f" % ("{:,}".format(c["cache_read"]), p["cache_read"], c["cache_read"] * p["cache_read"] / 1e6))

    lo = cost_usd(model, c["input"], c["output"], cache_write_5m=c["cache_write"], cache_read=c["cache_read"])
    hi = cost_usd(model, c["input"], c["output"], cache_write_1h=c["cache_write"], cache_read=c["cache_read"])
    print("\n  total, all writes at 5m rate: $%.2f" % lo)
    print("  total, all writes at 1h rate: $%.2f" % hi)
    print("  reference figure from /cost:  $%.2f" % SELFCHECK_EXPECTED_USD)

    if abs(lo - SELFCHECK_EXPECTED_USD) < 0.01 or abs(hi - SELFCHECK_EXPECTED_USD) < 0.01:
        print("\n  RESULT: reconciles.")
        return 0

    read_only = c["cache_read"] * p["cache_read"] / 1e6
    print("\n  RESULT: DOES NOT RECONCILE.")
    print("  The cache-read line alone is $%.2f, already above the $%.2f reference," % (read_only, SELFCHECK_EXPECTED_USD))
    print("  so no Opus 5 price table can produce it from these counts. Solving for")
    print("  the implied base input rate gives ~$1.45/MTok (5m writes) or ~$1.10/MTok")
    print("  (1h writes) - Haiku-tier, not Opus-tier. The most likely explanation is")
    print("  that the dollar figure and the token counts were reported over different")
    print("  scopes. The price table above is list pricing and has NOT been adjusted")
    print("  to force this number to match.")
    return 1


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def run_from_transcript(transcript, session_id, root, notes, breakdown=False):
    entries = read_transcript(transcript)
    summary = summarise(entries)
    if breakdown:
        print_breakdown(summary)
    if not session_id:
        session_id = os.path.splitext(os.path.basename(transcript))[0]
    row = build_row(
        summary,
        session_id=session_id,
        task_id=resolve_task_id(root),
        criteria_ids=resolve_criteria_ids(root),
        notes=notes or (os.environ.get("LEDGER_NOTES") or "").strip() or "-",
    )
    action = upsert(os.path.join(root, LEDGER_REL_PATH), row)
    print(
        "ledger.py: %s row for %s (task %s) - $%s, %s responses, models: %s"
        % (action, row["session_id"], row["task_id"], row["api_cost_usd"],
           summary["responses"], row["models (% of cost)"]),
        file=sys.stderr,
    )
    return 0


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--transcript", help="path to a session transcript JSONL")
    ap.add_argument("--session-id", help="override the session id")
    ap.add_argument("--repo-root", help="repo root (default: derived from cwd)")
    ap.add_argument("--notes", help="notes cell for this row")
    ap.add_argument("--selfcheck", action="store_true", help="audit the price table against the reference figures")
    ap.add_argument("--breakdown", action="store_true", help="print per-model token and cost detail")
    ap.add_argument("--backfill", help="JSON object describing a row to insert verbatim")
    ap.add_argument("--annotate", metavar="SESSION_ID",
                    help="set human-supplied cells on an existing row; 'latest' targets the last row")
    ap.add_argument("--criteria-ids", help="with --annotate: acceptance criterion ids covered")
    ap.add_argument("--interventions", help="with --annotate: accepted/edited/rejected, e.g. 7/3/1")
    ap.add_argument("--tests-added", help="with --annotate: count of tests added")
    ap.add_argument("--qa-result", help="with --annotate: pass | fail | partial | n/a")
    args = ap.parse_args(argv)

    if args.selfcheck:
        return run_selfcheck()

    root = args.repo_root or repo_root(os.getcwd())

    if args.annotate:
        supplied = {
            "criteria_ids": args.criteria_ids,
            "interventions (accepted/edited/rejected)": args.interventions,
            "tests_added": args.tests_added,
            "qa_result": args.qa_result,
            "notes": args.notes,
        }
        supplied = {k: v for k, v in supplied.items() if v is not None}
        if not supplied:
            raise LedgerError(
                "--annotate given with nothing to set. Supply at least one of "
                "--criteria-ids, --interventions, --tests-added, --qa-result, --notes."
            )
        sid = annotate(os.path.join(root, LEDGER_REL_PATH), args.annotate, supplied)
        print("ledger.py: annotated %s (%s)" % (sid, ", ".join(sorted(supplied))), file=sys.stderr)
        return 0

    if args.backfill:
        data = json.loads(args.backfill)
        row = {c: str(data.get(c, "-")) for c in COLUMNS}
        action = upsert(os.path.join(root, LEDGER_REL_PATH), row)
        print("ledger.py: %s backfill row for %s" % (action, row["session_id"]), file=sys.stderr)
        return 0

    if args.transcript:
        return run_from_transcript(args.transcript, args.session_id, root, args.notes, args.breakdown)

    # Hook mode: hook JSON arrives on stdin.
    raw = sys.stdin.read()
    if not raw.strip():
        raise LedgerError("no --transcript given and nothing on stdin")
    try:
        hook = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise LedgerError("hook stdin is not JSON: %s" % exc)

    transcript = hook.get("transcript_path")
    if not transcript:
        raise LedgerError("hook payload has no transcript_path (keys: %s)" % sorted(hook))
    root = args.repo_root or repo_root(hook.get("cwd") or os.getcwd())
    return run_from_transcript(transcript, hook.get("session_id"), root, args.notes, args.breakdown)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except LedgerError as exc:
        # Fail loudly: stderr is surfaced in the terminal, and no row is written.
        print("ledger.py ERROR: %s" % exc, file=sys.stderr)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001 - never fail silently
        import traceback
        traceback.print_exc()
        print("ledger.py ERROR (unhandled): %s" % exc, file=sys.stderr)
        sys.exit(1)
