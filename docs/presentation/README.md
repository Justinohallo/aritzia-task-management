# The presentation (T-14)

15–20 minutes, engineering audience, built from the specs rather than from
scratch. One set of slides, two renderings:

| File | What it is |
|---|---|
| `index.html` | **The presented version.** Open it in a browser; no server, no build. |
| `aritzia-task-management.pptx` | **The download.** The same deck as PowerPoint, with speaker notes. Linked from the HTML deck's top-right button. |
| `slides.js` | The deck as data: every slide, its speaker notes, and its time budget. Both renderings read this file, so an edit here changes both. |
| `build-deck.cjs` | Renders `slides.js` to the `.pptx` with pptxgenjs. |

## Presenting from `index.html`

| Key | Does |
|---|---|
| `→` `Space` `PageDown` | next slide |
| `←` `PageUp` | previous slide |
| `Home` `End` | first / last |
| `N` | toggle the speaker-notes panel (also a button, top right) |
| `Esc` | overview of every slide; click one to jump to it |
| `T` | reset the elapsed-time clock, top right |

The URL hash carries the slide number (`index.html#7`), so a link lands on
a slide. Printing produces one slide per page.

## Structure and timing

The six sections `docs/TASKS.md` §T-14 requires, in that order, with a
running total of 19¾ minutes across 19 slides:

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
`slides.js` (the `stats` and `chart` slides):

```bash
python3 - <<'EOF'
rows = [l for l in open("docs/LEDGER.md") if l.startswith("| 2026-")]
cells = [[c.strip() for c in r.split("|")[1:-1]] for r in rows]
def f(x):
    try: return float(x)
    except ValueError: return 0.0
print("sessions", len(cells), "total $", round(sum(f(c[11]) for c in cells), 2))
for c in cells: print(c[2], c[11])
EOF
```

## Rebuilding the `.pptx`

pptxgenjs is a docs tool, not an application dependency, so it is not in
`package.json`. Install it anywhere and point Node at it:

```bash
npm install --no-save pptxgenjs@3
node docs/presentation/build-deck.cjs
```

`--no-save` leaves `package.json` and the lockfile untouched. Commit the
regenerated `.pptx` beside `index.html`; the download button is a relative
link and works from a `file://` open with no server.
