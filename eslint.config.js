import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "packages/server/drizzle/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Tests and the demo seed poke at loosely typed command results.
    files: ["**/test/**/*.ts", "scripts/seed-demo.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Money must never be converted to a JS number (ADR-002). Arithmetic lives in @liferoute/core/money.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='parseFloat']",
          message:
            "parseFloat is forbidden: use decimal strings via @liferoute/core money helpers (ADR-002).",
        },
      ],
    },
  },
);
