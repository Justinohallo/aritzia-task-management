"use client";

/**
 * The one announcement mechanism (T-01 contract; ARCH-03, B-07).
 *
 * `<LiveRegion />` is mounted **once**, by T-02 in the protected layout.
 * Everything else announces through {@link useAnnounce} — `AC-FILT-6`
 * (T-05), `AC-DEL-2` and `AC-API-11` (T-08), `AC-A11Y-3` (T-09). No task
 * after wave 0 creates a live region of its own.
 *
 * The primitive is a tiny publish/subscribe bus rather than a context so the
 * component can be self-closing and so non-component code — T-08's
 * `lib/tasks/mutations.ts` — can announce without rendering. Announcements
 * made while no region is mounted are dropped, never queued: a message
 * about something that happened before the page existed is noise.
 */
import * as React from "react";

export interface AnnounceOptions {
  /**
   * `true` interrupts the screen reader (`role="alert"`). Reserve it for
   * failures; routine outcomes are polite (`role="status"`).
   */
  assertive?: boolean;
}

export type Announce = (message: string, options?: AnnounceOptions) => void;

type Announcement = { message: string; assertive: boolean };
type Listener = (announcement: Announcement) => void;

const listeners = new Set<Listener>();

/**
 * Announce to every mounted `<LiveRegion />`. Stable module-level function;
 * {@link useAnnounce} returns it for use inside components.
 */
export const announce: Announce = (message, options) => {
  const announcement: Announcement = { message, assertive: options?.assertive ?? false };
  listeners.forEach((listener) => listener(announcement));
};

/** Returns {@link announce}. Stable across renders, safe in effect deps. */
export function useAnnounce(): Announce {
  return announce;
}

type Slot = { text: string; nonce: number };
const EMPTY: Slot = { text: "", nonce: 0 };

export function LiveRegion() {
  const [polite, setPolite] = React.useState<Slot>(EMPTY);
  const [assertive, setAssertive] = React.useState<Slot>(EMPTY);

  React.useEffect(() => {
    const listener: Listener = ({ message, assertive: isAssertive }) => {
      const set = isAssertive ? setAssertive : setPolite;
      // A new nonce remounts the text node so an identical message is
      // announced again, without a timer to clear and refill the region.
      set((prev) => ({ text: message, nonce: prev.nonce + 1 }));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span key={polite.nonce}>{polite.text}</span>
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        <span key={assertive.nonce}>{assertive.text}</span>
      </div>
    </>
  );
}
