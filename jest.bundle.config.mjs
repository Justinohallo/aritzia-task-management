import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/**
 * The second Jest config: only the `AC-API-3` bundle search. It reads the
 * production build output, so it can only pass after `next build`, and it
 * fails — never skips — when `.next/` is absent. CI runs it after the build.
 */
/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/bundle/**/*.test.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
};

export default createJestConfig(config);
