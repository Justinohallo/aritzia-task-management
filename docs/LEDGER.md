# Session ledger

One row per Claude Code session. Rows are written automatically by
`scripts/ledger.py`, registered as a `SessionEnd` hook in `.claude/settings.json`
and run by the closing turn against the session transcript. Token counts come from the session transcript's
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
`scripts/ledger.py` on one event:

| Event | Why it is registered |
|---|---|
| `SessionEnd` | Fires on clean session close. The authoritative final write. |

`Stop` was registered originally, for a live row that survived a killed
session, and was removed after T-03: on Claude Code on the web the platform's
own `Stop` hook demands a clean tree, so a row rewritten every turn forced a
commit and push every turn, and every push fed events (CI, deploy-bot comment
edits) that woke the session for another turn. The live row is instead
produced by `--transcript` in the closing turn (`docs/OPERATOR.md` §4).

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

**Decision (ARCH-04, 2026-09-02): the column stays as defined, and it is
honestly empty.** Every Builder row on `main` reads `-` because counting
needs a review pass this operator is not doing: #17 and #18 were merged
three minutes after they were opened, with no diff read. The alternative —
redefining the three counts so a script could derive them from the pull
request (merged clean = accepted, commits after a review comment = edited,
closed unmerged = rejected) — was rejected: on a solo-maintained repository
with zero required reviews it would write `1/0/0` on every merged PR and
present a mechanical fact as a quality signal. A populated column that
measures nothing is worse evidence than an empty one that says why. So:

- `-` in a Builder row means *not counted*, and the row's `notes` say so.
- The quality evidence for the build is **T-13**, the independent QA pass,
  and the `qa_result` column it fills — not this one.
- If a wave is run with the diff actually read, count as `OPERATOR.md` §4
  says and fill the column for that row. A partly-filled column is honest
  as long as each `-` is explained.

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
| 2026-09-01 | db89409f-a272-5522-9262-f14f56e6bd5d | T-16 | - | 23.5 | 10.5 | 0.45 | 1,565 | 54,639 | 344,909 | 2,006,360 | 10.15 | claude-fable-5-1 100% | - | 0 | n/a | spec lint, gate dry-run, same-wave dependencies; tooling only, merged (#11). Closed after the fact from the T-03 kickoff; /task-close was not run. Interventions not counted. |
| 2026-09-01 | 33599ac4-c5de-59b6-87ee-99271d908a0d | T-01 | AC-QUAL-1,AC-QUAL-2,AC-CI-1,AC-CI-2 | 425.2 | 39.3 | 0.09 | 29,210 | 128,977 | 2,287,602 | 129,050,626 | 84.70 | claude-fable-5-1 100% | - | 26 | pass | scaffold, frozen contracts, CI; merged green (#10). Closed after the fact from the T-03 kickoff: /task-close was not run (B-19 fails check 5 for T-01 by construction). Interventions not counted. ARCH-04: roughly $70 of the $84.70 is the ledger-write loop, not the scaffold — 75 `chore: update T-01 ledger row` commits on #10 between 20:02 and 02:49, each push waking the session for another turn (the `Stop` hook, since removed). The build itself is on the order of $15; the row is not split because loop and build share one transcript. |
| 2026-09-02 | a1e2527a-955c-57c7-8a96-ce456825de0b | T-03 | AC-STATE-1,AC-STATE-2,AC-STATE-3,AC-STATE-4,AC-STATE-5,AC-STATE-6,AC-AUTH-10 | 16.4 | 9.1 | 0.56 | 3,739 | 39,766 | 208,398 | 8,493,721 | 8.32 | claude-fable-5-1 100% | - | 35 | pass | provider/reducer/storage/hooks; 35 tests naming all 7 criteria; suite, lint, build and bundle test green. qa_result is the Builder's own gate run: independent QA is T-13. Interventions not counted: the operator ran this session unattended and reviewed no diff mid-session. Also closes T-01/T-16 ledger rows (chore) and records B-20 (nobody mounts TasksProvider). |
| 2026-09-02 | 5df7031d-8f20-55d1-8d5e-6f0ab58fe727 | T-06 | AC-API-3,AC-API-4,AC-API-5,AC-API-10 | 38.5 | 10.6 | 0.27 | 1,920 | 53,250 | 168,781 | 4,028,189 | 7.06 | claude-fable-5-1 100% | 0/0/0 | 43 | pass | T-06 Route Handlers and upstream; merged (#18). Row written from the transcript after merge: /task-close was not run before the PR was merged, so the close turn is not measured here. ARCH-04: the squash-merge subject on main names AC-API-4, AC-API-5, AC-API-10 only; AC-API-3 (the bundle test) is covered by this branch and by this row's criteria_ids but is absent from the subject, which the platform pre-filled from the first commit. A merged subject cannot be changed; this row is the record. B-21 is resolved as AC-API-13, assigned to T-06; the test rename lands in T-17. |
| 2026-09-02 | e5916211-ad34-5f14-9435-50b9d3f5b06c | T-02 | AC-AUTH-1,AC-AUTH-2,AC-AUTH-3,AC-AUTH-4,AC-AUTH-5,AC-AUTH-6,AC-AUTH-7,AC-AUTH-8,AC-AUTH-9,AC-NAV-1,AC-NAV-2,AC-NAV-3,AC-NAV-4 | 45.7 | 11.9 | 0.26 | 2,489 | 58,391 | 358,525 | 4,867,884 | 11.33 | claude-fable-5-1 100% | - | 49 | pass | auth provider over sessionStorage, credential rule, route guards; merged (#17). Row written after merge: /task-close was not run. Interventions not counted. ARCH-04: the squash-merge subject on main names AC-AUTH-2..9, AC-NAV-3..4 only; AC-AUTH-1, AC-NAV-1 and AC-NAV-2 are covered by this branch and by this row's criteria_ids but are absent from the subject, which the platform pre-filled from the first commit. A merged subject cannot be changed; this row is the record. B-20 (nobody mounts TasksProvider) is resolved into T-17. |
| 2026-09-02 | 3e344b0d-83bf-57e5-9b8c-09648b5b8dc6 | ARCH-04 | - | 460.6 | 4.5 | 0.01 | 1,051 | 18,631 | 230,445 | 2,130,321 | 6.08 | claude-fable-5-1 100% | - | 0 | n/a (spec only) | Architect: reviewed wave-0/1 sessions, PRs #10-#19 and BLOCKERS.md; wrote the ARCH-04 entry and T-17 into TASKS.md only. The ARCH-04 amendments themselves (B-18..B-21, OPERATOR.md, interventions decision) are still open. Interventions not counted: findings were accepted as written. |
| 2026-09-02 | 882683e0-e5ef-5e21-895f-72b833cf35db | ARCH-04 | - | 4.0 | 3.8 | 0.95 | 4,496 | 18,577 | 124,237 | 925,757 | 3.69 | claude-fable-5-1 100% | - | 0 | n/a (spec only) | Architect: the ARCH-04 resolution session. B-18..B-21 resolved, OPERATOR.md §5/§6 amended, interventions decided (honesty note), AC-API-13 added, T-01/T-02/T-06 rows annotated. Second ARCH-04 row: the first (3e344b0d) wrote the entry, this one resolved it. No application code. Interventions not counted: items were given as a numbered brief and taken as written. |
| 2026-09-02 | 01a06265-1ff4-74c1-9670-b40169644cd6 | T-17 | - | 32.9 | - | - | - | - | - | - | - | grok-4.6 (not priced; no Claude transcript) | 0/0/0 | 33 | pass | T-17 merge-boundary guards. B-20 TasksProvider mount, B-21 AC-API-13 rename, Repo Guard title/ledger/spec-lint, B-19 ADR-covered deps, task-start open-blocker warning. 33 tests (32 stdlib, 1 Jest). Grok session (grok-4.6): no Claude Code transcript, so token/cost cells are not derived. qa_result is the Builder's own gate; independent QA is T-13. Interventions 0/0/0: operator reported none. |
| 2026-09-02 | 93c56176-3a3b-50a9-a287-30135e7188bf | T-04 | AC-ADD-1,AC-ADD-2,AC-ADD-3,AC-ADD-4,AC-ADD-5,AC-ADD-6,AC-ADD-7 | 11.3 | 4.8 | 0.42 | 1,570 | 22,297 | 207,271 | 2,606,975 | 5.93 | claude-fable-5-1 100% | - | 24 | pass | add-task form and validation module; 24 tests naming all 7 criteria; suite, lint, build and bundle test green. qa_result is the Builder's own gate run: independent QA is T-13. Interventions not counted: the operator ran this session unattended and reviewed no diff mid-session. AC-ADD-7's list marking is T-05's (AC-LIST-4); this row proves creation plus the isOverdue predicate the list consumes. Also closed the T-02 ledger row (chore) so the wave-2 gate would open, and wrapped T-01's page-shell test in TasksProvider (B-20) because the real form reads the hooks. The bundle test needs TASKS_API_KEY in the container and it was unset; run with a dummy value. |
| 2026-09-02 | b1a0b4ed-db3e-5e71-82ca-c34e1f73ec87 | T-07 | AC-API-6,AC-API-7,AC-API-12,AC-API-10 | 6.2 | 3.4 | 0.55 | 834 | 17,654 | 103,460 | 1,253,882 | 3.27 | claude-fable-5-1 100% | 1/0/0 | 27 | pass | typed client + full-jitter retry; MSW draws its own Math.random so the no-random assertion lives in retry.test.ts |
| 2026-09-02 | bde7d8f4-3069-549e-91da-0699f6cedbf5 | T-05 | AC-LIST-1,AC-LIST-2,AC-LIST-3,AC-LIST-4,AC-FILT-1,AC-FILT-2,AC-FILT-3,AC-FILT-4,AC-FILT-5,AC-FILT-6,AC-DONE-1,AC-DONE-2,AC-DONE-3,AC-DEL-1,AC-DEL-3,AC-DEL-4 | 43.9 | 6.2 | 0.14 | 2,405 | 31,917 | 159,649 | 4,833,336 | 6.02 | claude-fable-5-1 100% | 3/1/0 | 24 | pass | T-05 list, filter, complete, delete. Filter held in the URL via next/navigation; tests fake the router hooks and a Chromium run against the production build proved the round trip. A stale local main tripped the ownership check once; refreshed from origin. |
| 2026-09-02 | b6f8dfe6-ea57-5ab9-bc77-c13c9334383a | T-08 | AC-API-1,AC-API-2,AC-API-7,AC-API-8,AC-API-9,AC-API-11,AC-API-12,AC-ADD-8,AC-DEL-2 | 25.8 | 8.7 | 0.34 | 8,067 | 45,398 | 208,966 | 5,152,484 | 7.82 | claude-fable-5-1 100% | - | 30 | pass | T-08 optimistic create/delete; reducer, mutations.ts and component call sites. qa_result is the Builder's own gate run (independent QA is T-13); a Chromium run against next start tripped the deployed limiter and recovered. Interventions not counted: the operator ran this session unattended and sent /task-close without the three answers; no diff was reviewed mid-session. Stale local main tripped the ownership check once; refreshed from origin. Tests added 30 (29 net: the wave-1 no-op reducer test was replaced). |
| 2026-09-02 | 3718e3d0-6656-52dc-b942-a68fcbe82098 | T-09 | AC-A11Y-1,AC-A11Y-2,AC-A11Y-3,AC-A11Y-4,AC-A11Y-5,AC-A11Y-6 | 17.9 | 9.0 | 0.50 | 6,631 | 44,037 | 144,372 | 5,820,288 | 6.61 | claude-fable-5-1 100% | - | 23 | pass | T-09 accessibility pass: criterion-named suite for AC-A11Y-1..6 and focus management when a row leaves the view; semantics were already in place from T-02/T-04/T-05/T-08. AC-A11Y-4 keyboard walk run twice against the production build in Chromium via Playwright, 26 stops, procedure in test/a11y.test.tsx header for QA to transcribe as the manual record. interventions declined: autonomous cloud session with no operator turns to count against proposals. qa_result is the Builder's own gate run; independent QA is T-13. |

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
