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
  base input rate. Quoting a single "total tokens" number makes a session look
  an order of magnitude larger than its economics. Read the four token columns
  as four different things, not as addends.
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

## Ledger

| date | session_id | task_id | criteria_ids | wall_clock_min | api_time_min | leverage_ratio | input_tokens | output_tokens | cache_write_tokens | cache_read_tokens | api_cost_usd | models (% of cost) | interventions (accepted/edited/rejected) | tests_added | qa_result | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-08-31 | unrecorded (pre-hook) | SETUP-01 | - | 10.0 | 4.0 | 0.40 | 208 | 587 | 885,800 | 9,700,000 | 3.02 | unverified (no transcript) | - | - | - | backfilled from /cost; repo init, branch protection. Cost is as /cost reported it; it does not reconcile with Opus 5 list pricing for these counts (see `--selfcheck`). |
| 2026-08-31 | 89cb008a-f78d-5c8f-bef3-e68cab039af7 | LEDGER-01 | - | 12.2 | 8.2 | 0.67 | 52 | 40,045 | 205,310 | 2,704,523 | 4.41 | claude-opus-5 100% | - | - | - | ledger system build + per-model breakdown; row written by the hook itself |

## What this ledger cannot measure

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
- **Cache pricing nuance.** Where a response reports a cache-write total with no
  TTL breakdown, the script prices it at the cheaper 5-minute rate, which
  under-reports if the write was in fact a 1-hour entry.
- **Cost is a list-price reconstruction**, computed by this repo, not an invoice
  from Anthropic. It will not tie out to a billing statement.
