# 10 · Accessibility

> **In one paragraph.** Accessibility here is mostly structural: native
> controls with real labels, errors associated to their fields with ARIA,
> status conveyed by words and not colour, and a single live region that
> every asynchronous outcome is announced through. The two pieces that needed
> engineering are the live-region bus, a module-level publish/subscribe so
> non-component code can announce, and focus management, which moves a
> keyboard user's focus to a neighbouring row when the row they were on
> leaves the view. `jest-axe` catches the mechanical half; a recorded manual
> keyboard walk covers the judgement half.

## The concept: the accessibility tree is the second UI

A browser maintains two trees: the DOM, which is painted, and the
accessibility tree, which is what a screen reader, a switch device or a
voice-control tool navigates. Every control has a *role* (button, checkbox,
radio), a *name* (its label), and a *state* (checked, disabled, invalid,
busy). Most accessibility work is making sure the second tree says the same
thing the first one shows. Three rules cover most of it:

1. **Use the native element.** A `<button>` is focusable, activates on Enter
   and Space, and has the button role. A `<div onClick>` has none of that.
2. **Name everything.** A label the user can see, or an `aria-label` /
   `aria-labelledby` when the visible text is not the control's own.
3. **Say it, don't just show it.** A change that happens away from focus
   (a row vanishing, a request failing) must be announced, because a screen
   reader only reads what focus is on.

The third rule is where live regions and focus management come in.

## How it is built here

### Labels and roles (`AC-A11Y-1`)

Every input has a `<Label htmlFor>`. The checkbox in a row is labelled by
the task's title via `aria-labelledby`, so its accessible name *is* the task
and toggling it reads "Buy milk, checkbox, checked". The delete button's
`aria-label` is `Delete Buy milk`. The filter group has `aria-label="Filter
tasks"` and its items are radios named All, Pending, Completed. The two
`<section>`s on the tasks page have visually hidden headings ("Add a task",
"Your tasks") via `aria-labelledby`, so a screen-reader user can jump between
regions by heading.

Radix supplies the hard parts: the checkbox is a `role="checkbox"` button
with `aria-checked` and keyboard handling; the toggle group is a
`role="radiogroup"` with roving tabindex, so the group is one Tab stop and
arrow keys move within it ([page 11](11-ui-and-styling.md)).

### Errors are programmatically associated (`AC-A11Y-2`)

```tsx
// components/tasks/task-form.tsx
<Input id={titleId} aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? errorId("title") : undefined} />
{errors.title ? <p id={errorId("title")} className="text-sm text-destructive">{errors.title}</p> : null}
```

`aria-invalid` sets the state; `aria-describedby` links the field to the
message's `id`, so a screen reader reads the error when focus lands on the
field. The `undefined` (rather than `false`) when there is no error removes
the attribute entirely, which is the correct "not invalid" rather than
`aria-invalid="false"`. Both forms set `noValidate` so the browser's own
tooltip validation, which is inconsistent across screen readers, does not
compete with the one message. The login form's failure is a `role="alert"`
region (`AC-AUTH-3`), read immediately.

`useId()` generates the ids. It is stable between server and client render,
which a counter or `Math.random()` would not be, so it does not cause a
hydration mismatch.

### The live region bus (`AC-A11Y-3`, `AC-API-11`, `AC-DEL-2`, `AC-FILT-6`)

```tsx
// components/ui/live-region.tsx (trimmed)
const listeners = new Set<Listener>();

export const announce: Announce = (message, options) => {
  listeners.forEach((l) => l({ message, assertive: options?.assertive ?? false }));
};
export function useAnnounce(): Announce { return announce; }

export function LiveRegion() {
  const [polite, setPolite] = useState({ text: "", nonce: 0 });
  const [assertive, setAssertive] = useState({ text: "", nonce: 0 });
  useEffect(() => {
    const listener = ({ message, assertive }) => (assertive ? setAssertive : setPolite)((prev) => ({ text: message, nonce: prev.nonce + 1 }));
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return (
    <>
      <div role="status" aria-live="polite"    aria-atomic="true" className="sr-only"><span key={polite.nonce}>{polite.text}</span></div>
      <div role="alert"  aria-live="assertive" aria-atomic="true" className="sr-only"><span key={assertive.nonce}>{assertive.text}</span></div>
    </>
  );
}
```

An `aria-live` region is an element whose text changes are read aloud even
when it does not have focus. `polite` waits for the current utterance to
finish; `assertive` interrupts. `aria-atomic="true"` reads the whole region
rather than the diff. The region is visually hidden with `sr-only` (clipped
to 1px, not `display: none`, which would remove it from the accessibility
tree too).

Four design decisions:

**Mounted once.** In the protected layout, inside the guard
([page 02](02-nextjs-app-router.md)). Multiple live regions compete, and
which one a screen reader reads is undefined. One region, one announcement
mechanism, and no task after wave 0 creates another (`B-07`).

**A bus, not a context.** `announce` is a module-level function that fans
out to every mounted region. Contexts require a component tree; the
mutation sequences in `lib/tasks/mutations.ts` are plain async functions
and need to announce from outside React. A bus also lets `useAnnounce`
return a stable reference, safe in effect dependency lists. Announcements
made while no region is mounted are *dropped*, not queued: a message about
something that happened before the page existed is noise.

**Two regions, two urgencies.** Routine outcomes ("added", "deleted",
"marked complete") are polite. Failures are assertive: the user needs to
know now that the row they saw appear has been taken back.

**The nonce remount.** A live region only announces on *change*. If the same
message is set twice ("Buy milk deleted" then, after a rollback and retry,
"Buy milk deleted" again), the DOM text is unchanged and nothing is read.
The usual workaround is a timer that clears the region and refills it,
which is fragile. Here a `key` on the inner `<span>` changes on every
announcement, so React unmounts and remounts the text node, and the region
sees a change every time, with no timer.

### Focus follows a row that leaves (`AC-A11Y-4`)

When a keyboard user activates Delete on a row, or ticks a task under a
filter that hides it, the element they were focused on is removed from the
DOM. The browser drops focus to `<body>`: not trapped, but *lost*, and the
next Tab starts from the top of the page. For a sighted mouse user nothing
is wrong; for a keyboard user it is a page reset on every action.

```ts
// components/tasks/task-list.tsx (trimmed)
const planFocus = useCallback((task: Task, control: "completed" | "delete") => {
  const row = sectionRef.current?.querySelector(`[data-task-id="${task.id}"]`);
  if (!row || !row.contains(document.activeElement)) return;   // pointer user: leave focus alone
  const index = visible.findIndex((t) => t.id === task.id);
  focusIntent.current = { leavingId: task.id, neighbourId: neighbourOf(visible, index)?.id ?? null, control };
}, [visible]);

useEffect(() => {
  const intent = focusIntent.current;
  if (!intent || !root) return;
  if (root.querySelector(`[data-task-id="${intent.leavingId}"]`)) return;   // still here; the intent stands
  focusIntent.current = null;
  const neighbour = intent.neighbourId && root.querySelector(`[data-task-id="${intent.neighbourId}"] [data-control="${intent.control}"]`);
  const target = neighbour && !neighbour.matches(":disabled") ? neighbour : root.querySelector('[role="radio"][aria-checked="true"]');
  target?.focus();
});
```

The mechanism in three steps:

1. **Plan before the row goes.** While the row is still on screen, record
   *where focus should land*: the matching control on the next row, else the
   previous row, else nowhere (`neighbourOf`). Only if focus is actually
   inside the leaving row. A pointer user's focus is left where it is.
2. **Wait for the render that removes it.** An effect with no dependency
   array runs after every commit. If the leaving row is still in the DOM (a
   delete that was declined, a filter change that kept it), the intent
   stands. Once it is gone, the intent is spent.
3. **Land.** The neighbour's control, unless it is disabled (a neighbour
   whose own create is in flight has a disabled delete; its checkbox never
   is), else the active filter radio. Never `<body>`.

"Next, else previous" means repeated Delete walks down the list and the last
row hands back to the one above it, which is the behaviour of every native
list control.

This is the one `◉` criterion in the accessibility set. jsdom does not paint
a focus ring and cannot say whether focus *looks* visible, so `AC-A11Y-4` is
proven twice: `test/a11y.test.tsx` asserts `document.activeElement` after
each removal, and a recorded keyboard walk in Chromium (26 stops, the
procedure in that file's header) confirms the ring is painted at every one.

### No colour-only meaning (`AC-A11Y-5`, `AC-LIST-4`)

Completed is a strikethrough *and* a "Completed" badge *and*
`aria-checked`. Overdue is a red badge *and* the word "Overdue" *and* an
icon. Syncing is a spinner *and* the word "Saving…" *and* `aria-busy`. Every
icon is `aria-hidden`, so the word is what is read. The active filter is
`aria-checked`, not a highlight.

### Automated checks (`AC-A11Y-6`)

```ts
expect(await axe(container)).toHaveNoViolations();
```

`jest-axe` runs axe-core against the rendered DOM of both pages and fails on
any rule violation: missing labels, invalid ARIA, contrast where it can be
computed, duplicate ids. One assertion per page, in `test/a11y.test.tsx`. It
catches the mechanical half. It cannot judge whether a label is
*meaningful*, whether announcement order is sensible, or whether focus is
visible, which is why the manual walk exists.

### Touch targets (`AC-UI-2`)

Not strictly ARIA, but the same audience. On a coarse pointer every control
is at least 44 × 44 CSS pixels (the WCAG 2.5.5 / Apple HIG figure). Tailwind's
`pointer-coarse:` variant applies it only on touch devices, so a mouse user
keeps the primitive's default density. The row's checkbox stays 16px visually
and gains a 44px hit area through a `::before` box (`before:-inset-3.5`).
See [page 11](11-ui-and-styling.md).

## The decisions inside

**Why is the live region inside the auth guard?** Because it is mounted by
the protected layout, and the login page's only announcement is a
`role="alert"` on the form. Announcing on a page the user cannot see would
be noise.

**Why not `aria-live` on the list itself?** A live region on a list reads
the *diff* of the whole list on every change, which for an add is the new
row and for a delete is nothing. Explicit announcements say what happened
("Buy milk deleted"), not what the DOM looks like now.

**Why `role="status"` and `role="alert"` rather than bare `aria-live`?**
The roles imply the live settings (`status` is polite, `alert` is
assertive) and are better supported across screen readers than the
attribute alone. Both are set anyway, belt and braces.

**Why does the form move focus back to the title *before* the request
settles?** So the user can type the next task while the previous one saves
(`AC-ADD-6`). The submit button is disabled and says "Adding…" for the
duration; focus is on the field, not the button, so the disabled state does
not strand focus.

## What to discuss

**"How do you test that a screen reader says the right thing?"** You
cannot, in jsdom. What you can test is that the live region's text became
the expected string, and `test/live-region.test.tsx` and the optimistic
tests do exactly that. Whether a screen reader then reads it is the
browser's contract, and the manual walk is where that is checked.

**"Why so much focus management for a to-do list?"** Because keyboard users
exist and a list where every action resets focus is unusable with a keyboard.
The cost is ~40 lines. The general pattern (plan, wait for the commit, land)
is the same one a data grid or a modal needs.

**"What does axe not catch?"** Anything requiring judgement: a label that is
present but wrong, an announcement that is technically made but unhelpful,
focus that is programmatically set but invisibly styled. `AC-A11Y-4` is `◉`
for that reason and no other.

## Where to look

- Live region: `components/ui/live-region.tsx`
- Focus management and announcements on filter/complete: `components/tasks/task-list.tsx`
- Error association: `components/tasks/task-form.tsx`, `app/login/login-form.tsx`
- Row semantics: `components/tasks/task-item.tsx`
- Tests: `test/a11y.test.tsx` (`AC-A11Y-1..6`, the recorded keyboard walk), `test/live-region.test.tsx`, `test/tasks/task-list.test.tsx` (`AC-FILT-6`, `AC-DEL-4`)
