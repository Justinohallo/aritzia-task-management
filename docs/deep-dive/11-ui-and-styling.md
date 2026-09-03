# 11 · UI, components and styling

> **In one paragraph.** The UI is shadcn/ui: Radix primitives for behaviour
> and accessibility, Tailwind CSS v4 for styling, and the component *source*
> copied into `components/ui/` rather than installed, so it is owned and
> editable. A boundary separates those generic primitives from the task
> domain in `components/tasks/`, enforced by a test that reads the import
> graph. Layout is one column that becomes a sticky-form-plus-scrolling-list
> grid at desktop width, and touch targets grow to 44px only on coarse
> pointers.

## The concept: buy the behaviour, own the markup

Component libraries sit on a spectrum. At one end, **headless** libraries
(Radix, Headless UI, React Aria) ship behaviour and accessibility with no
styling. At the other, **packaged** libraries (MUI, Chakra, Ant) ship a
complete visual system and a runtime, and you theme it by overriding. shadcn
is a third thing: a *generator* that copies Radix-based, Tailwind-styled
components into your repository. There is no `@shadcn/ui` package to
upgrade. The components are yours.

[ADR-0003](../adr/0003-component-library.md) makes the case: an accessible
checkbox or toggle group is hard to get right and not worth writing; an
opinionated visual system fights back at the last 10% of brand fidelity,
which is where a fashion retailer cares most. Owning the source with the
behaviour bought is the line between.

## How it is built here

### The stack

| Layer | What | Where |
|---|---|---|
| Behaviour + ARIA | `radix-ui` (the unified package) | Imported inside `components/ui/*` |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss` | `app/globals.css`, class names in markup |
| Variants | `class-variance-authority` (`cva`) | `components/ui/button.tsx`, `badge.tsx`, … |
| Class merging | `clsx` + `tailwind-merge` as `cn()` | `lib/utils.ts` |
| Icons | `lucide-react` | Domain components, always `aria-hidden` |
| Animation utilities | `tw-animate-css` | `app/globals.css` |
| Generator config | `components.json` (style `new-york`, base colour `neutral`, CSS variables on) | Repo root |

Sixteen primitives live in `components/ui/`: alert, badge, button, card,
checkbox, dialog, input, label, live-region, radio-group, select, separator,
skeleton, tabs, toggle, toggle-group. Not all are used; `dialog`, `select`,
`tabs` and `radio-group` were generated with the scaffold and are available.
`live-region.tsx` is the one primitive written by hand ([page 10](10-accessibility.md)).

### A primitive, read closely

```tsx
// components/ui/button.tsx (trimmed)
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium … focus-visible:ring-[3px] … disabled:opacity-50 aria-invalid:border-destructive …",
  {
    variants: {
      variant: { default: "bg-primary text-primary-foreground …", destructive: "…", outline: "…", secondary: "…", ghost: "…", link: "…" },
      size:    { default: "h-9 px-4 py-2", sm: "h-8 px-3", lg: "h-10 px-6", icon: "size-9", "icon-sm": "size-8", … },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
```

Four ideas:

- **`cva`** turns a variant matrix into a function that returns the right
  class string, and `VariantProps` derives the prop types from it, so
  `variant="outlined"` (a typo) is a compile error.
- **`cn()`** is `twMerge(clsx(...))`: `clsx` joins conditional classes,
  `tailwind-merge` resolves conflicts so a consumer's `className="h-11"`
  *replaces* the variant's `h-9` rather than fighting it in the cascade.
  That is what lets the domain components pass `pointer-coarse:h-11` and
  have it win.
- **`asChild` with Radix `Slot`** renders the button's classes and props onto
  its child element instead of a `<button>`, so `<Button asChild><Link/></Button>`
  is a link styled as a button with no nested interactive elements.
- **State via attributes, not props.** `disabled:`, `aria-invalid:` and
  `focus-visible:` variants style the element from its DOM state, so the
  accessibility state and the visual state cannot disagree.

### Tailwind v4 and design tokens

Tailwind v4 is configured in CSS, not in a `tailwind.config.js`:

```css
/* app/globals.css */
@import "tailwindcss";
@theme inline {
  --color-background: var(--background);
  --color-primary: var(--primary);
  --radius-lg: var(--radius);
  …
}
:root { --background: oklch(1 0 0); --primary: …; --radius: 0.625rem; }
.dark { … }
```

`@theme inline` maps Tailwind's utility tokens (`bg-background`,
`text-primary`, `rounded-lg`) onto CSS custom properties defined on `:root`
and `.dark`. Retheming is editing those variables; every primitive picks the
change up because none of them hard-codes a colour. Colours are in `oklch`,
a perceptually uniform space where "10% lighter" means the same thing for
every hue. For a brand-led retailer this is the point ADR-0003 makes: the
tokens *are* the brand, and a component layer that reads them is one you can
theme without overriding.

### The component boundary (`AC-UI-5`, `AC-UI-6`)

The rule: generic primitives in `components/ui/`, task-domain components in
`components/tasks/`, and **no primitive imports from the domain**. A
primitive that imports `types/task.ts` is no longer a primitive; it is a
one-off with a generic name, and the "library" is just a folder.

The rule is a static property of the source tree, so it is asserted from the
source tree:

```ts
// test/quality/component-boundary.test.ts (trimmed)
const DOMAIN_IMPORT = /^@\/(components\/tasks|lib\/(tasks|auth|api)|types|app)(\/|$)/;
it("AC-UI-6: no primitive imports from the task domain", () => {
  const violations = sourceFiles(UI_DIR).flatMap((file) => importsOf(file).filter((s) => DOMAIN_IMPORT.test(s) || s.startsWith("../")));
  expect(violations).toEqual([]);
});
it("AC-UI-5: the brief's controls are rendered through the primitives", () => { /* no bare <button>, <input>, <select> outside components/ui */ });
```

`AC-UI-5` closes the other direction: nothing outside `components/ui/`
renders a native `<button>`, `<input>` or `<select>`, so every control goes
through a primitive and inherits its focus ring, its disabled styling and its
`aria-invalid` treatment.

The boundary is also **the monorepo seam** ADR-0003 names and declines to
cut. `components/ui/` could move to `packages/ui` with an import-path
change. It is not moved, because a monorepo earns its cost at two
consumers and there is one. The seam without the cut is the deliverable.

### Layout and responsiveness (`AC-UI-1..4`)

```tsx
// app/(protected)/tasks/page.tsx
<main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 sm:p-6
                 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:px-8">
  <h1 className="lg:col-span-2">Tasks</h1>
  <div className="min-w-0 lg:sticky lg:top-6"><TaskForm /></div>
  <div className="min-w-0"><TaskList /></div>
</main>
```

Mobile-first: one column up to `lg` (1024px), where the layout becomes a
two-column grid with a fixed-width form that stays in view while the list
scrolls. The DOM order is unchanged, so the form still precedes the list for
a reader and for the keyboard; only the grid placement differs (`AC-UI-3`).

Two details that each fixed a real bug during the responsive pass:

**`min-w-0` on both columns.** A flex or grid item's default `min-width` is
`auto`, which resolves to its content's minimum width. An 87-character
unbroken title therefore *widens the column* past the viewport, and the page
scrolls horizontally at 320px. `min-w-0` lets the column shrink and the
title wrap inside it (`AC-UI-1`).

**`wrap-anywhere` on the title, not `break-words`.** `break-words`
(`overflow-wrap: break-word`) breaks long words *but* does not affect the
element's min-content width, so a flex item still grows to the word's
length before wrapping. `overflow-wrap: anywhere` does affect min-content,
and the row stays inside 320px.

**Touch targets** use the `pointer-coarse:` variant (`@media (pointer: coarse)`),
so a phone gets 44px fields, buttons and filter items while a desktop keeps
the tighter default (`AC-UI-2`). The row's checkbox is 16px visually with a
44px hit box through `before:absolute before:-inset-3.5` (16 + 2 × 14), and
the delete icon button becomes a 44px square with negative margins so the
row's rhythm is unchanged.

These four criteria are `◉`, verified in a real browser, because jsdom does
not lay out. `scripts/responsive-check.mjs` drives Chromium over the DevTools
protocol at 320, 768 and 1024px with coarse-pointer emulation, measures
`scrollWidth`, every control's bounding box, and the two columns' edges, and
writes screenshots. `scripts/responsive-check.md` is the procedure and the
dated record ([ADR-0006](../adr/0006-test-strategy.md), "known gap").

### Empty states, skeletons, badges

The list's skeleton is two `<Skeleton>` blocks with `aria-hidden`, shown
until hydration. Empty states are a dashed border box with a title and a
line of body. Status badges use the `Badge` primitive's `secondary`,
`outline` and `destructive` variants for Completed, Pending and Overdue, with
the word always present ([page 10](10-accessibility.md)).

## The decisions inside

**Why the unified `radix-ui` package rather than `@radix-ui/react-*`?**
Radix consolidated its primitives into one package in 2025 and shadcn's
generator targets it. One dependency to record in the ADR, one version to
track.

**Why keep unused primitives?** They were generated with the scaffold, cost
nothing in the bundle (only imports are bundled), and are the obvious next
reach for a confirmation dialog or a select. Deleting them saves nothing;
the boundary test covers them either way.

**Why `oklch` rather than hex?** Tailwind v4 and shadcn's current defaults
use it. It is what lets a `/40` opacity modifier or a lightness tweak
behave consistently across hues, which matters when the palette is a brand's.

**Why no dark mode toggle?** The tokens for `.dark` exist because shadcn
generates them, and `@custom-variant dark` is wired. Nothing in the brief
asks for a toggle, so there is none; adding one is adding a class to
`<html>`.

## What to discuss

**"Isn't copying components into the repo just vendoring?"** Yes, and that
is the point. Vendoring behaviour would be a maintenance burden; vendoring
*markup and class names* on top of a maintained behaviour package is the
right split. Upstream fixes to Radix arrive via npm; upstream changes to
shadcn's *styling* are yours to adopt or ignore.

**"How would this become a design system?"** Move `components/ui/` to a
workspace package, publish the tokens as a CSS file, add Storybook (P2 in
`PROJECT.md` §7). The boundary test is the thing that makes the move
mechanical.

**"Why Tailwind at all? The classes are long."** They are, and the ADR
names it as polarising. What they buy is co-location (the style is in the
component, not in a file that has to be found), a constrained token
vocabulary (no `#3b3b3b` one-offs), and dead-code elimination for free.
`cva` keeps the long strings in one place per primitive.

## Where to look

- Primitives: `components/ui/*`; the variant pattern in `button.tsx` and `badge.tsx`
- Tokens: `app/globals.css`
- `cn()`: `lib/utils.ts`
- Layout: `app/(protected)/tasks/page.tsx`, `app/(protected)/layout.tsx`
- Touch targets and wrapping: `components/tasks/task-item.tsx`
- Boundary test: `test/quality/component-boundary.test.ts` (`AC-UI-5`, `AC-UI-6`)
- Responsive procedure: `scripts/responsive-check.md`, `scripts/responsive-check.mjs`
