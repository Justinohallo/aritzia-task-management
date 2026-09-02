import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * T-10 — `AC-UI-5`, `AC-UI-6` (ADR-0003). The seam between generic
 * primitives (`components/ui/**`) and the task domain is a static property
 * of the source tree, so it is asserted from the source tree. Two things
 * are checked: nothing under `components/ui/` reaches into the domain, and
 * nothing outside it renders the native controls the primitives wrap.
 */
const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, "components", "ui");
const DOMAIN_DIRS = [path.join(ROOT, "app"), path.join(ROOT, "components", "tasks")];

/** Import specifiers a primitive must never name: the task domain and the app shell. */
const DOMAIN_IMPORT = /^@\/(components\/tasks|lib\/(tasks|auth|api)|types|app)(\/|$)/;

/** The shadcn primitives the brief's controls come from (`AC-UI-5`). */
const NATIVE_CONTROLS = ["button", "input", "select", "dialog", "textarea"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map(
    (m) => m[1] ?? m[2],
  );
}

function rel(file: string): string {
  return path.relative(ROOT, file);
}

describe("AC-UI-6: a component boundary exists", () => {
  it("AC-UI-6: generic primitives live in components/ui and task-domain components in components/tasks", () => {
    expect(sourceFiles(UI_DIR).length).toBeGreaterThan(0);
    expect(sourceFiles(path.join(ROOT, "components", "tasks")).length).toBeGreaterThan(0);
    // Every primitive the domain uses is imported through the boundary, not
    // from a copy beside the consumer.
    for (const file of DOMAIN_DIRS.flatMap(sourceFiles)) {
      for (const specifier of importsOf(file)) {
        if (/^\.{1,2}\/.*\/ui\//.test(specifier)) {
          throw new Error(`${rel(file)} imports a primitive by relative path: ${specifier}`);
        }
      }
    }
  });

  it("AC-UI-6: no primitive imports from the task domain", () => {
    const violations = sourceFiles(UI_DIR).flatMap((file) =>
      importsOf(file)
        .filter((specifier) => DOMAIN_IMPORT.test(specifier) || specifier.startsWith("../"))
        .map((specifier) => `${rel(file)} → ${specifier}`),
    );
    expect(violations).toEqual([]);
  });

  it("AC-UI-6: a primitive's only app imports are sibling primitives and the class-name helper", () => {
    // `@/lib/utils` is the one shared helper (`cn`); anything else under `@/`
    // that is not itself a primitive is a dependency on this application and
    // would block extracting the directory into a `packages/ui` workspace
    // (ADR-0003).
    const violations = sourceFiles(UI_DIR).flatMap((file) =>
      importsOf(file)
        .filter(
          (specifier) =>
            specifier.startsWith("@/") && specifier !== "@/lib/utils" && !specifier.startsWith("@/components/ui/"),
        )
        .map((specifier) => `${rel(file)} → ${specifier}`),
    );
    expect(violations).toEqual([]);
  });
});

describe("AC-UI-5: UI is built from the chosen library's primitives", () => {
  it("AC-UI-5: buttons, inputs, checkboxes, selects and dialogs exist as shadcn primitives", () => {
    const present = readdirSync(UI_DIR).map((name) => name.replace(/\.tsx$/, ""));
    for (const primitive of ["button", "input", "checkbox", "select", "dialog"]) {
      expect(present).toContain(primitive);
    }
  });

  it("AC-UI-5: no native control is hand-rolled alongside the primitives", () => {
    // A JSX element named for a control the library wraps, anywhere outside
    // `components/ui/`. `<label>` is deliberately not on the list: a plain
    // label bound with `htmlFor` is the accessible-name mechanism the
    // primitives themselves rely on, not a duplicate control.
    const pattern = new RegExp(`<(${NATIVE_CONTROLS.join("|")})(\\s|>|/)`, "g");
    const violations = DOMAIN_DIRS.flatMap(sourceFiles).flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines.flatMap((line, i) => (pattern.test(line) ? [`${rel(file)}:${i + 1}: ${line.trim()}`] : []));
    });
    expect(violations).toEqual([]);
  });

  it("AC-UI-5: the controls the domain renders are imported from components/ui", () => {
    const controlImports = DOMAIN_DIRS.flatMap(sourceFiles).flatMap((file) =>
      importsOf(file).filter((specifier) => /^@\/components\/ui\/(button|input|checkbox|select|dialog)$/.test(specifier)),
    );
    expect(controlImports).toEqual(expect.arrayContaining(["@/components/ui/button", "@/components/ui/input", "@/components/ui/checkbox"]));
  });
});
