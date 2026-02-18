import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const sharedRules = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/no-unused-expressions": "off",
  "@typescript-eslint/no-require-imports": "off",
  "no-unused-vars": "off",
  "no-misleading-character-class": "off",
};

export default [
  { ignores: ["dist/", "output/", "node_modules/", "ralph-dashboard/", "dashboard-local/", "scripts/", "shared/", "profiles/"] },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  { rules: { "preserve-caught-error": "off" } },

  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { ...sharedRules },
  },

  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tests/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...sharedRules,
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
