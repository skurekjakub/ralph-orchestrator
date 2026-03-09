# Phase A: New Skill — `ralph-codesamples-bootstrap`

**Repo:** `ralph-orchestrator`
**Depends on:** Phase 0a (docs-repo scripts must support env var PAT)

## Step 1: Create the skill

**File:** `shared/skills/tasks/ralph-codesamples-bootstrap/SKILL.md`

**Source material:** `codelinking.md` (root of orchestrator repo)

### Skill content outline

The skill teaches the agent how to bootstrap a working Xperience by Kentico codesamples project from scratch. This is the foundational setup that enables code sample writing, testing, and admin UI interaction.

**Sections:**

1. **Prerequisites**
   - `license.txt` must exist at `src/_code/license.txt` (manual setup, not agent's job)
   - `ADO_PAT_XPERIENCE` env var must be set (for private NuGet feeds)
   - MSSQL server available at `DB_HOST:DB_PORT` (provided by `db` Docker service)

2. **Version installation** — `npm run codesamples:setversion -- <version>`
   - Supported formats:
     - Public NuGet semver: `31.0.0`
     - Kentico.Private feed: `31.1.0-<hash>`
     - ADO PR URL: `https://dev.azure.com/kenticoxperience/CMS/_git/xperience/pullrequest/24735`
     - ADO build URL: `https://dev.azure.com/kenticoxperience/CMS/_build/results?buildId=550290`
   - What the script does:
     1. Initializes `nuget.config` (uses `$ADO_PAT_XPERIENCE` for private feed auth)
     2. Updates `.csproj` files with the pinned version
     3. Installs `kentico.xperience.dbmanager` tool
     4. Restores NuGet packages and builds the solution
     5. Creates database `codesamples-<version>`
     6. Generates `appsettings.local.json` with connection string
     7. Enables CI and restores `CIRepository/` XML files
     8. Runs data seeders (MemberSeeder, CustomerSeeder, OrderSeeder)

3. **Pre-release packages and `--ci-migrate`**
   - When to use: CI restore fails because XML files were serialized against an older schema
   - Auto-resolve base from nuget.org:
     ```bash
     npm run codesamples:setversion -- 31.2.0-build1 --ci-migrate
     ```
   - Explicit base version:
     ```bash
     npm run codesamples:setversion -- 31.2.0-build1 --ci-migrate 31.1.2-buildid
     ```
   - When ci-migrate itself fails: try a different base version
   - After successful ci-migrate: commit updated XML files (they now contain new columns)

4. **Verification**
   - Build: `npm run codesamples:build`
   - Serve: `npm run codesamples:serve` (starts at `localhost:666`, uses `dotnet watch`)
   - Background the server: `nohup npm run codesamples:serve > /tmp/codesamples-serve.log 2>&1 &`

5. **Additional commands**
   - `npm run codesamples:codegen` — regenerate content type classes in `Generated/`
   - `npm run codesamples:store` — serialize admin-created objects to CI XML files
   - Review codegen output carefully — some generated files may include `//Include:` markers

6. **Troubleshooting**
   - 401 on NuGet restore → `ADO_PAT_XPERIENCE` is missing or expired
   - CI restore fails → use `--ci-migrate` (pre-release version schema mismatch)
   - Database connection fails → check `DB_HOST`/`MSSQL_SA_PASSWORD` env vars, wait for `db` healthcheck
   - Build fails after setversion → check for breaking API changes in the target version

## Step 2: Add skill to profile.json

**File:** `profiles/ralph-docs/profile.json`

Add `"ralph-codesamples-bootstrap"` to the `skills` array of the `ralph` variant stage. Insert near the other codesamples skills:

```json
"ralph-codesamples-bootstrap",
"ralph-code-samples",
"ralph-codesamples-project",
"ralph-codesamples-verification",
```
