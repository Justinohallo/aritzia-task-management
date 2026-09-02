# `AC-UI-1..4` — manual verification record (T-10)

jsdom does not lay out ([ADR-0006](../docs/adr/0006-test-strategy.md)), so
the four responsive criteria are verified in a real browser rather than in
Jest. This file is the procedure and the date the `ACCEPTANCE.md` legend
requires beside a `◉`; T-11 marks the criteria from it. Re-run the procedure
and append a row whenever `app/(protected)/**` or `components/tasks/**` changes
layout.

## Procedure

1. `TASKS_API_KEY=<any value> npm run build && npx next start -p 3123`
2. `node scripts/responsive-check.mjs http://localhost:3123 --out /tmp/shots`

The script drives the pre-installed Chromium over the DevTools protocol (no
Playwright — no new dependency) at 320, 768 and 1024 CSS pixels with a
coarse-pointer, no-hover, touch emulation. At each width it visits `/login`,
logs in, adds an ordinary task and one with an 87-character unbroken title,
then measures:

| Criterion | Measurement | Passes when |
|---|---|---|
| `AC-UI-1` | `document.documentElement.scrollWidth` and every element's bounding box on `/login` and `/tasks` at 320 | scrollWidth ≤ 320 and no box extends past the viewport (screen-reader-only text excluded: 1px, clipped) |
| `AC-UI-2` | the box of every `a`, `button`, `input`, `radio`, `checkbox`; a `::before` hit box widens the measurement | every control ≥ 44 × 44 |
| `AC-UI-3` | the form and list regions' boxes at 1024 | the list's left edge is at or past the form's right edge — two columns, not one stretched column |
| `AC-UI-4` | the same overflow check at 768 | scrollWidth ≤ 768 and nothing clipped |

Screenshots of both pages at each width are written to `--out` for the eye
check the numbers cannot do: overlap, rhythm, whether the two-column layout
reads as intended.

## Runs

| Date | Commit | 320 | 768 | 1024 | Notes |
|---|---|---|---|---|---|
| 2026-09-02 | T-10 branch, after the `wrap-anywhere` fix | `/login` and `/tasks` scrollWidth 320, nothing clipped; task-page controls 44px+; single column | scrollWidth 768, nothing clipped; single column, main 672px | scrollWidth 1024; form 320px and list 592px side by side in a 1024px main | Before the fix, the long title widened `/tasks` to 721px at 320: `break-words` does not shrink a flex item's min-content width. **`AC-UI-2` fails on four controls outside T-10's lane** — the login fields and button (36px) and Log out (32px) — recorded as `B-22`. Chromium 1194 (Playwright build), headless, device scale 1. |

## What this does not prove

- A real device. Emulation sets the media features and viewport; it does not
  reproduce a phone's browser chrome, safe areas, or zoom. `AC-DEP-1` covers
  the phone.
- Widths between the three named. The layout has one breakpoint (`lg`,
  1024px) and a `sm` padding step; the three named widths sit on each side
  of both.
