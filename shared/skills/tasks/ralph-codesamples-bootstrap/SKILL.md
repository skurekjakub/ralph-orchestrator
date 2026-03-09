---
name: ralph-codesamples-bootstrap
description: "Bootstrap a working Xperience by Kentico codesamples project from scratch — version installation, NuGet restore, database creation, CI restore, and verification. Use this skill when the task requires setting up a fresh codesamples environment, running codesamples:setversion, troubleshooting NuGet or database setup, or when the trigger includes an xpversion parameter."
---

# Codesamples Bootstrap Skill

How to bootstrap a working Xperience by Kentico codesamples project from scratch. This is the foundational setup that enables code sample writing, testing, and admin UI interaction.

## Prerequisites

Before bootstrapping, verify these prerequisites are met:

- **`license.txt`** must exist at `src/_code/license.txt` — manual setup, not the agent's job. If missing, the script fails early with a clear error.
- **`ADO_PAT_XPERIENCE`** env var must be set — required for private NuGet feed authentication.
- **MSSQL server** available at `DB_HOST:DB_PORT` — provided by the `db` Docker service. Wait for the healthcheck to pass before proceeding.

## Version Installation

Run the version installation script with the target version:

```bash
npm run codesamples:setversion -- <version>
```

### Supported version formats

| Format | Example | Description |
|--------|---------|-------------|
| Public NuGet semver | `31.0.0` | Released version from nuget.org |
| Kentico.Private feed | `31.1.0-<hash>` | Pre-release from private ADO feed |
| ADO PR URL | `https://dev.azure.com/kenticoxperience/CMS/_git/xperience/pullrequest/24735` | Resolves artifacts from a pull request |
| ADO build URL | `https://dev.azure.com/kenticoxperience/CMS/_build/results?buildId=550290` | Resolves artifacts from a specific build |

### What the script does

1. Initializes `nuget.config` (uses `$ADO_PAT_XPERIENCE` for private feed auth)
2. Updates `.csproj` files with the pinned version
3. Installs `kentico.xperience.dbmanager` tool
4. Restores NuGet packages and builds the solution
5. Creates database `codesamples-<version>`
6. Generates `appsettings.local.json` with connection string
7. Enables CI and restores `CIRepository/` XML files
8. Runs data seeders (MemberSeeder, CustomerSeeder, OrderSeeder)

## Pre-release Packages and `--ci-migrate`

When CI restore fails because XML files were serialized against an older schema, use the `--ci-migrate` flag.

### Auto-resolve base from nuget.org

```bash
npm run codesamples:setversion -- 31.2.0-build1 --ci-migrate
```

### Explicit base version

```bash
npm run codesamples:setversion -- 31.2.0-build1 --ci-migrate 31.1.2-buildid
```

### When `--ci-migrate` itself fails

Try a different base version. The base version must be a released version whose schema is compatible enough for migration.

### After successful ci-migrate

Commit the updated XML files — they now contain new columns from the schema migration.

## Verification

After bootstrapping, verify the setup:

| Command | Purpose |
|---------|---------|
| `npm run codesamples:build` | Verify the project compiles |
| `npm run codesamples:serve` | Start the Website at `localhost:666` (uses `dotnet watch`) |

To background the server for continued work:

```bash
nohup npm run codesamples:serve > /tmp/codesamples-serve.log 2>&1 &
```

## Additional Commands

| Command | Purpose |
|---------|---------|
| `npm run codesamples:codegen` | Regenerate content type classes in `Generated/` |
| `npm run codesamples:store` | Serialize admin-created objects to CI XML files |

Review codegen output carefully — some generated files may include `//Include:` markers that affect documentation extraction.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 401 on NuGet restore | `ADO_PAT_XPERIENCE` is missing or expired | Verify the env var is set and the token is valid |
| CI restore fails | Pre-release version schema mismatch | Use `--ci-migrate` flag |
| Database connection fails | `DB_HOST`/`MSSQL_SA_PASSWORD` env vars wrong or DB not ready | Check env vars, wait for `db` healthcheck |
| Build fails after setversion | Breaking API changes in the target version | Check release notes for the target version, fix compilation errors |
