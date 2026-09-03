# The presentation (T-14, served by T-18)

15–20 minutes, engineering audience, built from the specs rather than from
scratch. One set of slides, two renderings, both served by the app:

| Where | What it is |
|---|---|
| `/presentation` on the deployed app | **The presented version.** `app/presentation/page.tsx` renders the deck in the browser; it sits outside the protected layout, so no login is needed. |
| `/presentation/aritzia-task-management.pptx` | **The download.** The same deck as PowerPoint with speaker notes, committed at `public/presentation/` and linked from the page's top-right button. |
| `app/presentation/slides.ts` | The deck as data: every slide, its speaker notes, and its time budget. Both renderings read this file, so an edit here changes both. |
| `app/presentation/deck.tsx` | The client component that renders the slides, with its own stylesheet `deck.module.css`. |
| `build-deck.mjs` (this folder) | Renders `slides.ts` to the `.pptx` with pptxgenjs. |

Q-2 in `PROJECT.md` defaulted to keeping the slides out of the repository.
The operator reversed that on 2026-09-02: the deck is presented from the
live URL, so it ships with the app (`B-28` asks the Architect to restate
Q-2 and give the route a criterion).

## Presenting from `/presentation`

| Key | Does |
|---|---|
| `→` `Space` `PageDown` | next slide |
| `←` `PageUp` | previous slide |
| `Home` `End` | first / last |
| `N` | toggle the speaker-notes panel (also a button, top right) |
| `Esc` | overview of every slide; click one to jump to it |
| `T` | reset the elapsed-time clock, top right |

The URL hash carries the slide number (`/presentation#7`), so a link lands
on a slide and the browser's back button steps back through the slides
visited. Printing produces one slide per page.

## Structure and timing

The six sections `docs/TASKS.md` §T-14 requires, in that order, with a
running total of 19¾ minutes across 19 slides (a test holds the total
inside the brief's 15–20 minute window):

| # | Section | Slides | Min |
|---|---|---|---|
| — | Title | 1 | ½ |
| 1 | The proportionality answer: the NOT list, the monorepo declined, where the seam is | 2–4 | 2½ |
| — | The spine: each requirement as the miniature of a checkout problem | 5 | 1 |
| 2 | Requirement → criterion → test → commit, traced live for `AC-API-9` | 6–7 | 3 |
| 3 | The API simulation: server-side key, 429, full jitter, optimistic rollback | 8–11 | 5 |
| 4 | Build vs buy, and the two deliberate declines | 12–14 | 3¼ |
| 5 | The ledger: cost, cost per task, and the empty intervention column | 15–17 | 3 |
| 6 | What I would do next | 18 | 1 |
| — | Close | 19 | ½ |

The live trace on slide 7 runs this in a terminal on the repo:

```bash
git grep -n "AC-API-9" -- test/ lib/ docs/ACCEPTANCE.md
```

and then walks the deployed app: add a task, delete it, and delete five
more within ten seconds so the fixed-window limiter (5 requests per 10 s,
`Retry-After: 3`) produces a visible 429 path and rollback.

## The two injections

`TASKS.md` §T-14 names two numbers that arrive after the build: the ledger
totals and the QA result. Both are on the section-5 slides and quoted from
`docs/LEDGER.md` and `docs/ACCEPTANCE.md` as of `main` `fb7e61f`
(2026-09-02). After T-15 closes, re-derive them and edit the values in
`app/presentation/slides.ts` (the `stats` and `chart` slides), then rebuild
the `.pptx` as below.

To re-derive the totals, sum the `api_cost_usd` column of the ledger rows
(every line of `docs/LEDGER.md` that starts with `| 2026-`); the per-task
bar chart takes each Builder row's value, with T-01 quoted net of the ~$70
write loop ARCH-04 describes.

## Rebuilding the `.pptx`

pptxgenjs is a docs tool, not an application dependency, so it is not in
`package.json`. Install it without recording it, then run from the repo
root on Node 22.18 or later (it imports `slides.ts` directly and relies on
Node's type stripping):

```bash
npm install --no-save pptxgenjs@3
node docs/presentation/build-deck.mjs
```

`--no-save` leaves `package.json` and the lockfile untouched. Commit the
regenerated file at `public/presentation/aritzia-task-management.pptx`.
