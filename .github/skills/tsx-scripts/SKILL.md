---
name: tsx-scripts
description: Run ad-hoc TypeScript scripts to debug, test, or explore runtime state in this ESM Node.js repository. Use this skill whenever you need to execute a quick TypeScript snippet, create a debug script, inspect runtime values, test a function in isolation, or verify behavior by running code. Triggers on any intent to run TypeScript code, create throwaway scripts, debug with console.log, test imports, or explore config/data at runtime. Also triggers when encountering module resolution errors, ESM import failures, or 'Cannot find module' errors from scripts.
---

# Running Ad-Hoc TypeScript Scripts

## When to Use

- You need to run a quick TypeScript snippet to debug or verify something
- You want to inspect runtime values (config, profiles, data structures)
- You need to test a function or import in isolation
- You hit a "Cannot find module" or ESM resolution error from a script
- You want to explore what `loadConfig()` or any other function returns at runtime

## Critical Rules

### 1. Scripts MUST live inside the project directory

Node's module resolution walks **up** from the script file's directory. A file at `/tmp/foo.ts` searches `/tmp/node_modules/`, `/node_modules/` — it never reaches this project's `node_modules/`.

```bash
# ✅ Correct — file inside the project
npx tsx scripts/my-debug-script.ts

# ❌ WRONG — /tmp is outside the project, ALL imports fail
npx tsx /tmp/my-debug-script.ts
```

### 2. Use `npx tsx` — never `node` or `ts-node`

This project is ESM-only (`"type": "module"`). Use `npx tsx`:

```bash
npx tsx scripts/some-script.ts
```

### 3. Inline evaluation won't work

`npx tsx -e "..."` and `echo "..." | npx tsx` fail for ESM imports. Always create a file.

```bash
# ❌ WRONG — ESM imports break with -e
npx tsx -e "import { loadConfig } from './src/config/loader.js'; ..."

# ✅ Correct — create a file and run it
npx tsx scripts/debug-something.ts
```

## Script Template

Place scripts in `scripts/` with a descriptive name (prefix with `_` for throwaway scripts):

```typescript
#!/usr/bin/env npx tsx
import "dotenv/config";
import { loadConfig } from "../src/config/loader.js";

const config = loadConfig();
console.log(`Profiles: ${config.profiles.length}`);
for (const p of config.profiles) {
  console.log(`  ${p.id} | ${p.displayName} | projects=${JSON.stringify(p.match.projects)}`);
}
```

**Key conventions:**
- `import "dotenv/config"` — loads `.env` secrets (JIRA tokens, PATs, etc.)
- All imports use **`.js` extensions** (NodeNext module resolution)
- Relative imports from `src/` work: `"../src/config/loader.js"`
- `loadConfig()` returns profiles, data sources, secrets — the full runtime config

## Common Debug Patterns

### Inspect profiles and their match rules
```typescript
import "dotenv/config";
import { loadConfig } from "../src/config/loader.js";
const config = loadConfig();
for (const p of config.profiles) {
  console.log(`${p.id}/${p.displayName}: projects=${JSON.stringify(p.match.projects)} trigger=${p.match.commentTrigger}`);
}
```

### Fetch a JIRA issue
```typescript
import "dotenv/config";
import { loadConfig } from "../src/config/loader.js";
import { JiraClient } from "../src/datasource/connectors/jira/jira-client.js";
import { JiraConnector } from "../src/datasource/connectors/jira/jira-connector.js";

const config = loadConfig();
const ds = config.dataSources["kentico-jira"];
const envKey = "kentico-jira".toUpperCase().replace(/-/g, "_");
const client = new JiraClient({
  connection: {
    ...(ds.connection as any),
    apiToken: process.env[`JIRA_PAT_${envKey}`]!,
    email: process.env[`JIRA_EMAIL_${envKey}`]!,
  },
});
const connector = new JiraConnector("kentico-jira", client);
const item = await connector.refreshWorkItem("DOC-3143");
console.log(item);
```

### Test a utility function
```typescript
import { slugifyBranch } from "../src/util/branch.js";
console.log(slugifyBranch("feature/DOC-3143 Add form components"));
```

## Cleanup

Delete debug scripts when done — don't commit throwaway files. Prefix with `_` (e.g., `_debug-profiles.ts`) to make them easy to spot and clean up.

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Cannot find module 'dotenv/config'` | Script is outside the project directory | Move script into `scripts/` |
| `ERR_MODULE_NOT_FOUND` | Missing `.js` extension on import | Add `.js` to all import paths |
| `SyntaxError: Cannot use import statement` | Running with `node` instead of `tsx` | Use `npx tsx` |
| `Unknown file extension ".ts"` | Running with `node` instead of `tsx` | Use `npx tsx` |
