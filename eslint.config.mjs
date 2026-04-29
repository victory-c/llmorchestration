import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code session state — embedded git worktrees that shadow src/.
    ".claude/**",
    // Other workspace noise we don't ship.
    "scratch/**",
    "tmp/**",
  ]),
  {
    rules: {
      // Standard convention: a leading underscore signals "this argument is
      // here to satisfy an interface contract". Storage / TTS / gateway
      // adapters all hit this when their backing API doesn't need an arg
      // the abstract interface requires.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
