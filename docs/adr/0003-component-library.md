# ADR-0003 — shadcn/ui over a packaged component library

**Status:** Accepted · **Date:** 2026-09-01 · **Criteria:** `AC-UI-5..6`, `AC-A11Y-1..6`

## Context

The brief: *"Build UI components using a React component library of your
choice (eg. Shadcn)."*

Shadcn is named as an example, so it is the safe choice, but "of your choice"
invites a defended one. The application needs buttons, text and date inputs, a
checkbox, a filter control, and status messaging — a small surface, but one
where the accessible behaviour is disproportionately hard relative to how it
looks.

## Decision

**shadcn/ui** (Radix UI primitives + Tailwind CSS), with a component boundary:
generic primitives in `components/ui/`, task-domain components separately, and
no primitive importing from the domain (`AC-UI-6`).

## Build vs. buy

This is the most interesting build-vs-buy line in the project, because shadcn
is neither.

**Do not build.** An accessible date input, checkbox, and dismissible alert
region are not hard to render and are genuinely hard to get right — focus
management, `aria-*` wiring, escape handling, screen-reader announcement order.
Hand-rolling them would consume most of a two-day budget and produce something
worse than Radix, which has had those edge cases beaten out of it in
production. Writing them from scratch would demonstrate the opposite of the
judgment being assessed.

**Do not buy a packaged library either.** MUI or Chakra ship a themeable design
system and a runtime with it. Overriding an opinionated visual language is
slow, and it fights back at exactly the point a brand-led retailer cares most —
the last 10% of visual fidelity.

**shadcn is the third option: buy the behaviour, own the source.** The
components are copied into the repository rather than installed. Radix provides
the accessibility primitives as a dependency; the markup and styling are ours,
editable in place, with no override layer and no version-upgrade negotiation
with someone else's design opinions.

For Aritzia specifically that is the right shape. A fashion retailer's identity
*is* the product — typography, spacing, and restraint are not decoration. A
component layer you own and theme through design tokens serves that; a library
whose defaults you spend the sprint overriding does not.

## Consequences

**Good.** Accessibility comes largely from Radix, which makes `AC-A11Y-1..6`
achievable in the time available. Tailwind tokens map directly onto brand
tokens. Bundle cost is only what is imported.

**Bad.** Copied-in components are ours to maintain — upstream fixes do not
arrive automatically. Tailwind's utility classes in markup are polarising, and
without the `AC-UI-6` boundary the copied primitives drift into domain-aware
one-offs, at which point the "library" is just a folder.

## The monorepo seam

`AC-UI-6` exists so that `components/ui/` could be lifted into a `packages/ui`
workspace with a move and an import-path change. That extraction is
deliberately **not** being done.

A monorepo earns its cost at two deployables or two consumers of a shared
package. This project has one application. Adding Turborepo would mean build
orchestration, workspace config, and dependency hoisting in service of a single
consumer — the exact over-engineering the project's top risk names
(`PROJECT.md` §8).

Respecting the boundary now costs nothing and makes the split mechanical the
day a second consumer — a storefront, an internal admin, a design-system
package — actually appears. Naming the seam and declining to cut it is the
decision; the seam without the cut is the deliverable.

## Alternatives considered

**MUI / Chakra / Ant.** Faster to a generic-looking result, slower to a
branded one. Rejected on the brand-fidelity argument above.

**Radix primitives with no shadcn layer.** Same accessibility, but all styling
written from zero. shadcn's value is precisely that first styling pass, and
declining it buys nothing.

**Headless UI + Tailwind.** Viable and close. shadcn wins on breadth of
components and on being the example the brief itself names — a tie broken by
the requirement.

**Storybook on top.** Genuinely valuable at a design-system-led brand, and the
natural companion to an owned component layer. Deferred to P2: it presents
components rather than shipping the application, and the deadline does not
fund both.
