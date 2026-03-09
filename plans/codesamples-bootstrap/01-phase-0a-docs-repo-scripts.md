# Phase 0a: Docs-Repo Script Modifications

**Repo:** `kentico-docs-jekyll` (external — prerequisite, must merge first)
**Blocking:** Phases A–H (agent cannot bootstrap non-interactively without these changes)

## Problem

Two scripts in the docs repo use interactive authentication that blocks in headless (Docker container) environments:

1. **`src/_code/scripts/helpers/nuget-config.sh`** — reads ADO PAT via `read -rs pat < /dev/tty`
2. **`src/_code/scripts/helpers/download-pr-artefacts.sh`** — uses `az login` (browser-based) + 6 other az CLI calls

Both are called by `npm run codesamples:setversion`.

There is also a caller-side issue: `set-version.sh` is the real entrypoint, but today it does not enforce bootstrap preconditions early enough and may still invoke helper scripts in a way that drops the PAT context or fails later than necessary. The root-cause fix lives at the entrypoint plus the helpers, not in the helpers alone.

## Script 0: `set-version.sh` — caller contract + preflight

### Required change

Keep `set-version.sh` as the single entrypoint for all selector formats, but make it responsible for the common preflight and helper contract:

1. Verify `src/_code/license.txt` exists before any package restore or artifact download work starts.
2. Preserve and pass through `ADO_PAT_XPERIENCE` consistently to the helper path instead of relying on an empty or implicit value.
3. Fail early with a clear message when a selector requires authenticated access and the PAT is missing.
4. Keep the current selector contract unchanged: semver, private-feed version, PR URL, and build URL all continue to flow through `npm run codesamples:setversion`.

### Why this belongs here

Fixing only `nuget-config.sh` and `download-pr-artefacts.sh` still leaves the caller responsible for orchestration mistakes. `set-version.sh` should be the place that decides whether the run is valid before expensive work starts.

## Script 1: `nuget-config.sh` — PAT from env var

### Current behavior

```bash
# Lines ~27-29: Interactive PAT input
echo -e "Azure DevOps Personal Access Token (PAT) needed for private feeds"
echo -e "Enter your PAT (or press Enter to use public feeds only):"
IFS= read -rs pat < /dev/tty    # ← BLOCKS on /dev/tty in headless mode
```

If user presses Enter (no PAT), creates public-only `nuget.config` (nuget.org only).

### Required change

Read `$ADO_PAT_XPERIENCE` env var first, fall back to interactive prompt only when empty:

```bash
pat="${ADO_PAT_XPERIENCE:-}"
if [ -z "$pat" ]; then
    echo -e "${BLUE:-}Azure DevOps Personal Access Token (PAT) needed for private feeds${NC:-}"
    echo -e "${BLUE:-}Enter your PAT (or press Enter to use public feeds only):${NC:-}"
    IFS= read -rs pat < /dev/tty
    echo ""
fi
```

**Impact:** Zero behavior change for human devs (env var is typically unset on dev machines). Enables headless automation when `ADO_PAT_XPERIENCE` is set.

If the env var is present but authentication fails, the script should stop with an explicit error. It should not silently degrade to public-only feeds in that case.

## Script 2: `download-pr-artefacts.sh` — Replace az CLI with curl + PAT

### Current az CLI flow

The script uses 7 az CLI commands for PR/build URL formats:

| # | Command | Purpose |
|---|---------|---------|
| 1 | `az extension list` | Check azure-devops extension |
| 2 | `az extension add` | Install extension if missing |
| 3 | `az account show` | Check active Azure session |
| 4 | `az login` | **Interactive browser login** ← blocker |
| 5 | `az pipelines show --name "Pull Request Validation"` | Get pipeline definition ID |
| 6 | `az pipelines build list --branch "refs/pull/$PR_ID/merge"` | Find latest build for PR |
| 7 | `az pipelines runs artifact download --artifact-name "NuGetPackages"` | Download artifact zip |

Only commands 5–7 make actual API calls. The rest are auth/setup.

### Required change

Replace the entire az CLI dependency with 3 `curl` + PAT Basic auth calls:

```bash
# Auth header from env var
AUTH="Authorization: Basic $(echo -n ":$ADO_PAT_XPERIENCE" | base64)"
ORG="kenticoxperience"
PROJECT="CMS"

# 1. Get pipeline definition ID by name
PIPELINE_ID=$(curl -sf -H "$AUTH" \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/pipelines?api-version=7.0" \
  | jq -r '.value[] | select(.name=="Pull Request Validation") | .id')

# 2. Get latest build for PR branch
BUILD_ID=$(curl -sf -H "$AUTH" \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/build/builds?api-version=7.0&definitions=$PIPELINE_ID&branchName=refs/pull/$PR_ID/merge&\$top=1&\$orderby=startTime%20desc" \
  | jq -r '.value[0].id')

# 3. Get artifact download URL
ARTIFACT_URL=$(curl -sf -H "$AUTH" \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/build/builds/$BUILD_ID/artifacts?api-version=7.1" \
  | jq -r '.value[] | select(.name=="NuGetPackages") | .resource.downloadUrl')

# 4. Download artifact zip (signed URL may not need auth, but include it for safety)
curl -sf -H "$AUTH" -o NuGetPackages.zip "$ARTIFACT_URL"
unzip -o NuGetPackages.zip -d local-packages/
```

### For build URL format (already has build ID)

When `xpversion` is a build URL (e.g., `https://dev.azure.com/...?buildId=550290`), skip steps 1–2 and extract `BUILD_ID` directly from the URL.

### Dependencies

- `curl` — standard in both devcontainer and ralph-docs Docker image
- `jq` — standard in devcontainer; **verify it's installed in the ralph-docs Dockerfile** (add to `apt-get install` if missing)

### PAT permissions

`ADO_PAT_XPERIENCE` needs **Build (Read)** scope on the `kenticoxperience` org. This is in addition to the existing **Packaging (Read)** scope for NuGet feeds.

## Implementation notes

- Both changes are backward-compatible — human devs without `ADO_PAT_XPERIENCE` set get the same interactive behavior as today
- The scripts should log whether they're using env var or interactive mode for debuggability
- Error handling: if the PAT is set but invalid (401), the script should fail with a clear message rather than silently falling back to public-only config

## Generated-artifact hygiene

Bootstrap creates local artifacts that should not pollute git status during agent runs.

### Docs-repo ignore rules

Update the docs repo `.gitignore` to ignore bootstrap-generated files such as:

- `src/_code/src/nuget.config`
- generated `Website.csproj` and `CodeSamples.csproj`
- `src/_code/src/Website/appsettings.Development.json`
- `src/_code/local-packages`

### Fallback only if needed

If docs-repo ignore rules are insufficient for some generated path, the orchestrator can still add a `.git/info/exclude` fallback later. That should remain a fallback, not the primary fix.
