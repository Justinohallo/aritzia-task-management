import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * `AC-API-3`: the private key never reaches the client. Asserted against
 * production build output — the only test in the suite that proves an
 * absence (ADR-0006). It runs under `jest.bundle.config.mjs`, after
 * `next build`, and fails rather than skips when there is no build.
 */
const STATIC_DIR = path.join(process.cwd(), ".next", "static");
const KEY_VARIABLE_NAME = "TASKS_API_KEY";

function clientChunks(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return clientChunks(full);
    return /\.(js|mjs|css|txt|json)$/.test(entry) ? [full] : [];
  });
}

/** The built client chunks, or a failure: this suite never passes vacuously. */
function builtChunks(): string[] {
  const chunks = clientChunks(STATIC_DIR);
  if (chunks.length === 0) {
    throw new Error(`no production build at ${STATIC_DIR}; run \`npm run build\` first`);
  }
  return chunks;
}

describe("AC-API-3: the private key never reaches the client", () => {
  it("AC-API-3: a production build exists (this test fails, never skips, without one)", () => {
    expect({ built: existsSync(STATIC_DIR), hint: "run `npm run build` first" }).toEqual({
      built: true,
      hint: "run `npm run build` first",
    });
    expect(builtChunks().length).toBeGreaterThan(0);
  });

  it("AC-API-3: no client chunk mentions the key's variable name", () => {
    const hits = builtChunks().filter((file) => readFileSync(file, "utf8").includes(KEY_VARIABLE_NAME));
    expect(hits.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("AC-API-3: no client chunk contains the key's value", () => {
    const value = process.env[KEY_VARIABLE_NAME];
    // The value must be present for the search to mean anything, for the
    // build as well as for this run: `TASKS_API_KEY=any-value npm run build
    // && TASKS_API_KEY=any-value npm run test:bundle`. CI sets a dummy.
    expect({ keyPresentInEnvironment: Boolean(value) }).toEqual({ keyPresentInEnvironment: true });
    const hits = builtChunks().filter((file) => readFileSync(file, "utf8").includes(value as string));
    expect(hits.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
