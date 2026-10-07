---
paths:
  - "scripts/**"
---

# Scripts

- Run TypeScript scripts with `npx tsx scripts/<name>.ts`. Relative imports are extensionless (`../src/config/loader`); tsx resolves them.
- A throwaway script that imports `src/` or project dependencies must live inside the repo (put it in `scripts/`). Module resolution walks up from the file's own location, so a script in `/tmp` or the Claude scratchpad cannot resolve this repo's `node_modules`.
- `npx tsx -e "…"` and piping into tsx don't work for ESM imports here, because the snippet is evaluated as CommonJS. Write a file instead.
- Add `import "dotenv/config"` when the script needs `.env` secrets. `loadConfig()` from `src/config/loader.ts` gives you profiles, data sources and secrets.
- `npm run lint` type-checks (`scripts/tsconfig.json`) and lints committed scripts, so they must compile against the current `src/` API.
- Delete debug scripts when you're done. Committed scripts (`run-agent.ts`, `run-hooks.ts`, `reset-issue.ts`, …) start with a usage doc comment.
