import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import testingLibrary from "eslint-plugin-testing-library";

// AC-UI-5: the shadcn primitives that wrap a native control the brief's
// interface renders. A tag from this list outside components/ui/** is a
// hand-rolled duplicate of a primitive that already exists.
const NATIVE_CONTROLS = ["button", "input", "select", "dialog", "textarea"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // AC-QUAL-1: no explicit `any` in application source.
      "@typescript-eslint/no-explicit-any": "error",
      // AC-QUAL-2: suppressions are `@ts-expect-error`, never `@ts-ignore`,
      // and each carries a comment explaining why.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  {
    // AC-UI-5: no hand-rolled native control alongside the shadcn primitives
    // it duplicates, anywhere the task domain renders markup.
    files: ["app/**/*.{ts,tsx}", "components/tasks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...NATIVE_CONTROLS.map((tag) => ({
          selector: `JSXOpeningElement[name.type="JSXIdentifier"][name.name="${tag}"]`,
          message: `AC-UI-5: <${tag}> is a shadcn primitive (components/ui/${tag}.tsx) — import it rather than rendering the native element.`,
        })),
      ],
    },
  },
  {
    // AC-UI-6: components/ui/** stays app-agnostic — no import reaches into
    // the task domain, auth, app shell, or a primitive's sibling by relative
    // path that escapes the directory.
    files: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/components/tasks", "@/components/tasks/*",
                "@/lib/tasks", "@/lib/tasks/*",
                "@/lib/auth", "@/lib/auth/*",
                "@/lib/api", "@/lib/api/*",
                "@/types", "@/types/*",
                "@/app", "@/app/*",
                "../*",
              ],
              message: "AC-UI-6: components/ui/** is a generic primitive layer — it may not import from the task domain or the app shell.",
            },
          ],
        },
      ],
    },
  },
  {
    // AC-TEST-2/AC-TEST-3: test discipline. Accessible queries over
    // implementation details, and no snapshot-only coverage.
    files: ["test/**/*.{ts,tsx}"],
    plugins: { "testing-library": testingLibrary },
    rules: {
      "testing-library/no-container": "error",
      "testing-library/no-manual-cleanup": "error",
      "testing-library/prefer-screen-queries": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='toHaveClass']",
          message: "AC-TEST-2: assert the accessible outcome (role, label, text) instead of a class name.",
        },
        {
          selector: "MemberExpression[property.name='className']",
          message: "AC-TEST-2: reading .className asserts an implementation detail — query by role, label, or text.",
        },
        {
          selector: "CallExpression[callee.property.name=/^querySelectorAll?$/][arguments.0.value=/^\\./]",
          message: "AC-TEST-2: a class selector reaches past the accessible tree — query by role, label, or text.",
        },
        {
          selector: "CallExpression[callee.property.name='instance']",
          message: "AC-TEST-2: a component instance is an implementation detail — assert on the rendered output instead.",
        },
        {
          selector: "MemberExpression[property.name='state']",
          message: "AC-TEST-2: internal state is an implementation detail — assert on the rendered output instead.",
        },
        {
          selector: "CallExpression[callee.property.name=/^toMatch(Inline)?Snapshot$/]",
          message: "AC-TEST-3: no snapshot-only coverage — assert the specific behaviour instead.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // This repository:
    "coverage/**",
  ]),
]);

export default eslintConfig;
