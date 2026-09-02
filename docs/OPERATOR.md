# OPERATOR.md — running the build from Claude Code on the web

> **Who this is for:** the one human on the project. Every other document in
> `docs/` tells an agent what to build. This one tells you how to start,
> steer, close, and merge the sessions that build it, using
> [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
> (claude.ai/code, or the Code tab in the mobile app).
>
> **Verified against:** this repository's hooks and skills as of 2026-09-01,
> run inside a cloud session. Where the cloud behaves differently from the
> local ritual in `CLAUDE.md`, §7 says so.

---

## 1. The shape of it

One task is one cloud session is one branch is one pull request is one ledger
row. You never write code. Your job per task is four messages and three clicks:

| Step | You | The session |
|---|---|---|
| **Start** | Pick repo, `main`, environment, mode. Paste the Builder prompt for `T-NN`. | Runs `/task-start T-NN`, reads the ADRs it names, builds, commits with criterion IDs, pushes. |
| **Steer** | Read the diff. Leave inline comments. Count interventions as you go. | Fixes, pushes again. |
| **Close** | Send `/task-close` with the three answers. | Runs the checks, annotates the ledger row, commits it, pushes. |
| **Merge** | **Create PR** with a title that carries the criterion IDs. Wait for green. Squash-merge. | Done. The row lands on `main`, which is what opens the next wave. |

Three sessions at once, one per task in the wave, is the plan in
[`TASKS.md`](TASKS.md#running-in-parallel). You are the wave gate: nothing in
wave *N+1* starts until every wave-*N* pull request is merged and `main` is
green. `task-start` enforces it by reading the ledger, so if you skip
`/task-close` on one task, the next wave refuses to open.

## 2. One-time setup

Do these once. Everything in §3 onward assumes they are done.

- [ ] **GitHub connected** at [claude.ai/code](https://claude.ai/code). The
      Claude GitHub App is installed on this repository if you want Auto-fix
      (§5) — otherwise it is optional.
- [ ] **Environment:** `Default`, network access **Trusted**. That reaches npm
      and GitHub, which is all any task here needs. No setup script is needed
      before T-01; after T-01 lands, one line `npm install` in the **Setup
      script** field makes every later session start with `node_modules`
      cached (see §7).
- [ ] **Do not set `CLAUDE_TASK_ID` as an environment variable.** Variables
      are per environment, not per session, so every session would be
      attributed to the same task. The task is claimed inside the session
      instead (§3).
- [ ] **Branch ruleset on `main`** per [`REPO-PROTECTIONS.md`](REPO-PROTECTIONS.md):
      required approvals `0` while solo, status checks required, *require
      branches to be up to date* on. The last one is what forces the second
      and third pull requests in a wave to rebase before they merge.
- [ ] **Vercel** connected and `TASKS_API_KEY` set in Vercel's encrypted
      environment — this is *your* hand-off step at the end of T-01
      ([`TASKS.md`](TASKS.md#t-01--scaffold-contracts-and-ci)). Never in the
      cloud environment's variables, which anyone using the environment can
      read; never in the repo.

## 3. Start a session

At [claude.ai/code](https://claude.ai/code):

1. **Repository selector** below the input box → `Justinohallo/aritzia-task-management`.
2. **Branch selector** → `main`. Always `main`, never another session's
   branch ([`TASKS.md`](TASKS.md#rules-for-concurrent-agents) rule 1).
3. **Environment** → `Default`.
4. **Mode dropdown** → **Accept edits**. Not **Plan**: it stops and waits for
   you before every edit, which turns a 75-minute task into a day of
   approvals. The guardrails here are the hooks and the skills, not the
   permission prompt. **Auto** is fine if it is offered.
5. Paste the prompt. Press Enter.

The session clones `main` fresh, runs the repo's `SessionStart` hook (which
fetches `origin/main` so `task-close` can diff against it, and reminds the
agent that no task is claimed yet), then reads the prompt.

### The Builder prompt

Replace `T-NN`. Nothing else needs changing per task — the skill prints the
criteria, the owned files, and the ADRs.

```
You are the Builder for T-NN. Read CLAUDE.md first.

1. Run /task-start T-NN. Read every ADR it lists in full before writing anything.
2. Build exactly what TASKS.md and ACCEPTANCE.md specify for this task, with
   tests that name their criterion IDs. Write only the files task-start says
   this task owns.
3. Commit as you go with Conventional Commits and the criterion IDs in
   brackets. Push after every commit.
4. If the spec is ambiguous, contradictory, or would require writing a file
   this task does not own, stop: append a row to docs/BLOCKERS.md, push, and
   tell me — that is a blocker for the Architect. Do not edit any other file
   under docs/ and do not change the spec to match what you built.
5. When the task's "Done when" line holds, report what you built, what you
   tested, and anything you were unsure about. Do not run /task-close yet.
```

The last line is deliberate. Closing is a separate turn (§4) because the
ledger row for a turn is written *after* the turn ends.

### The two other roles

**Architect** — for a blocker, a spec finding, or a new task. Start a fresh
session from `main`:

```
You are the Architect. Read CLAUDE.md. Do not write application code.
Resolve blocker B-NN in docs/BLOCKERS.md (raised by the T-NN Builder).
Amend the spec (docs/PROJECT.md, docs/ACCEPTANCE.md, docs/adr/, docs/TASKS.md)
in its own docs: commit, fill in the row's Resolution and Commit columns,
push, and tell me what changed and which open sessions need to rebase.
```

Set the task before it starts: `scripts/task.sh ARCH-NN` (the skill is
Builder-only). Architect sessions get an `ARCH-` row in the ledger, as the
existing ones do.

Title the Architect's pull request with the `ARCH-NN` and the blocker IDs,
not a `T-NN`: Repo Guard reads any `T-NN` in a title as a Builder PR and
demands that task's ledger row (`B-23`). Name the task in the body.

**QA** — T-13 only, and only after T-12 is merged. Fresh session, from `main`,
no shared context with any Builder:

```
You are QA for T-13. Read CLAUDE.md. Run scripts/task.sh T-13.
Verify every criterion in docs/ACCEPTANCE.md against the deployed build at
<Vercel URL> and the test suite on main. For each criterion report met,
partially met, or not met, naming the test that proves it — or, for the
seven ◉-eligible criteria, the manual procedure and date. Write no
application code and no spec. Append each finding as a row in
docs/BLOCKERS.md; the Architect turns them into tasks.
```

### Starting from the terminal instead

Same thing, from a checkout of `main` on your machine:

```bash
claude --cloud "$(cat prompt.txt)"
```

Three of those in a row start a wave. `/tasks` in a local `claude` lists them.
To steer one later without opening the browser:

```bash
claude -p "your message" --cloud <session-id>
```

## 4. While it runs, and closing

**Watch the diff indicator** (`+42 -18`). Open it, select a line, type, press
Enter — comments queue and go out with your next message. That is the
intervention channel, and the count is the number you will be asked for.

**Count as you read.** Against *proposals the session made*, not messages:
a diff you took as-is is `accepted`, one you had it change is `edited`, one
you had it drop or reverse is `rejected` ([`LEDGER.md`](LEDGER.md#what-interventions-counts)).
Keep a tally in the session title or a note; the transcript cannot report it
and the skill refuses to guess.

**When the session reports done**, the branch is already pushed. Send the
close turn as **one message** — the three answers in it, so the skill does not
have to end its turn to ask and then start another:

```
/task-close — interventions 5/2/0, tests added 9, qa pass,
notes: "<one line: what was hard, or anything the row should record>".
Before committing, refresh this session's ledger row from the transcript
(python3 scripts/ledger.py --transcript <this session's .jsonl>), then commit
docs/LEDGER.md with the subject the skill prints, and push.
```

Why the refresh line: the ledger is written on `SessionEnd` only (see
`LEDGER.md`, "The capture mechanism", for why not on `Stop`), so without it
nothing would be committed at all. With it, the committed row is short by only
the final response. That last sliver is
never captured in a cloud session; it is recorded as a known gap in
[`LEDGER.md`](LEDGER.md#what-this-ledger-cannot-measure).

If `task-close` fails a check, it prints why and writes nothing. The two you
will actually see:

| It says | It means |
|---|---|
| `written outside this task's lane` | The session touched a file another task owns. Do not tell it to widen the lane. Have it revert the file, or treat it as a blocker for the Architect. |
| `the last row in docs/LEDGER.md is X, not Y` | The session merged `main` and another task's row is now last. Tell it to annotate by session id, as the message says. |

## 5. Review and merge

1. Open the diff one more time. Then **Create PR** at the top of the diff view.
2. **Title it as the commit that will land.** `main` is squash-merged with the
   PR title as the subject ([`CONTRIBUTING.md`](../CONTRIBUTING.md#merging)),
   and rule 3 in `CLAUDE.md` says every commit touching application code names
   a criterion. So:

   ```
   feat(tasks): T-04 add-task form with validation [AC-ADD-1..7]
   ```

   A title without the IDs puts an unattributed commit on `main` for good.

   **The bracketed set is the union of the criterion IDs across every commit
   on the branch, not the first commit's.** The platform pre-fills the title
   from the first commit only, so a branch whose later commits added
   criteria lands short unless you widen the brackets by hand. That is how
   #17 reached `main` without `AC-AUTH-1`, `AC-NAV-1..2` and #18 without
   `AC-API-3` (ARCH-04). Run `git log origin/main.. --format=%s` on the
   branch, or read the commit list on the PR, and take every ID you see.
   After T-17, Repo Guard fails a title whose set is not that union.
3. Fill in the PR template's *How this was verified*. The session's done
   report has the content.
4. Wait for **Repo Guard** and, after T-01, the CI workflow (typecheck,
   lint, test, then `next build` and the `AC-API-3` bundle test). Red CI: open the
   CI status bar and turn on **Auto-fix**, or paste the failure into the
   session. The session stays live after the PR exists.
5. **Squash and merge.** Branches delete themselves.

Merging the second and third PRs of a wave: the ruleset requires the branch
to be up to date, so use GitHub's **Update branch** or tell the session to
merge `origin/main`. `docs/LEDGER.md` will conflict every time. The
resolution is always the same and the session knows it: keep both rows,
ordered by timestamp. Never drop a row.

## 6. Running a wave

```
                ┌── session A: T-02 ──┐
main ─ gate ────┼── session B: T-03 ──┼──── merge 02, then 03, then 06 ─── gate ─── next wave
                └── session C: T-06 ──┘
```

0. **Open [`BLOCKERS.md`](BLOCKERS.md).** Every row whose Resolution is
   `open` is resolved in an Architect session before wave *N+1* starts —
   one `docs:` commit, on the pattern of ARCH-03 and ARCH-04. Builders
   append rows and cannot close them; a wave that opens over an open row
   builds on a spec someone has already said is wrong. (ARCH-04: four rows
   sat open through wave 1 because this step did not exist. After T-17,
   `task-start` prints the open rows, but it warns rather than refuses.)
1. Confirm the gate: every PR of the previous wave is merged and `main` is
   green. `task-start` will refuse otherwise, but check first — a refused
   session is a wasted spin-up.
2. Start the wave's sessions back to back, each from `main`, each with its
   own Builder prompt. `TASKS.md` caps it at three.
3. Close and merge in ascending task number. Later PRs update from `main`
   before merging.
4. The wave is closed when the last PR is in. Only then start the next.

Wave 4 has a special case: T-09 merges before T-10, and T-10 rebases. Wave 5
is a chain (T-11 → T-12 → T-13) with T-14 running alongside it; T-14 is a
wave-5 task since ARCH-03 (it sat at "wave 4–5", which deadlocked the gate).

## 7. What is different in the cloud

`CLAUDE.md` and `TASKS.md` were written for a terminal. These are the places
the cloud does not match, and what to do about each.

| Local ritual | In a cloud session | What you do |
|---|---|---|
| `/clear` between tasks | Not available. | Nothing — one session per task is the natural unit. Never send a second task to a finished session. |
| `feat/t-05-list` branch names (`TASKS.md` rule 1) | The platform names the branch `claude/<slug>-<suffix>` and the git proxy only allows pushes to that branch. | Accept it. Attribution comes from the ledger row and the PR title, not the branch name. Resolved as `B-16`: rule 1 and `CONTRIBUTING.md` now accept platform-named branches. |
| `.current-task` persists between sessions on your disk | The container starts clean every session. | The Builder prompt runs `/task-start` first. An untagged row means the prompt was not followed — say so in that row's `notes`, do not hand-edit `task_id`. |
| `main` is on disk | The clone has only the session branch. | The `SessionStart` hook fetches `origin/main`. Without it `task-close` cannot find the base and fails. |
| The ledger row is written by a hook while you are in the session | The platform's `Stop` hook demands a clean tree every turn, so a per-turn ledger write forced a push per turn and every push woke the session again. | The ledger writes on `SessionEnd` only; the close turn refreshes and commits it (§4). Never subscribe a Builder session to its PR's activity — merging is yours (§5). |
| `npm install` once | Fresh VM each session. | After T-01: `npm install` in the environment's **Setup script**. It runs once and is cached for about a week. |
| A plan file and a chat | The session has no memory of any other session. | Every prompt names the task and points at `CLAUDE.md`. Cross-session state lives in `main`: the ledger, the spec, the code. |

## 8. When it goes wrong

- **Session shows *expired*.** The VM was reclaimed after idling. Reopen it —
  the conversation is restored on a fresh VM, uncommitted work is not. Send
  `git status`, then `scripts/task.sh T-NN` again (the claim file is gone),
  then carry on.
- **`task-start` refuses: `is in wave N, and … are not closed`.** A previous
  wave's task has no annotated row on `main`. Usually its `/task-close` was
  skipped or its PR is unmerged. Fix that, do not override.
- **The session edited `docs/`.** A Builder that amends the spec has removed
  the only independent check on its own work. Have it revert the change and
  state the finding instead; take the finding to an Architect session.
- **The ledger row is `untagged`.** The session never claimed a task, and
  `task_id` is a measured column that `--annotate` refuses to touch. Have the
  session run `scripts/task.sh T-NN` and refresh the row from the transcript;
  the hook re-reads the claim file, so the next write carries the right
  `task_id`. If the row has already merged, record the task in its `notes`.
- **Two tasks ended up in one session.** Do not split the numbers. Note it in
  the row (`CLAUDE.md` rule 2).
- **You want to take over locally.** From a clean checkout of this repo:
  `claude --teleport <session-id>`. It fetches the branch and loads the
  conversation. The cloud session keeps running independently after that, so
  pick one and stay there.
- **Auto-fix replied on your behalf.** It posts as your GitHub account,
  labelled as Claude Code. Fine here; worth knowing before the panel reads the
  PR history.

## 9. Not covered here

Routines and scheduled sessions, agent teams, and self-hosted environments —
none of them is on the plan. If T-14 wants numbers this document does not
produce, the ledger is the source, not the session list.
