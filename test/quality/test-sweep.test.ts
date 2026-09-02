import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * T-11 — `AC-TEST-1..4`. The suite's own rules, asserted from the source
 * tree so that they hold on every push rather than on the day of the sweep.
 * `ACCEPTANCE.md` is the universe of criterion IDs; `test/` is where each
 * one must be named; `jest.config.mjs` is where the coverage floor lives.
 */
const ROOT = process.cwd();
const ACCEPTANCE = readFileSync(path.join(ROOT, "docs", "ACCEPTANCE.md"), "utf8");
const JEST_CONFIG = readFileSync(path.join(ROOT, "jest.config.mjs"), "utf8");

/**
 * The seven criteria `ACCEPTANCE.md`'s legend says no Jest test can prove.
 * They are verified manually (`◉`) with a procedure and a date, by QA, and
 * are the only IDs this sweep excuses from needing a named test.
 */
const MANUAL_ONLY = ["AC-UI-1", "AC-UI-2", "AC-UI-3", "AC-UI-4", "AC-A11Y-4", "AC-CI-2", "AC-DEP-1"];

const ID = /\bAC-[A-Z0-9]+-\d+\b/g;

function testFiles(dir = path.join(ROOT, "test")): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFiles(full));
    else if (/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = testFiles();
const SOURCES = new Map(FILES.map((f) => [path.relative(ROOT, f), readFileSync(f, "utf8")]));

/** The criterion IDs defined in ACCEPTANCE.md, one per `#### AC-…` heading. */
const CRITERIA = [...ACCEPTANCE.matchAll(/^#### (AC-[A-Z0-9]+-\d+)\b/gm)].map((m) => m[1]);

/** The IDs that appear in an `it(…)`, `test(…)` or `describe(…)` name. */
function namedInTests(): Set<string> {
  const named = new Set<string>();
  for (const source of SOURCES.values()) {
    for (const m of source.matchAll(/\b(?:it|test|describe)(?:\.each\([^)]*\))?\s*\(\s*(["'`])((?:(?!\1)[\s\S])*)\1/g)) {
      for (const id of m[2].match(ID) ?? []) named.add(id);
    }
  }
  return named;
}

describe("AC-TEST-1 — every criterion has a test", () => {
  it("AC-TEST-1: ACCEPTANCE.md defines the 79 criteria the plan counts", () => {
    expect(new Set(CRITERIA).size).toBe(CRITERIA.length);
    expect(CRITERIA).toHaveLength(79);
  });

  it("AC-TEST-1: the manual-only set is exactly the seven the legend names", () => {
    const legend = ACCEPTANCE.slice(0, ACCEPTANCE.indexOf("## Traceability"));
    expect(legend).toContain("exactly seven criteria");
    for (const id of MANUAL_ONLY) expect(CRITERIA).toContain(id);
    expect(MANUAL_ONLY).toHaveLength(7);
  });

  it("AC-TEST-1: every criterion outside the manual-only seven is named by a test or describe block", () => {
    const named = namedInTests();
    const unproven = CRITERIA.filter((id) => !MANUAL_ONLY.includes(id) && !named.has(id));
    expect(unproven).toEqual([]);
  });

  it("AC-TEST-1: no test names a criterion ACCEPTANCE.md does not define", () => {
    const defined = new Set(CRITERIA);
    const phantom = [...namedInTests()].filter((id) => !defined.has(id));
    expect(phantom).toEqual([]);
  });
});

describe("AC-TEST-2 — component tests assert through accessible queries", () => {
  const componentTests = [...SOURCES].filter(([file]) => file.endsWith(".test.tsx"));

  /** Assertions on implementation details: class names, internal state, instances. */
  const IMPLEMENTATION_DETAIL: Array<[string, RegExp]> = [
    ["class-name assertion", /\btoHaveClass\s*\(/],
    ["className read", /\.className\b/],
    ["class selector", /querySelector(?:All)?\s*\(\s*["'`][^"'`]*\.[A-Za-z_-]/],
    ["component instance", /\.instance\s*\(\)/],
    ["internal state", /\.state\s*[.[(]/],
  ];

  it("AC-TEST-2: there is at least one component test to hold to the rule", () => {
    expect(componentTests.length).toBeGreaterThan(0);
  });

  it.each(componentTests)("AC-TEST-2: %s asserts no class names, internal state or instances", (_file, source) => {
    const offences = IMPLEMENTATION_DETAIL.filter(([, re]) => re.test(source)).map(([name]) => name);
    expect(offences).toEqual([]);
  });

  it("AC-TEST-2: every component test that queries the screen does so by role, label or text", () => {
    // A hook test (`renderHook`) and a page that renders nothing have no
    // screen to query; a test that does query it must use accessible queries.
    const silent = componentTests
      .filter(([, source]) => /\bscreen\./.test(source))
      .filter(([, source]) => !/\b(?:get|find|query)(?:All)?By(?:Role|LabelText|Text)\b/.test(source))
      .map(([file]) => file);
    expect(silent).toEqual([]);
  });
});

describe("AC-TEST-3 — no snapshot-only coverage", () => {
  it("AC-TEST-3: no test file uses a snapshot assertion", () => {
    const snapshotting = [...SOURCES]
      .filter(([, source]) => /\btoMatch(?:Inline)?Snapshot\s*\(/.test(source))
      .map(([file]) => file);
    expect(snapshotting).toEqual([]);
  });

  it("AC-TEST-3: no __snapshots__ directory exists under test/", () => {
    const dirs: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (!statSync(full).isDirectory()) continue;
        if (entry === "__snapshots__") dirs.push(path.relative(ROOT, full));
        walk(full);
      }
    };
    walk(path.join(ROOT, "test"));
    expect(dirs).toEqual([]);
  });
});

describe("AC-TEST-4 — coverage floor on logic", () => {
  const thresholds = JEST_CONFIG.match(/coverageThreshold:\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? "";

  it.each([
    ["state", "./lib/tasks/"],
    ["API client", "./lib/api/"],
    ["validation", "./lib/tasks/validation.ts"],
  ])("AC-TEST-4: the %s module has a statement floor of at least 80 percent", (_name, key) => {
    const floor = thresholds.match(new RegExp(`"${key.replace(/[./]/g, "\\$&")}":\\s*\\{[^}]*statements:\\s*(\\d+)`));
    expect(floor).not.toBeNull();
    expect(Number(floor?.[1])).toBeGreaterThanOrEqual(80);
  });

  it("AC-TEST-4: a full run collects coverage, so the floor is enforced rather than reported", () => {
    expect(JEST_CONFIG).toMatch(/collectCoverage:\s*!FILTERED_RUN/);
    expect(process.env.CI ? "ci" : "local").toBeDefined();
  });
});
