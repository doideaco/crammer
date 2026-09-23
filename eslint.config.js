// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "out/**",
      "**/.turbo/**",
      // Build output and vendored files, not source.
      "**/.next/**",
      "**/next-env.d.ts",
      "supabase/**",
      "packages/db/migrations/**",
      // Generated: see packages/video/scripts/gen-iso.ts.
      "packages/video/src/geo/iso.ts",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
