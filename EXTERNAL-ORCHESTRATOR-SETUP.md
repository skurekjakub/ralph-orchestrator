# External Orchestrator: Injecting Secrets into the Ralph Devcontainer

This document explains how to pass credentials (GH_TOKEN, ADO_PAT_DOCS, ADO_PAT_XPERIENCE, JIRA_PAT, etc.) from the orchestrator repository into the Ralph devcontainer **without splitting config across repos**.

---

## Overview

The Ralph devcontainer in `kentico-docs-jekyll` is designed to accept secrets externally. It declares **passthrough slots** but never stores actual values. All secret management lives in your orchestrator repo.

### Required Tokens

| Variable | Purpose | How to create |
|---|---|---|
| `GH_TOKEN` | GitHub Copilot CLI authentication | Fine-grained PAT with **"Copilot Requests"** permission ([create here](https://github.com/settings/personal-access-tokens/new)) |
| `ADO_PAT_DOCS` | Azure DevOps API access — docs repo (KenticoCustomerSuccess org) | [Create ADO PAT](https://dev.azure.com/) → User Settings → Personal Access Tokens |
| `ADO_PAT_XPERIENCE` | Azure DevOps API access — xperience repo (kenticoxperience org) | [Create ADO PAT](https://dev.azure.com/) → User Settings → Personal Access Tokens |
| `JIRA_PAT` | JIRA API access | API token from [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |

---

## Option 1: `devcontainer exec --remote-env` (Recommended)

The devcontainer CLI's `--remote-env` flag injects env vars at exec-time. **Zero config needed in the target repo.**

### Setup in your orchestrator

```bash
#!/bin/bash
# orchestrator/scripts/ralph-run.sh

RALPH_REPO="/path/to/kentico-docs-jekyll"
DEVCONTAINER_CONFIG="$RALPH_REPO/.devcontainer/ralph"

# 1. Start the devcontainer (if not running)
devcontainer up --workspace-folder "$RALPH_REPO" \
  --config "$DEVCONTAINER_CONFIG/devcontainer.json"

# 2. Execute with secrets injected at runtime
devcontainer exec \
  --workspace-folder "$RALPH_REPO" \
  --config "$DEVCONTAINER_CONFIG/devcontainer.json" \
  --remote-env "GH_TOKEN=$GH_TOKEN" \
  --remote-env "ADO_PAT_DOCS=$ADO_PAT_DOCS" \
  --remote-env "ADO_PAT_XPERIENCE=$ADO_PAT_XPERIENCE" \
  --remote-env "JIRA_PAT=$JIRA_PAT" \
  -- copilot -p "Your prompt here" --yolo
```

### Pros
- **All config lives in the orchestrator** — the target repo knows nothing about which secrets exist
- Each invocation can pass different values
- Works with the devcontainer spec natively

### Cons
- Requires the devcontainer CLI (`npm install -g @devcontainers/cli`)
- Slightly more verbose than `docker exec`

---

## Option 2: `docker exec -e` (Simplest)

Bypass the devcontainer CLI entirely and talk directly to Docker. **Zero config needed anywhere.**

### Setup in your orchestrator

```bash
#!/bin/bash
# orchestrator/scripts/ralph-run.sh

CONTAINER="ralph-sandbox-app-1"  # or discover dynamically

# Execute with secrets injected
docker exec -w /workspace \
  -e GH_TOKEN="$GH_TOKEN" \
  -e ADO_PAT_DOCS="$ADO_PAT_DOCS" \
  -e ADO_PAT_XPERIENCE="$ADO_PAT_XPERIENCE" \
  -e JIRA_PAT="$JIRA_PAT" \
  "$CONTAINER" \
  copilot -p "Your prompt here" --yolo
```

### Discovering the container name dynamically

```bash
# By compose project name
CONTAINER=$(docker compose -f /path/to/docker-compose.yml ps -q app)

# Or by label
CONTAINER=$(docker ps --filter "label=com.docker.compose.project=ralph-sandbox" \
  --filter "label=com.docker.compose.service=app" -q)
```

### Pros
- Simplest — no devcontainer CLI needed
- Works with any Docker setup

### Cons
- Skips devcontainer-level features like `remoteEnv`, `userEnvProbe`
- You must know/discover the container name

---

## Option 3: Host Environment → Docker Compose Passthrough

The Ralph `docker-compose.yml` already declares `GH_TOKEN: "${GH_TOKEN}"`. Docker Compose inherits host environment variables automatically.

### Setup in your orchestrator

```bash
#!/bin/bash
# orchestrator/scripts/ralph-start.sh

# Export secrets to host environment
export GH_TOKEN="$(vault read -field=token secret/gh-copilot)"
export ADO_PAT_DOCS="$(vault read -field=token secret/ado-docs)"
export ADO_PAT_XPERIENCE="$(vault read -field=token secret/ado-xperience)"
export JIRA_PAT="$(vault read -field=token secret/jira)"
export MSSQL_SA_PASSWORD="StrongPassword123!"

# Start the devcontainer — compose inherits host env
cd /path/to/kentico-docs-jekyll
devcontainer up --workspace-folder . \
  --config .devcontainer/ralph/devcontainer.json
```

To add new variables (e.g., `JIRA_PAT`) to the compose passthrough, add to `docker-compose.yml`:

```yaml
environment:
  JIRA_PAT: "${JIRA_PAT}"
  ADO_PAT_DOCS: "${ADO_PAT_DOCS}"
  ADO_PAT_XPERIENCE: "${ADO_PAT_XPERIENCE}"
```

**However**, the user explicitly asked to avoid modifying the target repo. If you need variables not already declared in compose, use Option 1 or 2 instead.

---

## Option 4: `remoteEnv` + `${localEnv:...}` (Already Configured)

The Ralph devcontainer.json already declares passthrough slots using the devcontainer spec's `${localEnv:VAR}` syntax:

```jsonc
"remoteEnv": {
  "GH_TOKEN": "${localEnv:GH_TOKEN}",
  "ADO_PAT_DOCS": "${localEnv:ADO_PAT_DOCS}",
  "ADO_PAT_XPERIENCE": "${localEnv:ADO_PAT_XPERIENCE}",
  "JIRA_PAT": "${localEnv:JIRA_PAT}"
}
```

This means: *"If the host has these env vars set, forward them into the container."* The actual values are never in this repo.

### Setup in your orchestrator

```bash
# Just export before devcontainer up/exec — they flow through automatically
export GH_TOKEN="ghp_..."
export ADO_PAT_DOCS="..."
export ADO_PAT_XPERIENCE="..."
export JIRA_PAT="..."

devcontainer up --workspace-folder /path/to/kentico-docs-jekyll \
  --config .devcontainer/ralph/devcontainer.json
```

### Adding new variables later

If you need to add more secrets (e.g., `SLACK_WEBHOOK`), you'd need to add them to `remoteEnv` in devcontainer.json. This is the one downside — new variables require a change in the target repo.

**Workaround**: Use Option 1 or 2 for ad-hoc variables alongside Option 4 for standard ones.

---

## Recommended: Orchestrator Directory Structure

```
ralph-orchestrator/
├── .env                        # Local secrets (gitignored!)
├── .env.example                # Template showing required vars
├── scripts/
│   ├── start.sh                # devcontainer up
│   ├── run.sh                  # Single prompt execution
│   ├── loop.sh                 # Autonomous loop harness
│   └── stop.sh                 # devcontainer down
├── prompts/
│   ├── default.md              # Default system prompt
│   └── task-specific.md        # Task-specific prompts
├── agents/                     # Custom Copilot CLI agents (optional)
│   └── ralph-docs.md           # Docs-specialist agent profile
└── README.md
```

### `.env.example`

```bash
# GitHub — Fine-grained PAT with "Copilot Requests" permission
GH_TOKEN=

# Azure DevOps — docs repo (KenticoCustomerSuccess)
ADO_PAT_DOCS=
ADO_ORG_DOCS=https://dev.azure.com/KenticoCustomerSuccess

# Azure DevOps — xperience repo (kenticoxperience)
ADO_PAT_XPERIENCE=

# JIRA — API token from id.atlassian.com
JIRA_PAT=
JIRA_EMAIL=
JIRA_BASE_URL=

# SQL Server (optional override)
MSSQL_SA_PASSWORD=Password123!
```

### `scripts/run.sh`

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../.env"

RALPH_REPO="${RALPH_REPO:-/path/to/kentico-docs-jekyll}"
PROMPT="${1:-Summarize recent changes in the documentation}"

devcontainer exec \
  --workspace-folder "$RALPH_REPO" \
  --config "$RALPH_REPO/.devcontainer/ralph/devcontainer.json" \
  --remote-env "GH_TOKEN=$GH_TOKEN" \
  --remote-env "ADO_PAT_DOCS=$ADO_PAT_DOCS" \
  --remote-env "ADO_PAT_XPERIENCE=$ADO_PAT_XPERIENCE" \
  --remote-env "JIRA_PAT=$JIRA_PAT" \
  -- copilot -p "$PROMPT" --yolo
```

### `scripts/loop.sh`

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../.env"

RALPH_REPO="${RALPH_REPO:-/path/to/kentico-docs-jekyll}"
PROMPT_FILE="${1:-$SCRIPT_DIR/../prompts/default.md}"
MAX_ITERATIONS="${2:-10}"
SLEEP_BETWEEN=5

for i in $(seq 1 "$MAX_ITERATIONS"); do
    echo "━━━ Iteration $i/$MAX_ITERATIONS ━━━"

    devcontainer exec \
      --workspace-folder "$RALPH_REPO" \
      --config "$RALPH_REPO/.devcontainer/ralph/devcontainer.json" \
      --remote-env "GH_TOKEN=$GH_TOKEN" \
      --remote-env "ADO_PAT_DOCS=$ADO_PAT_DOCS" \
      --remote-env "ADO_PAT_XPERIENCE=$ADO_PAT_XPERIENCE" \
      --remote-env "JIRA_PAT=$JIRA_PAT" \
      -- copilot -p "$(cat "$PROMPT_FILE")" --yolo

    EXIT_CODE=$?
    echo "Exit code: $EXIT_CODE"

    if [ $EXIT_CODE -ne 0 ]; then
        echo "Error in iteration $i, stopping."
        break
    fi

    sleep $SLEEP_BETWEEN
done
```

---

## CI/CD: Azure DevOps Pipeline

If orchestrating from an Azure DevOps pipeline:

```yaml
steps:
  - script: |
      devcontainer up \
        --workspace-folder $(Build.SourcesDirectory) \
        --config .devcontainer/ralph/devcontainer.json
    displayName: 'Start Ralph devcontainer'

  - script: |
      devcontainer exec \
        --workspace-folder $(Build.SourcesDirectory) \
        --config .devcontainer/ralph/devcontainer.json \
        --remote-env "GH_TOKEN=$(GH_TOKEN)" \
        --remote-env "ADO_PAT_DOCS=$(ADO_PAT_DOCS)" \
        --remote-env "ADO_PAT_XPERIENCE=$(ADO_PAT_XPERIENCE)" \
        --remote-env "JIRA_PAT=$(JIRA_PAT)" \
        -- copilot -p "$(PROMPT)" --yolo
    displayName: 'Run Ralph'
    env:
      GH_TOKEN: $(GH_TOKEN)
      JIRA_PAT: $(JIRA_PAT)
```

Pipeline variables `GH_TOKEN` and `JIRA_PAT` are stored as **secret variables** in the pipeline or variable group. `System.AccessToken` provides the ADO PAT automatically.

---

## Summary

| Approach | Config in target repo | Config in orchestrator | Best for |
|---|---|---|---|
| `devcontainer exec --remote-env` | None needed | Script with vars | **Production orchestration** |
| `docker exec -e` | None needed | Script with vars | Simple/direct |
| Host env → compose `${VAR}` | Compose declares slots | Export vars | CI pipelines |
| `remoteEnv` + `${localEnv:...}` | Declares passthrough | Just export | Standard devcontainer usage |
