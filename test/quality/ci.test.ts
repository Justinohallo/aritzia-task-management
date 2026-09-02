import { readFileSync } from "node:fs";
import path from "node:path";

const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8");

/**
 * The workflow file is the only artefact of `AC-CI-1` this repository can
 * hold; whether it actually blocks a merge is `AC-CI-2`, a GitHub setting,
 * verified manually per the ACCEPTANCE.md legend.
 */
describe("AC-CI-1: checks run on every pull request", () => {
  it("AC-CI-1: the CI workflow triggers on pull_request with no branch filter", () => {
    expect(workflow).toMatch(/^on:\n(?:.*\n)*?\s+pull_request:\s*$/m);
    const trigger = workflow.split(/^jobs:/m)[0];
    expect(trigger).not.toMatch(/pull_request:\n\s+branches/);
  });

  it("AC-CI-1: typecheck, lint, tests, production build and bundle test run, in that order", () => {
    const runs = [...workflow.matchAll(/^\s+run:\s*(.+)$/gm)].map((m) => m[1].trim());
    const order = ["npm run typecheck", "npm run lint", "npm test", "npm run build", "npm run test:bundle"].map(
      (cmd) => runs.findIndex((run) => run.startsWith(cmd)),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("AC-CI-1: the build and bundle steps see a dummy key, never a real one", () => {
    expect(workflow).toMatch(/TASKS_API_KEY:\s*\S+/);
    expect(workflow).not.toMatch(/TASKS_API_KEY:\s*\$\{\{\s*secrets/);
  });
});
