"use client";

/**
 * The All / Pending / Completed filter — T-05 (`AC-FILT-1..5`).
 *
 * The active filter is **held in the URL query string**, not in component
 * state: `?filter=completed` is shareable, survives a reload, and the back
 * button walks through filter changes because every change is a `push`
 * (`AC-FILT-4`). Nothing is stored anywhere else, so there is one source of
 * truth and no way for it to disagree with the address bar.
 *
 * `All` is the default and is written as the bare pathname: a filter that
 * is not in the URL is `all`. An unrecognised value also reads as `all` —
 * a hand-edited URL is untrusted input and fails safe rather than showing
 * nothing.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FILTERS, isFilter, type Filter } from "@/types/task";

/** The query-string key that carries the filter. */
export const FILTER_PARAM = "filter";

/** Display labels, keyed by value. `AC-FILT-5` names the active one. */
export const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  pending: "Pending",
  completed: "Completed",
};

/** The filter a query string names; `all` when it names none, or nonsense. */
export function parseFilter(searchParams: { get(name: string): string | null } | null): Filter {
  const value = searchParams?.get(FILTER_PARAM);
  return isFilter(value) ? value : "all";
}

/** The URL for a filter: the bare path for `all`, `?filter=<value>` otherwise. */
export function filterHref(pathname: string, filter: Filter): string {
  return filter === "all" ? pathname : `${pathname}?${FILTER_PARAM}=${filter}`;
}

/** Whether a task belongs in the given filter's view (`AC-FILT-1..3`). */
export function matchesFilter(filter: Filter, completed: boolean): boolean {
  return filter === "all" || (filter === "completed") === completed;
}

/**
 * Read the active filter from the URL and change it through the router.
 * `setFilter` pushes a history entry, so the back button returns to the
 * previous filter (`AC-FILT-4`).
 */
export function useTaskFilter(): [Filter, (next: Filter) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/tasks";
  const router = useRouter();
  const filter = parseFilter(searchParams);

  const setFilter = useCallback(
    (next: Filter) => {
      if (next !== filter) router.push(filterHref(pathname, next));
    },
    [filter, pathname, router],
  );

  return [filter, setFilter];
}

export interface TaskFiltersProps {
  value: Filter;
  onChange: (next: Filter) => void;
}

/**
 * A single-select toggle group. Radix renders the items as `role="radio"`
 * with `aria-checked`, so the active filter is exposed to assistive
 * technology as a state and not as a colour.
 */
export function TaskFilters({ value, onChange }: TaskFiltersProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      aria-label="Filter tasks"
      onValueChange={(next) => {
        // Radix reports "" when the active item is clicked again. The filter
        // is never "none": clicking the active one leaves it active.
        if (isFilter(next)) onChange(next);
      }}
    >
      {FILTERS.map((filter) => (
        <ToggleGroupItem key={filter} value={filter} aria-label={FILTER_LABELS[filter]}>
          {FILTER_LABELS[filter]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
