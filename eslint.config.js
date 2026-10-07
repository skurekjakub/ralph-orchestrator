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
  "no-duplicate-imports": "error",
};

// esbuild bundles the orchestrator and every sub-project, and resolves relative imports without an extension.
const SPECIFIER_WITH_EXTENSION = String.raw`/^\.\.?\/.*\.[cm]?[jt]sx?$/`;
const extensionlessImportRules = {
  "no-restricted-syntax": [
    "error",
    ...[
      `ImportDeclaration[source.value=${SPECIFIER_WITH_EXTENSION}]`,
      `ExportNamedDeclaration[source.value=${SPECIFIER_WITH_EXTENSION}]`,
      `ExportAllDeclaration[source.value=${SPECIFIER_WITH_EXTENSION}]`,
      `ImportExpression[source.value=${SPECIFIER_WITH_EXTENSION}]`,
      `TSImportType[source.value=${SPECIFIER_WITH_EXTENSION}]`,
      `CallExpression[callee.object.name="vi"][callee.property.name=/^(mock|doMock|unmock|doUnmock|importActual|importMock)$/][arguments.0.value=${SPECIFIER_WITH_EXTENSION}]`,
    ].map((selector) => ({ selector, message: "Relative imports are extensionless (esbuild resolves them)" })),
  ],
};

export default [
  {
    ignores: [
      "**/dist/",
      "output/",
      "**/node_modules/",
      "ralph-dashboard/",
      "dashboard-local/",
      "scripts/",
      "shared/",
      "profiles/",
      "containment/",
      ".claude/worktrees/",
      ".cache/",
      "cache/",
    ],
  },

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
    rules: { ...sharedRules, ...extensionlessImportRules },
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
      ...extensionlessImportRules,
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Ralphchives — standalone scripts (plain JS/MJS with Node.js globals)
  {
    files: ["ralphchives/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        db: "readonly",
      },
    },
    rules: { ...sharedRules },
  },

  // Ralphchives — TypeScript (sync pipeline + tests)
  {
    files: ["ralphchives/**/*.ts"],
    rules: { ...sharedRules, ...extensionlessImportRules },
  },
];
