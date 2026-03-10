# Phase B: New Subagent — `ralph-coder`

**Repo:** `ralph-orchestrator`
**Depends on:** Phase A (bootstrap skill must exist)
**Template:** `profiles/ralph-vscode/agents/ralph.ralph-coder.agent.md`

## Step 3: Create the subagent template

**File:** `profiles/ralph-docs/agents/ralph.ralph-coder.agent.md`

### Structure

Use the ralph-vscode coder as structural reference, adapting for docs-repo codesamples bootstrap. The agent template follows the agent-as-function contract.

### Input

- `triggerParams.xpversion` — version string or URL (e.g., `31.2.0-build1`, PR URL, build URL)
- `triggerParams.adminui` — boolean, if set → verify admin UI is accessible after bootstrap
- Reads `ralph-codesamples-bootstrap` skill for step-by-step instructions

### Job description

Bootstrap the Xperience by Kentico codesamples project development environment. This is a preparatory step that runs BEFORE the researcher — it ensures the .NET project is built, the database is seeded, and the dev server is running.

### Workflow

1. Read the `ralph-codesamples-bootstrap` skill
2. Verify prerequisites:
   - License file exists at `src/_code/license.txt`
   - `ADO_PAT_XPERIENCE` env var is set (if targeting private feeds)
   - MSSQL `db` service is responding (healthcheck)
3. Run `npm run codesamples:setversion -- {{ triggerParams.xpversion }}`
4. If build/restore fails with schema mismatch → retry with `--ci-migrate`
5. Start the dev server in background: `nohup npm run codesamples:serve > /tmp/codesamples-serve.log 2>&1 &`
6. Wait for server to respond on `localhost:666` (poll with `curl`, max ~60s)
7. If `triggerParams.adminui`:
   - Open `localhost:666/admin` via playwright-cli
   - Verify login page loads
   - Login with `administrator` / `admin`
   - Verify dashboard loads successfully
8. Write `output.md` with:
   - Installed version
   - Database name
   - Server URL (`localhost:666`)
   - Whether ci-migrate was used
   - Admin UI verification result (if applicable)
   - Any warnings or migration notes

### Result codes

| Code | Meaning | Orchestrator action |
|------|---------|-------------------|
| `bootstrapped` | Project is built, server running, ready for use | Proceed to researcher |
| `failed` | Unrecoverable error (missing license, PAT invalid, etc.) | Exit with error |

### `status.json` contract

```json
{
  "result": "bootstrapped",
  "summary": "Installed Xperience 31.2.0-build1. Database: codesamples-31.2.0. Server running at localhost:666. CI-migrate was not needed.",
  "outputFiles": ["output.md"]
}
```

### Skills to reference

- `ralph-codesamples-bootstrap` — primary workflow
- `playwright-cli` — only when `triggerParams.adminui` is set

### Important constraints

- **Never commit** — this agent only bootstraps the environment, it does not make content changes
- **Fix build-breaking API changes** — if the target SDK version renames or removes types/methods, update the source code to compile. This is bootstrap infrastructure, not content modification.
- **Server must persist** — use `nohup` / background process, it must survive after the coder subagent completes
- **Fail fast on missing prerequisites** — don't attempt workarounds for missing license or PAT
