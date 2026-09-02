import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP_SOURCE_DIRS = ["app", "components", "lib", "types"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function appSource(): Array<{ file: string; lines: string[] }> {
  return APP_SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).map((file) => ({
    file: path.relative(ROOT, file),
    lines: readFileSync(file, "utf8").split("\n"),
  }));
}

function eslintConfigFor(file: string): Record<string, unknown> {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "eslint", "bin", "eslint.js"), "--print-config", file],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("AC-QUAL-1: strict TypeScript, clean typecheck", () => {
  it("AC-QUAL-1: tsconfig enables strict mode", () => {
    const tsconfig = JSON.parse(readFileSync(path.join(ROOT, "tsconfig.json"), "utf8")) as {
      compilerOptions: { strict?: boolean };
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("AC-QUAL-1: the typecheck script is a full tsc pass", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toMatch(/\btsc\b.*--noEmit/);
  });

  it("AC-QUAL-1: ESLint forbids explicit any in application source", () => {
    const rules = eslintConfigFor("app/layout.tsx").rules as Record<string, unknown[]>;
    expect(rules["@typescript-eslint/no-explicit-any"]?.[0]).toBe(2);
  });

  it("AC-QUAL-1: no explicit any appears in application source", () => {
    const offenders = appSource().flatMap(({ file, lines }) =>
      lines
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /(:\s*any\b|<any>|as\s+any\b|\bany\[\])/.test(line))
        .map(({ n }) => `${file}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("AC-QUAL-2: suppressions are justified", () => {
  it("AC-QUAL-2: ESLint bans @ts-ignore and requires a description on @ts-expect-error", () => {
    const rules = eslintConfigFor("app/layout.tsx").rules as Record<string, unknown[]>;
    const [severity, options] = rules["@typescript-eslint/ban-ts-comment"] ?? [];
    expect(severity).toBe(2);
    expect(options).toMatchObject({ "ts-ignore": true, "ts-expect-error": "allow-with-description" });
  });

  it("AC-QUAL-2: no @ts-ignore, and every @ts-expect-error carries a reason", () => {
    const problems = appSource().flatMap(({ file, lines }) =>
      lines
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /@ts-ignore/.test(line) || (/@ts-expect-error/.test(line) && !/@ts-expect-error\s*:?\s*\S.{9,}/.test(line)))
        .map(({ n }) => `${file}:${n}`),
    );
    expect(problems).toEqual([]);
  });
});
