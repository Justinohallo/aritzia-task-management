"use client";

/**
 * The All / Pending / Completed filter (`AC-FILT-1..5`). The active filter
 * is **held in the URL query string**, not component state: shareable,
 * survives a reload, and the back button walks through changes because
 * every change is a `push` (`AC-FILT-4`). `All` is the bare pathname; an
 * unrecognised value also reads as `all` — a hand-edited URL fails safe.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FILTERS, isFilter, type Filter } from "@/types/task";

export const FILTER_PARAM = "filter";

export const FILTER_LABELS: Record<Filter, string> = { // AC-FILT-5 names the active one
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

/** Read the active filter from the URL; `setFilter` pushes a history entry, so the back button returns to the previous filter (`AC-FILT-4`). */
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

/** A single-select toggle group; Radix renders `role="radio"`/`aria-checked`, so the active filter is a state, not a colour. */
export function TaskFilters({ value, onChange }: TaskFiltersProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      aria-label="Filter tasks"
      onValueChange={(next) => {
        if (isFilter(next)) onChange(next); // Radix reports "" on re-click; the filter is never "none"
      }}
    >
      {FILTERS.map((filter) => (
        <ToggleGroupItem
          key={filter}
          value={filter}
          className="pointer-coarse:h-11 pointer-coarse:min-w-11 pointer-coarse:px-4"
          aria-label={FILTER_LABELS[filter]}
        >
          {FILTER_LABELS[filter]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
