/**
 * The one place the private key is read (`AC-API-3`, ADR-0005).
 *
 * Server-only by construction: `lib/server/**` is imported by Route Handlers
 * and by nothing else, and the key is read from `process.env` at request
 * time — never inlined at build, never prefixed `NEXT_PUBLIC_`. Two tests
 * hold this line: `test/api/secret-boundary.test.ts` asserts that no other
 * source file names the variable and that no client module imports this
 * directory, and `test/bundle/no-secret-in-bundle.test.ts` searches the
 * production client chunks for both the variable name and its value.
 */

/**
 * The key the server presents to the upstream, or `undefined` when the
 * environment lacks it. An empty string counts as absent: a blank value in
 * a deploy's settings is a misconfiguration, and the upstream should say so
 * with a `401` (`AC-API-4`) rather than authenticate against `""`.
 */
export function readApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.TASKS_API_KEY;
  return value === undefined || value === "" ? undefined : value;
}
