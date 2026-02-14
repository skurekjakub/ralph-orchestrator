# Ralph Orchestrator — Configuration Guide

This document covers all configuration options for the Ralph Orchestrator.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your credentials
2. Edit `config.json` with your JIRA cloud ID and agent profiles
3. Run `npm run dev` to start in development mode

## Environment Variables (`.env`)

Secrets and credentials live in `.env`. Never commit this file.

| Variable | Description | Required |
|---|---|---|
| `GH_TOKEN` | GitHub fine-grained PAT with **Copilot Requests** permission | When using Copilot CLI |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Code CLI | When using Claude Code CLI |
| `ADO_PAT_DOCS` | Azure DevOps PAT for KenticoCustomerSuccess org (Code: Read+Write) | Yes |
| `ADO_PAT_XPERIENCE` | Azure DevOps PAT for kenticoxperience org (Code: Read) | No |
| `JIRA_PAT` | JIRA API token (classic, from [id.atlassian.com](https://id.atlassian.com)) | Yes |
| `JIRA_EMAIL` | Email associated with the JIRA API token | Yes |
| `DASHBOARD_URL` | Ralph status dashboard URL | No |
| `DASHBOARD_SECRET` | Shared secret for dashboard authentication | No |

> At least one of `GH_TOKEN` or `ANTHROPIC_API_KEY` must be set. The orchestrator selects the CLI based on each profile's preference, falling back to the other if the preferred credential is missing.

## Configuration File (`config.json`)

### Structure

```json
{
  "jira": { ... },
  "profiles": [ ... ],
  "output": { ... },
  "dashboard": { ... }
}
```

### JIRA Settings

```json
"jira": {
  "baseUrl": "https://api.atlassian.com/ex/jira",
  "cloudId": "<your-jira-cloud-guid>",
  "pollIntervalMs": 60000
}
```

| Field | Description | Default |
|---|---|---|
| `baseUrl` | JIRA Cloud REST API base URL | — |
| `cloudId` | Your Atlassian Cloud site ID (GUID) | — |
| `pollIntervalMs` | How often to poll JIRA for new issues (milliseconds) | `60000` |

**Finding your Cloud ID:** Visit `https://<your-site>.atlassian.net/_edge/tenant_info` — the `cloudId` field is what you need.

### Agent Profiles

Profiles define how JIRA issues map to repositories and agent configurations. The `profiles` array is evaluated in order — the first matching profile wins.

```json
"profiles": [
  {
    "id": "ralph-docs",
    "repo": "~/repositories/kentico-docs-jekyll",
    "composeFile": "profiles/ralph-docs/docker-compose.yml",
    "agent": "ralph",
    "cli": "copilot",
    "model": "claude-opus-4.6",
    "timeoutMs": 1800000,
    "setupScript": "/usr/local/bin/setup.sh",
    "auditLogPath": "/workspace/.ralph/logs/audit.jsonl",
    "composeProjectLabel": "ralph-sandbox",
    "match": {
      "projects": ["DF"],
      "keywords": [],
      "statuses": ["New", "To Do"],
      "revisionStatuses": ["Defect Found"]
    },
    "transitions": {
      "inProgressId": "141",
      "readyForReviewId": "91",
      "revisionId": "151"
    }
  }
]
```

#### Profile Fields

| Field | Description | Default |
|---|---|---|
| `id` | Unique identifier for the profile | — (required) |
| `repo` | Path to the target repository. Supports `~` expansion. | — (required) |
| `composeFile` | Path to `docker-compose.yml` relative to orchestrator root | `"profiles/<id>/docker-compose.yml"` |
| `agent` | Agent name passed to Copilot CLI (`--agent`). Not used by Claude Code. | `"ralph"` |
| `cli` | Which CLI to use: `"copilot"` or `"claude"` | `"copilot"` |
| `model` | Model override. Copilot uses GitHub model IDs (e.g. `claude-opus-4.6`), Claude Code uses Anthropic IDs (e.g. `claude-sonnet-4-20250514`). When omitted, each CLI uses its own default. | — (optional) |
| `timeoutMs` | Maximum execution time in milliseconds | `1800000` (30 min) |
| `setupScript` | Absolute path to the setup script inside the container | `"/usr/local/bin/setup.sh"` |
| `auditLogPath` | Absolute path to the audit JSONL log inside the container | `"/workspace/.ralph/logs/audit.jsonl"` |
| `composeProjectLabel` | Docker compose project label used for container lookup | `"ralph-sandbox"` |

#### Match Rules

| Field | Description |
|---|---|
| `match.projects` | JIRA project keys to match (e.g. `["DF"]`). Issue key prefix must match. |
| `match.keywords` | Keywords matched case-insensitively against the issue summary. Empty array `[]` = catch-all for any summary. |
| `match.statuses` | Only match issues in these JIRA statuses (case-insensitive). Empty `[]` = match any status. |
| `match.revisionStatuses` | Statuses that trigger the revision workflow (e.g. `["Defect Found"]`). Issues in these statuses bypass queue dedup and are re-processed with revision context. **Must not overlap with `statuses`.** |

**Matching order:** Profiles are evaluated top-to-bottom. The first profile whose rules match the issue wins. If no profile matches, the issue is skipped with a warning.

**Catch-all pattern:** To match all issues in a project regardless of summary, use `"keywords": []`.

#### Transitions

| Field | Description |
|---|---|
| `transitions.inProgressId` | JIRA transition ID to move the issue to "In Progress" |
| `transitions.readyForReviewId` | JIRA transition ID to move the issue to "Ready for Review" |
| `transitions.revisionId` | Transition ID for revision pickup. Falls back to `inProgressId` if not set. |

**Finding transition IDs:** Use the JIRA REST API:
```bash
curl -u "$JIRA_EMAIL:$JIRA_PAT" \
  "https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/issue/<issue-key>/transitions"
```

#### CLI Selection

The orchestrator selects which CLI to use based on the profile's `cli` preference and available credentials:

| Profile `cli` | `GH_TOKEN` set | `ANTHROPIC_API_KEY` set | Result |
|---|---|---|---|
| `"copilot"` | Yes | Any | Copilot CLI |
| `"claude"` | Any | Yes | Claude Code CLI |
| `"copilot"` | No | Yes | Falls back to Claude Code (with warning) |
| `"claude"` | Yes | No | Falls back to Copilot (with warning) |
| Either | No | No | Error — no CLI available |

**Copilot CLI** runs: `copilot --agent <agent> --model <model> --experimental --yolo -p <prompt>`

**Claude Code CLI** runs: `claude -p <prompt> --dangerously-skip-permissions [--model <model>]`

### Output Settings

```json
"output": {
  "logDir": "./output/logs",
  "handoffDir": "./output/handoffs"
}
```

| Field | Description | Default |
|---|---|---|
| `logDir` | Directory for execution logs, audit trails, and activity logs | `"./output/logs"` |
| `handoffDir` | Directory for handoff files (currently unused — Ralph attaches directly to JIRA) | `"./output/handoffs"` |

### Dashboard Settings

```json
"dashboard": {
  "enabled": true,
  "intervalMs": 30000
}
```

| Field | Description | Default |
|---|---|---|
| `enabled` | Enable heartbeat reporting to the status dashboard | `true` |
| `intervalMs` | Heartbeat interval in milliseconds | `30000` |

The dashboard requires `DASHBOARD_URL` and `DASHBOARD_SECRET` in `.env`. If `enabled` is `false` or the env vars are missing, no heartbeats are sent.

Multiple orchestrator instances can report to the same dashboard — each generates a unique agent ID on startup.

## Example Configuration

### Single Profile (Copilot CLI)

```json
{
  "jira": {
    "baseUrl": "https://api.atlassian.com/ex/jira",
    "cloudId": "abc123-def456",
    "pollIntervalMs": 60000
  },
  "profiles": [
    {
      "id": "ralph-docs",
      "repo": "~/repositories/kentico-docs-jekyll",
      "agent": "ralph",
      "timeoutMs": 1800000,
      "match": {
        "projects": ["DF"],
        "keywords": [],
        "statuses": ["New", "To Do"],
        "revisionStatuses": ["Defect Found"]
      },
      "transitions": {
        "inProgressId": "141",
        "readyForReviewId": "91",
        "revisionId": "151"
      }
    }
  ],
  "output": { "logDir": "./output/logs", "handoffDir": "./output/handoffs" },
  "dashboard": { "enabled": false }
}
```

### Multiple Profiles (Mixed CLIs)

```json
{
  "jira": {
    "baseUrl": "https://api.atlassian.com/ex/jira",
    "cloudId": "abc123-def456",
    "pollIntervalMs": 60000
  },
  "profiles": [
    {
      "id": "ralph-vscode",
      "repo": "~/repositories/kentico-docs-autocomplete-vscode",
      "agent": "ralph",
      "cli": "claude",
      "timeoutMs": 1800000,
      "match": {
        "projects": ["DF"],
        "keywords": ["RalphVSCode"],
        "statuses": ["New", "To Do"]
      },
      "transitions": {
        "inProgressId": "51",
        "readyForReviewId": "91"
      }
    },
    {
      "id": "ralph-docs",
      "repo": "~/repositories/kentico-docs-jekyll",
      "agent": "ralph",
      "cli": "copilot",
      "timeoutMs": 1800000,
      "match": {
        "projects": ["DF"],
        "keywords": [],
        "statuses": ["New", "To Do"],
        "revisionStatuses": ["Defect Found"]
      },
      "transitions": {
        "inProgressId": "141",
        "readyForReviewId": "91",
        "revisionId": "151"
      }
    }
  ],
  "output": { "logDir": "./output/logs", "handoffDir": "./output/handoffs" },
  "dashboard": { "enabled": true, "intervalMs": 30000 }
}
```

In this setup:
- Issues with "RalphVSCode" in the summary use Claude Code CLI against the VS Code extension repo
- All other DF issues fall through to the docs repo with Copilot CLI (catch-all via empty `keywords`)

## Validation

The orchestrator validates the configuration on startup:

- **Required fields:** `jira.cloudId`, `profiles` (at least one), `JIRA_PAT`, `JIRA_EMAIL`
- **CLI credentials:** At least one of `GH_TOKEN` or `ANTHROPIC_API_KEY` must be set
- **Profile integrity:** Unique IDs, non-overlapping `statuses` and `revisionStatuses`, compose file existence
- **Transition IDs:** Must be valid numeric strings

Invalid configuration causes the orchestrator to exit with a descriptive error message.
