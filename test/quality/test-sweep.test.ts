import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * AC-TEST-1. `ACCEPTANCE.md` is the universe of criterion IDs and `test/` is
 * where each one must be named — asserted from the source tree so it holds
 * on every push, not only on the day of a sweep. `AC-TEST-2..4` moved to a
 * `⚙` mark at T-19 (ARCH-07, `B-27`): the lint rules that replace their
 * meta-tests live in `eslint.config.mjs`, and this file no longer proves
 * them. AC-TEST-1 keeps a Jest test — a cross-check between this document
 * and the suite is genuinely a test — but derives its counts from the
 * document instead of hard-coding them (ADR-0006, amended).
 */
const ROOT = process.cwd();
const ACCEPTANCE = readFileSync(path.join(ROOT, "docs", "ACCEPTANCE.md"), "utf8");
const LEGEND = ACCEPTANCE.slice(0, ACCEPTANCE.indexOf("## Traceability")).replace(/\s+/g, " ");

const NUMBER_WORDS: Record<string, number> = { seven: 7, eight: 8 };

/** Every `AC-XXX-N` and `AC-XXX-N..M` token in `text`, ranges expanded. */
function idsIn(text: string): Set<string> {
  const ids = new Set<string>();
  for (const [, group, start, end] of text.matchAll(/AC-([A-Z0-9]+)-(\d+)(?:\.\.(\d+))?/g)) {
    const from = Number(start);
    const to = end ? Number(end) : from;
    for (let n = from; n <= to; n++) ids.add(`AC-${group}-${n}`);
  }
  return ids;
}

/**
 * The exemption set the legend names for a mark: the prose declares a count
 * ("exactly seven criteria …") and lists the IDs it applies to ("… and for
 * no others: `AC-…`, …"). Both are read from the document, not hard-coded
 * here, so the two can be cross-checked against each other.
 */
function exemptionSet(mark: "seven" | "eight", introduces: string): { ids: Set<string>; claimedCount: number } {
  const match = LEGEND.match(new RegExp(`exists for exactly ${mark} criteria[\\s\\S]*?no others:(.*?)Each is`));
  if (!match) throw new Error(`ACCEPTANCE.md legend no longer describes ${introduces} the way this sweep expects`);
  return { ids: idsIn(match[1]), claimedCount: NUMBER_WORDS[mark] };
}

const MANUAL_ONLY = exemptionSet("seven", "◉ (verified manually)");
const TOOLING_ONLY = exemptionSet("eight", "⚙ (enforced by tooling)");
const EXEMPT = new Set([...MANUAL_ONLY.ids, ...TOOLING_ONLY.ids]);

function testFiles(dir = path.join(ROOT, "test")): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFiles(full));
    else if (/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = testFiles().map((f) => readFileSync(f, "utf8"));

/** The criterion IDs defined in ACCEPTANCE.md, one per `#### AC-…` heading. */
const CRITERIA = [...ACCEPTANCE.matchAll(/^#### (AC-[A-Z0-9]+-\d+)\b/gm)].map((m) => m[1]);

/** The IDs that appear in an `it(…)`, `test(…)` or `describe(…)` name. */
function namedInTests(): Set<string> {
  const named = new Set<string>();
  for (const source of SOURCES) {
    for (const m of source.matchAll(/\b(?:it|test|describe)(?:\.each\([^)]*\))?\s*\(\s*(["'`])((?:(?!\1)[\s\S])*)\1/g)) {
      for (const id of idsIn(m[2])) named.add(id);
    }
  }
  return named;
}

describe("AC-TEST-1 — every criterion has a test", () => {
  it("AC-TEST-1: ACCEPTANCE.md defines no duplicate criterion IDs", () => {
    expect(new Set(CRITERIA).size).toBe(CRITERIA.length);
    expect(CRITERIA.length).toBeGreaterThan(0);
  });

  it("AC-TEST-1: the manual-only (◉) and tooling-only (⚙) sets match the counts the legend itself claims", () => {
    expect(MANUAL_ONLY.ids.size).toBe(MANUAL_ONLY.claimedCount);
    expect(TOOLING_ONLY.ids.size).toBe(TOOLING_ONLY.claimedCount);
    // The two exemptions are disjoint — a criterion is proved one way.
    for (const id of MANUAL_ONLY.ids) expect(TOOLING_ONLY.ids.has(id)).toBe(false);
  });

  it("AC-TEST-1: every criterion the legend exempts is a criterion ACCEPTANCE.md actually defines", () => {
    const defined = new Set(CRITERIA);
    for (const id of EXEMPT) expect(defined.has(id)).toBe(true);
  });

  it("AC-TEST-1: every criterion outside the manual-only and tooling-only sets is named by a test or describe block", () => {
    const named = namedInTests();
    const unproven = CRITERIA.filter((id) => !EXEMPT.has(id) && !named.has(id));
    expect(unproven).toEqual([]);
  });

  it("AC-TEST-1: no test names a criterion ACCEPTANCE.md does not define", () => {
    const defined = new Set(CRITERIA);
    const phantom = [...namedInTests()].filter((id) => !defined.has(id));
    expect(phantom).toEqual([]);
  });
});
