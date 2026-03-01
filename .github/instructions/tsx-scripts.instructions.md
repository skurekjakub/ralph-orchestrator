---
applyTo: "scripts/**,**/*.ts"
---

# Running Ad-Hoc TypeScript Scripts

When you need to run a quick TypeScript snippet to debug or test something in this repository, follow these rules:

## Always use a file inside the project

Scripts **must** live inside the repository directory (e.g. `/tmp` won't work). Node's module resolution walks up from the file's location — a file at `/tmp/foo.ts` can't find `node_modules/` in the project.

```bash
# ✅ Correct — file lives inside the project
npx tsx scripts/my-debug-script.ts

# ❌ Wrong — /tmp is outside the project, module resolution fails
npx tsx /tmp/my-debug-script.ts
```

## Use `npx tsx` for ESM TypeScript

This project is ESM-only (`"type": "module"`). Run scripts with `npx tsx`:

```bash
npx tsx scripts/some-script.ts
```

## Inline one-liners won't work

`npx tsx -e "..."` fails for ESM imports in this project. Always create a file instead of using `-e` or `echo | npx tsx`.

## Template for quick debug scripts

Place debug scripts in `scripts/` with a descriptive name. They can import directly from `src/`:

```typescript
#!/usr/bin/env npx tsx
import "dotenv/config";
import { loadConfig } from "../src/config/loader.js";

const config = loadConfig();
// ... your debug code
```

Key points:
- `import "dotenv/config"` loads `.env` secrets
- All imports use `.js` extensions (NodeNext resolution)
- Relative imports from `src/` work normally
- `loadConfig()` gives you profiles, data sources, and secrets

## Cleanup

Delete debug scripts when done — don't commit throwaway files.
