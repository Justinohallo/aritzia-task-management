# 09 · List, filter and ordering

> **In one paragraph.** The list never stores its order: it sorts at render
> by due date, then creation time, then id, so any task put back into state
> lands where it belongs. The active filter is not component state at all: it
> is the URL query string, read with `useSearchParams` and changed with
> `router.push`, so it is shareable, survives a reload, and the back button
> walks through it. Dates are calendar days as `YYYY-MM-DD` strings, compared
> lexically and formatted from their parts, so no timezone can shift "due
> Wednesday" to Tuesday.

## The concept: derived state over stored state

There are two ways to keep a list sorted: sort the array every time it
changes and store the result, or store the array in any order and sort it
when rendering. The first makes every mutation responsible for order and
turns "put this record back" into "put this record back *at index 3*". The
second makes order a pure function of the data, and a restored record needs
no index because the sort recomputes it.

The same principle applies to the filter. Component state for the filter
would be one source of truth; the URL would be another; the two would
disagree on reload, on share, on back. Making the URL the *only* place the
filter lives removes the disagreement by removing the second copy. This is
the general rule: **if a value can be derived, derive it; if it must be
stored, store it once.**

## How it is built here

### Ordering

```ts
// components/tasks/task-list.tsx
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
```

Due date ascending, creation time ascending, id as a final tie-breaker so
the order is total and stable (`AC-LIST-3`, `AM-5`). `[...tasks]` copies
first because `Array.prototype.sort` is in place and the input is `readonly`.
`localeCompare` on ISO strings is a correct ordering because both formats
sort lexically: `2026-09-10 < 2026-09-11` as strings and as dates.

The consequence for the optimistic layer: `remove/rollback` appends the
restored record to the end of the array, and the row appears exactly where it
was ([page 08](08-optimistic-mutations.md)). The reducer has no concept of
position, and that is what makes `AC-API-9` a one-line reducer case.

### The filter lives in the URL

```ts
// components/tasks/task-filters.tsx
export const FILTER_PARAM = "filter";

export function parseFilter(searchParams): Filter {
  const value = searchParams?.get(FILTER_PARAM);
  return isFilter(value) ? value : "all";
}

export function filterHref(pathname: string, filter: Filter): string {
  return filter === "all" ? pathname : `${pathname}?${FILTER_PARAM}=${filter}`;
}

export function useTaskFilter(): [Filter, (next: Filter) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/tasks";
  const router = useRouter();
  const filter = parseFilter(searchParams);
  const setFilter = useCallback((next: Filter) => {
    if (next !== filter) router.push(filterHref(pathname, next));
  }, [filter, pathname, router]);
  return [filter, setFilter];
}
```

`/tasks` is All. `/tasks?filter=pending` is Pending. `/tasks?filter=completed`
is Completed (`AC-FILT-1..3`). Three consequences:

- **Shareable and restorable.** Paste the URL, get the view. Reload, keep
  the view (`AC-FILT-4`).
- **Back-button-safe.** Every change is a `push`, so the history stack holds
  the sequence of filters and Back returns to the previous one.
  A redirect uses `replace` for the opposite reason ([page 02](02-nextjs-app-router.md)).
- **Fail-safe.** `?filter=nonsense` is untrusted input from a hand-edited
  URL. `isFilter` narrows it against the `FILTERS` tuple, and nonsense reads
  as `all` rather than as an empty list.

`All` is written as the bare pathname, not `?filter=all`, so the default view
has the canonical URL and two URLs never mean the same thing.

The hook returns a tuple shaped like `useState`'s so it reads as state to
its consumer, while the storage is the address bar. `setFilter` is a no-op
for the current value so re-clicking the active filter does not push a
duplicate history entry.

`useSearchParams` requires a Suspense boundary above it for static
rendering; `TaskList` supplies its own ([page 02](02-nextjs-app-router.md)).

### The filter control

```tsx
<ToggleGroup type="single" value={value} aria-label="Filter tasks" onValueChange={(next) => { if (isFilter(next)) onChange(next); }}>
  {FILTERS.map((filter) => <ToggleGroupItem key={filter} value={filter} aria-label={FILTER_LABELS[filter]}>{FILTER_LABELS[filter]}</ToggleGroupItem>)}
</ToggleGroup>
```

Radix's single-select toggle group renders the items as `role="radio"` with
`aria-checked`, and one roving tab stop with arrow-key movement, so the
active filter is exposed as a *state* rather than a colour (`AC-A11Y-5`).
Radix reports `""` when the active item is clicked again; the `isFilter`
guard turns that into "leave it active", since a filter is never "none".

### Filtering

```ts
export function matchesFilter(filter: Filter, completed: boolean): boolean {
  return filter === "all" || (filter === "completed") === completed;
}
```

One expression, no branches per filter. `pending` is `completed === false`;
`completed` is `completed === true`; `all` is always. The list applies it
before sorting: `sortTasks(tasks.filter((t) => matchesFilter(filter, t.completed)))`.

### Three empty states, told apart on purpose

```tsx
{!hydrated ? <ListSkeleton />
 : tasks.length === 0 ? <EmptyState title="No tasks yet" … />
 : visible.length === 0 ? <FilteredEmptyState filter={filter} />
 : <ul aria-label={`${FILTER_LABELS[filter]} tasks`}>…</ul>}
```

- **Not yet hydrated.** A skeleton, so a misleading "No tasks yet" never
  flashes before `localStorage` has been read.
- **No tasks at all.** "No tasks yet. Add your first task above" (`AC-LIST-2`).
- **Tasks exist, but the filter hides them all.** "No pending tasks. You
  have tasks, but none match the Pending filter. Choose All to see every
  task." (`AC-FILT-5`). Names the filter, and reads differently from the
  first, so the user knows their data is not gone.

### Completing under a filter

Ticking a task under Pending removes it from view. Two things happen before
the row goes: the list plans where keyboard focus should land
([page 10](10-accessibility.md)), and the change is announced as
"*title* marked complete and removed from the Pending list" rather than just
"marked complete", so a screen-reader user is not left on a control that has
vanished (`AC-FILT-6`).

### Calendar days, not instants

The brief says "due dates". A due date is a day, not a moment: a task due
Wednesday is due all Wednesday, in the user's timezone. Three places get this
right, and each is a classic bug avoided:

**Storage and comparison.** `dueDate` is a `YYYY-MM-DD` string
(`z.iso.date()`), and overdue is a string comparison:

```ts
// lib/tasks/validation.ts
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function isOverdue(dueDate: string, today = localToday()): boolean {
  return dueDate < today;   // strictly before today: due today is not overdue
}
```

`localToday` uses the *local* getters, so "today" is the user's day.
`dueDate < today` is lexical and correct for the format. No `Date` is built
from the due date, so no timezone conversion can move it. Overdue applies to
pending tasks only; a late task that is done is just done (`AC-ADD-7`,
`AC-LIST-4`, `AM-4`).

**Display.** `new Date("2026-09-10")` parses a bare date as **UTC midnight**,
which in Vancouver is 17:00 the previous day, so `toLocaleDateString` would
print September 9. The row builds the `Date` from parts instead:

```ts
// components/tasks/task-item.tsx
export function formatDueDate(dueDate: string, locale?: string): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
```

The multi-argument constructor is local time, so the printed day is the
stored day (`AM-12`). The `<time dateTime={task.dueDate}>` element carries
the machine-readable form alongside the formatted one.

**Input.** `<input type="date">` yields `YYYY-MM-DD` natively, and a past
date is accepted: a user entering a task they are already late on is a
legitimate case, and the list marks it rather than the form rejecting it.

`createdAt`, by contrast, *is* an instant (`new Date().toISOString()`,
`z.iso.datetime()`), because "when was this created" is a moment, and it is
only ever compared, never displayed.

### The row

`components/tasks/task-item.tsx` renders the title as a `<label>` for the
completion checkbox, so clicking the text toggles it and the checkbox's
accessible name *is* the task (`AC-DONE-1`). Status is a badge with the
word "Pending" or "Completed"; overdue is a badge with the word and an icon,
never a colour alone (`AC-LIST-4`, `AC-A11Y-5`). Delete is a real `<button>`
labelled `Delete <title>`, so it is focusable, activated by Enter or Space,
and announced with the task's name (`AC-DEL-4`), and it acts at once with no
confirmation dialog (`AC-DEL-3`, `AM-7`). The `data-task-id`, `data-control`,
`data-completed`, `data-overdue` and `data-sync` attributes carry no styling;
they are how the list finds controls for focus management and how tests read
state without reaching into React.

## The decisions inside

**Why not sort in the reducer?** Because then every action would have to
maintain the invariant, and a restored record would need its index. Sorting
at render on a list of this size costs nothing measurable. On a list of
thousands, `useMemo` over `[tasks, filter]` is the next step, not moving the
sort into state.

**Why the URL and not `localStorage` for the filter?** Because the filter is
*view* state, not *data*. It should differ between two tabs, be shareable in
a link, and be undone by Back. `localStorage` gives none of those. The
eCommerce analogue is catalog faceting, where "size M, colour black" is a URL
you send to a friend.

**Why no confirmation dialog on delete?** The brief does not ask for one,
and the delete is optimistic with a rollback path, an announcement, and
visible feedback. A dialog would add a step to every delete to guard against
a mis-tap that the undo-shaped design already tolerates. Recorded as `AM-7`.

**Why is `createdAt` the tie-breaker and not insertion order?** Insertion
order is not stored (there is no index), and `createdAt` is the same thing
made explicit and persistent. Two tasks created in the same millisecond fall
through to `id`, which is random but stable.

## What to discuss

**"What if two tasks are due the same day?"** Creation order. The one added
first is listed first. That is the deterministic answer `AC-LIST-3` asks for,
and it is the one users expect from a to-do list.

**"Why not a proper date library?"** Because no date arithmetic happens. The
app stores a day string, compares two day strings, and formats one for
display. `Temporal` or `date-fns` would be a runtime dependency (an ADR,
per rule 4) in service of three lines. The moment there is arithmetic
("due in 3 days", recurring tasks), that flips.

**"Where does the filter go if the app grows to many facets?"** Still the
URL: `?status=pending&due=week&sort=created`. The parse function grows a few
lines and gains a schema. The principle (one source of truth, fail-safe
parse, `push` on change) is the same.

## Where to look

- Sort, empty states, the list: `components/tasks/task-list.tsx`
- Filter parsing, href, hook, control: `components/tasks/task-filters.tsx`
- Row and date formatting: `components/tasks/task-item.tsx`
- Overdue and local today: `lib/tasks/validation.ts`
- Filter type and narrowing: `types/task.ts`
- Tests: `test/tasks/task-list.test.tsx` (`AC-LIST-1..4`, `AC-FILT-1..6`, `AC-DONE-1..3`, `AC-DEL-1`, `AC-DEL-3..4`), `test/tasks/validation.test.ts` (`isOverdue`, `localToday`)
