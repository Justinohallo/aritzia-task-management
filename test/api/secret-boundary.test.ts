/**
 * @jest-environment node
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * `AC-API-3`, the source-level half: the key is read only from server-side
 * environment configuration. The bundle test (`test/bundle/`) proves the
 * built client chunks are clean; this one proves *why* — the variable is
 * named in exactly one server module, and nothing outside the server lane
 * imports that module.
 */
const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib", "types"];
const KEY_VARIABLE_NAME = "TASKS_API_KEY";
const KEY_READER = "lib/server/env.ts";
const SERVER_LANE = /^(lib\/server\/|app\/api\/)/;

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(entry) ? [full] : [];
  });
}

const files = SOURCE_DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d))).map((f) => ({
  rel: path.relative(ROOT, f),
  text: readFileSync(f, "utf8"),
}));

describe("AC-API-3: the key is read only from server-side environment configuration", () => {
  it("AC-API-3: exactly one source file names the key's variable, and it is the server reader", () => {
    const naming = files.filter((f) => f.text.includes(KEY_VARIABLE_NAME)).map((f) => f.rel);
    expect(naming).toEqual([KEY_READER]);
  });

  it("AC-API-3: the reader takes the key from process.env, never from a NEXT_PUBLIC_ variable", () => {
    const reader = files.find((f) => f.rel === KEY_READER);
    expect(reader?.text).toMatch(/env\.TASKS_API_KEY/);
    expect(reader?.text).not.toMatch(/env\.NEXT_PUBLIC_/);
  });

  it("AC-API-3: no module outside the server lane imports lib/server", () => {
    const importers = files
      .filter((f) => !SERVER_LANE.test(f.rel))
      .filter((f) => /from\s+["'](@\/lib\/server|\.{1,2}\/.*server\/)/.test(f.text))
      .map((f) => f.rel);
    expect(importers).toEqual([]);
  });

  it("AC-API-3: no client component imports lib/server", () => {
    const clientImporters = files
      .filter((f) => /^\s*["']use client["']/m.test(f.text))
      .filter((f) => f.text.includes("lib/server"))
      .map((f) => f.rel);
    expect(clientImporters).toEqual([]);
  });
});
