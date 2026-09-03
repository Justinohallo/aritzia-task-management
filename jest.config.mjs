import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/**
 * Packages MSW loads that ship only ES modules. Jest on Node 22 cannot
 * `require()` them, so they are transformed by the same SWC pipeline as the
 * application source. next/jest refuses to let `transformIgnorePatterns`
 * reach into node_modules, hence the post-processing below rather than a
 * `transpilePackages` entry in next.config.ts, which would leak a test-only
 * concern into the production build.
 */
const ESM_ONLY = ["rettime", "until-async", "@open-draft"];

/** @type {import('jest').Config} */
const config = {
  // jsdom with the globals jsdom removes (fetch, Response, TextEncoder, …)
  // restored from Node, which MSW needs to intercept the real fetch.
  testEnvironment: "jest-fixed-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  // The bundle test needs a production build and lives in its own config so
  // `npm test` stays fast locally. See jest.bundle.config.mjs.
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/", "<rootDir>/test/bundle/"],
  collectCoverageFrom: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
  // `AC-TEST-4`, `⚙` since T-19 (ARCH-07): the floor on the state,
  // API-client and validation modules is enforced by the runner, not
  // reported, on the `test:ci` script CI runs (`--coverage`). `npm test`
  // stays fast locally and collects nothing.
  collectCoverage: false,
  coverageThreshold: {
    "./lib/tasks/": { statements: 80 },
    "./lib/api/": { statements: 80 },
    "./lib/tasks/validation.ts": { statements: 80 },
  },
};

export default async function jestConfig() {
  const resolved = await createJestConfig(config)();
  return {
    ...resolved,
    transformIgnorePatterns: [
      `/node_modules/(?!(${ESM_ONLY.map((p) => p.replace("/", "\\/")).join("|")})/)`,
      "^.+\\.module\\.(css|sass|scss)$",
    ],
  };
}
