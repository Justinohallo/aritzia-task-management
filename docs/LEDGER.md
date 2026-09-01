# Session ledger

One row per Claude Code session. Rows are written automatically by
`scripts/ledger.py`, registered as a `Stop` and `SessionEnd` hook in
`.claude/settings.json`. Token counts come from the session transcript's
per-response `usage` objects, not from an estimate.

## How to read this table

- **Cost is API-equivalent, not cash spent.** This project runs on a Claude
  subscription. Every dollar figure is what the same work would have cost at
  Anthropic's published API list rates for the model that served it. No money
  changed hands per session. The rates live in one labelled constant,
  `PRICES_USD_PER_MTOK` in `scripts/ledger.py` — audit them there.
- **Cache reads are reported separately on purpose.** In agentic sessions they
  dominate the raw token count — often by 10:1 or more — while costing 0.1× the
  base input rate (0.025× on Claude Fable 5.1). Quoting a single "total tokens"
  number makes a session look an order of magnitude larger than its economics.
  Read the four token columns as four different things, not as addends.
- **Cache writes are priced by TTL.** A 5-minute cache write costs 1.25× base
  input; a 1-hour write costs 2×. The script reads the per-response TTL split
  and prices each accordingly.
- **`leverage_ratio` = `api_time_min` / `wall_clock_min`.** It is the share of a
  session that was model time rather than human time. Above 1.0 means
  concurrent model work. It is expected to rise as specifications improve: a
  well-specified task spends its minutes in the model, a poorly-specified one
  spends them in the back-and-forth. Falling leverage on a repeat task type is a
  spec problem, not a model problem.
- **Attribution rule: one session per task.** A session maps to exactly one
  `task_id`. Set the task before starting work (`scripts/task.sh <TASK-ID>`) and
  start a new session or `/clear` when moving to the next task. Two tasks in one
  session produce one row that is honestly attributable to neither.
- **`backfilled` in notes** means the row was reconstructed after the fact from
  `/cost` output rather than written by the hook from a transcript. Backfilled
  rows carry the accuracy of whatever they were reconstructed from.
- **Derived, not measured:** `api_time_min` and `wall_clock_min`. The transcript
  records no request durations, so API time is derived from timestamps — for
  each API request, the interval from the event that triggered it to its final
  response line. Time spent executing tools or waiting on a human falls outside
  every such interval and is excluded. Treat these as good estimates, not meter
  readings.
- **`models (% of cost)`** names every model that served the session and each
  one's share of the session's cost, most expensive first. The model is read
  from the `model` field the API returns on each response, and each response is
  priced at its own model's rates — so a mixed-model session is costed
  correctly, not at a single assumed rate. Share is of **cost, not tokens**: a
  cheap auxiliary model can dominate a session's raw token count while
  accounting for a few percent of its value, and a token share would make that
  look like the reverse. `python3 scripts/ledger.py --transcript <path>
  --breakdown` prints the full per-model table behind this cell.
- **`interventions`, `tests_added`, `qa_result`** are `-` unless filled in by
  hand. Nothing in the transcript reports them reliably, so the script does not
  invent them.

## The capture mechanism

**Which hooks exist, and which are used.** `.claude/settings.json` registers
`scripts/ledger.py` on two events:

| Event | Why it is registered |
|---|---|
| `Stop` | Fires when the model finishes a turn. Gives a live row that is correct even if the session is later killed rather than closed. |
| `SessionEnd` | Fires on clean session close. The authoritative final write. |

`SubagentStop` is deliberately **not** registered, and that is a known gap
rather than an oversight — see "What this ledger cannot measure" below.

**The hook reads the transcript, not `/cost`.** The original intent was to
capture `/cost` output. That is the wrong source and was rejected:

- `/cost` is an interactive slash command. Its rendered output is not available
  to a hook process, which receives a JSON payload on stdin, not the terminal.
- The transcript's per-response `usage` objects are the same data one level
  closer to the source — per response, per model, with the cache-write TTL
  split that a single summary figure flattens away.
- A transcript can be re-derived at any time
  (`--transcript <path> --breakdown`). A scraped summary cannot be audited
  after the fact.

The one thing `/cost` had that this does not is Anthropic's own arithmetic. That
is replaced by `--selfcheck`, which prints this repo's arithmetic in full so it
can be checked line by line — and which currently reports, loudly, that the
backfilled `SETUP-01` row does **not** reconcile. Leaving that visible is the
point: a ledger that quietly adjusted its rates to make a number match would be
worthless as evidence.

## Filling the human columns

Four columns cannot be derived from a transcript and are set by hand:

```bash
python3 scripts/ledger.py --annotate latest \
  --criteria-ids "AC-ADD-1,AC-ADD-2,AC-API-8" \
  --interventions 7/3/1 \
  --tests-added 12 \
  --qa-result pass
```

`--annotate latest` targets the last row; a session id targets that row.
Attempting to annotate a **measured** column is refused — token counts and
costs are not hand-editable, because a ledger whose numbers can be typed over
is not evidence of anything.

`upsert` preserves hand-supplied cells when the hook rewrites a row. Without
that, every annotation would be destroyed the next time the model stopped
talking.

### What `interventions` counts

`accepted / edited / rejected`, counted against **proposals the agent made**,
not messages exchanged:

- **accepted** — a proposal taken as-is: a recommendation adopted, a diff
  merged without change.
- **edited** — taken, but modified: the direction was right, the specifics
  were not.
- **rejected** — discarded, reversed, or abandoned, including a question the
  human declined to answer and a scope proposal that was overruled.

The ratio is the number worth watching over time. Rising `rejected` on a task
type means the specification is not carrying enough information — which is a
spec problem to fix upstream, not a model problem to work around.

## Ledger

| date | session_id | task_id | criteria_ids | wall_clock_min | api_time_min | leverage_ratio | input_tokens | output_tokens | cache_write_tokens | cache_read_tokens | api_cost_usd | models (% of cost) | interventions (accepted/edited/rejected) | tests_added | qa_result | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-08-31 | unrecorded (pre-hook) | SETUP-01 | - | 10.0 | 4.0 | 0.40 | 208 | 587 | 885,800 | 9,700,000 | 3.02 | unverified (no transcript) | - | - | - | backfilled from /cost; repo init, branch protection. Cost is as /cost reported it; it does not reconcile with Opus 5 list pricing for these counts (see `--selfcheck`). |
| 2026-08-31 | 89cb008a-f78d-5c8f-bef3-e68cab039af7 | LEDGER-01 | - | 12.2 | 8.2 | 0.67 | 52 | 40,045 | 205,310 | 2,704,523 | 4.41 | claude-opus-5 100% | - | - | - | ledger system build + per-model breakdown; row written by the hook itself |
| 2026-09-01 | b4369396-4840-5623-8c6e-80a7449e6f70 | ARCH-01 | authored AC-ADD/LIST/FILT/DONE/DEL/API/AUTH/NAV/STATE/UI/A11Y/QUAL/TEST/CI/DEP (78); none implemented | 59.5 | 21.5 | 0.36 | 103 | 89,072 | 479,078 | 5,945,338 | 9.99 | claude-opus-5 100% | 6/1/2 | 0 | n/a (spec only) | intake + acceptance + ADRs + ledger + operating rules + task plan; no application code |
| 2026-09-01 | 1e07e9b8-88dc-5b13-9389-f24f23a631bf | ARCH-02 | - | 11.7 | 5.6 | 0.48 | 53 | 24,988 | 107,160 | 2,623,997 | 3.01 | claude-opus-5 100% | - | - | n/a (spec only) | Architect: re-planned TASKS.md as six concurrent-agent waves; contract freeze at T-01, T-06 and T-14 taken off the critical path; file-ownership map and merge rules added. No application code. |
| 2026-09-01 | c6e5e0b7-6bb2-5887-9e12-5278ba684c17 | LEDGER-02 | - | 12.8 | 6.0 | 0.47 | 3,811 | 19,954 | 153,009 | 9,053,141 | 6.36 | claude-fable-5-1 100% | - | - | n/a | add claude-fable-5-1 to the price table (cache read 0.025x); tooling only, no application code |
| 2026-09-01 | 1956c5c3-fa58-5210-93eb-80b25fbca702 | T-00 | - | 26.1 | 13.8 | 0.53 | 130 | 64,733 | 177,349 | 8,060,736 | 7.42 | claude-opus-5 100% | - | 0 | n/a | T-00 repo skills; closed via /task-close (dogfood). Interventions not counted: T-00 was authored and closed before review, so an accepted/edited/rejected split would have measured only what went unchallenged. Wave-aware from ARCH-02. |
| 2026-09-01 | 65e109b6-9733-5120-93e6-939e021641a0 | OPS-01 | - | 7.0 | 6.5 | 0.94 | 1,327 | 27,130 | 160,860 | 2,019,109 | 5.09 | claude-fable-5-1 100% | - | - | - | operator runbook for cloud sessions + SessionStart hook; docs and tooling only, no application code |
| 2026-09-01 | d005e148-8336-5876-8913-007a098145a6 | ARCH-03 | - | 19.4 | 13.0 | 0.67 | 14,531 | 62,424 | 210,310 | 3,366,617 | 8.31 | claude-fable-5-1 100% | - | - | n/a | Architect: pre-wave critic pass over the whole spec system, then the amendments. 15 findings (B-01..B-15 in BLOCKERS.md) resolved in one docs commit; T-16 added for the tooling follow-ups. No application code. |
| 2026-09-01 | 33599ac4-c5de-59b6-87ee-99271d908a0d | T-01 | AC-QUAL-1,AC-QUAL-2,AC-CI-1,AC-CI-2 | 36.6 | 19.2 | 0.52 | 5,618 | 86,592 | 269,507 | 21,098,063 | 15.05 | claude-fable-5-1 100% | - | - | - | - |

## What this ledger cannot measure

- **Human review time.** Wall-clock covers the session, not the minutes spent
  reading a diff afterwards. A row showing a cheap session that then consumed
  an hour of review is not a cheap session, and this table cannot tell you that.
- **Subagent (`Task` tool) usage.** Subagent transcripts are written to separate
  files referenced by the `SubagentStop` hook's `agent_transcript_path`. Usage
  recorded only in those files is not counted in the parent session's row. Rows
  for sessions that delegated heavily under-report real spend.
- **Untagged sessions.** If no `.current-task` file exists and `CLAUDE_TASK_ID`
  is unset, the row is written as `untagged`. It is still an accurate token
  record; it is simply not attributable to a task.
- **Sessions where the hook never fired.** A crash, a `kill`, or a session run
  with hooks disabled leaves no row. Absence of a row is not evidence of absence
  of work.
- **The last turn of a cloud session.** On Claude Code on the web the hook
  writes the row into the session's container, and only a later turn can
  commit it. The closing turn refreshes the row from the transcript before
  committing (`docs/OPERATOR.md` §4), so the committed row is short by that
  turn's final response only. The hook's own final write after that turn is
  never pushed.
- **Cache pricing nuance.** Where a response reports a cache-write total with no
  TTL breakdown, the script prices it at the cheaper 5-minute rate, which
  under-reports if the write was in fact a 1-hour entry.
- **Cost is a list-price reconstruction**, computed by this repo, not an invoice
  from Anthropic. It will not tie out to a billing statement.
