import type { Metadata } from "next";

import { Deck } from "./deck";

export const metadata: Metadata = {
  title: "Presentation · Aritzia Task Management",
  description: "The T-14 case presentation: approach, rationale, and the AI workflow that produced the build.",
  robots: { index: false },
};

/**
 * `/presentation` — the deck, presented from the deployed app (T-18).
 *
 * Deliberately outside `app/(protected)/`: it is shown before anyone logs
 * in and reads nothing from storage, so it needs no guard (`AC-NAV-4`
 * still holds — the guard is used in exactly one place, the protected
 * layout).
 */
export default function PresentationPage() {
  return <Deck />;
}
