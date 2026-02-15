# Ralph Orchestrator — Configuration Guide

This document covers all configuration options for the Ralph Orchestrator.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your credentials
2. Edit `config.json` with your JIRA cloud ID and global settings
3. Configure agent profiles in `profiles/*/profile.json`
4. Run `npm run dev` to start in development mode

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
  "output": { ... },
  "dashboard": { ... }
}
```

Agent profiles are configured separately in `profiles/*/profile.json`, not in `config.json`.

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

### Agent Profiles (`profiles/*/profile.json`)

Profiles define how JIRA issues map to repositories and agent configurations. Each profile lives in its own directory under `profiles/` and is auto-discovered at startup.

```
profiles/
  ralph-docs/
    profile.json          — Profile configuration
    Dockerfile            — Container image
    docker-compose.yml    — Services, volumes, env vars
    setup.sh              — Post-create setup script
    agents/               — Agent definition files (.md)
  ralph-vscode/
    profile.json
    ...
```

#### `profile.json` Schema

```json
{
  "repo": "~/repositories/kentico-docs-jekyll",
  "cli": "copilot",
  "model": "claude-opus-4.6",
  "timeoutMs": 3600000,
  "setupScript": "/usr/local/bin/setup.sh",
  "auditLogPath": "/workspace/.ralph/logs/audit.jsonl",
  "composeProjectLabel": "ralph-sandbox",
  "beforeAgent": { "transitionId": "141" },
  "afterAgent": { "transitionId": "91" },
  "variants": [
    {
      "agent": "ralph",
      "match": { "projects": ["DF"], "statuses": ["New", "To Do"], "commentTrigger": "@RalphDocs" }
    }
  ]
}
```

#### Profile-Level Fields

| Field | Description | Default |
|---|---|---|
| `repo` | Path to the target repository. Supports `~` expansion. | — (required) |
| `cli` | Which CLI to use: `"copilot"` or `"claude"` | `"copilot"` |
| `model` | Model override (profile-level default for all variants). Copilot uses GitHub model IDs (e.g. `claude-opus-4.6`), Claude Code uses Anthropic IDs. | — (optional) |
| `timeoutMs` | Maximum execution time in milliseconds | `1800000` (30 min) |
| `setupScript` | Absolute path to the setup script inside the container | `"/usr/local/bin/setup.sh"` |
| `auditLogPath` | Absolute path to the audit JSONL log inside the container | `"/workspace/.ralph/logs/audit.jsonl"` |
| `composeProjectLabel` | Docker compose project label used for container lookup | `"ralph-sandbox"` |

The profile `id` is derived from the directory name (e.g. `profiles/ralph-docs/` → `id: "ralph-docs"`). The compose file path is always `profiles/<id>/docker-compose.yml`.

#### Variants

Each profile has a `variants` array. Each variant is a separate routing entry that maps JIRA matching rules to an agent name.

| Field | Description |
|---|---|
| `variant.agent` | Agent name passed to Copilot CLI (`--agent`). Not used by Claude Code. |
| `variant.model` | Optional model override (overrides the profile-level `model`). |
| `variant.match.projects` | JIRA project keys to match (e.g. `["DF"]`). Issue key prefix must match. |
| `variant.match.statuses` | Only match issues in these JIRA statuses (case-insensitive). Empty `[]` = match any. |
| `variant.match.commentTrigger` | Trigger string (required). At least one JIRA comment must contain this string (case-insensitive substring match) for the variant to trigger. Each matching comment triggers exactly one operation, tracked in the operation ledger. |

**Matching order:** Variants are evaluated in order, across all profiles. All matching triggers are planned, not just the first.

**Comment trigger dedup:** Each trigger comment is consumed exactly once per variant. The orchestrator tracks consumed comment IDs in the operation ledger. Repeated triggers on the same comment are ignored. Post a new trigger comment to request another invocation.

#### Transitions

| Field | Description |
|---|---|
| `beforeAgent.transitionId` | JIRA transition ID applied before the agent runs (e.g. "In Progress") |
| `afterAgent.transitionId` | JIRA transition ID applied after successful completion (e.g. "Ready for Review") |

Both are optional — omit or leave empty (`{}`) to skip transitions (useful for observer agents that don't change issue state).

**Finding transition IDs:** Use the JIRA REST API:
```bash
curl -u "$JIRA_EMAIL:$JIRA_PAT" \
  "https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/issue/<issue-key>/transitions"
```

#### Operation Ledger

The orchestrator tracks every agent invocation in a persistent per-issue JSON file at `output/logs/history/<issueKey>.json`. Operations go through lifecycle states:

```
pending → active → completed | error
                ↗
rejected (invalid state, preflight fail)
```

- **Crash recovery:** On startup, `active` operations are marked as `error` and a recovery comment is posted to JIRA.
- **Pending operations survive restart:** They're persisted on disk and resumed after recovery.
- **State re-validation:** Before executing, the orchestrator re-fetches the issue to verify it's still in a valid status.

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

## Example Configurations

### `config.json` (Global Settings)

```json
{
  "jira": {
    "baseUrl": "https://api.atlassian.com/ex/jira",
    "cloudId": "abc123-def456",
    "pollIntervalMs": 60000
  },
  "output": { "logDir": "./output/logs", "handoffDir": "./output/handoffs" },
  "dashboard": { "enabled": false }
}
```

### Single Profile, Single Variant

`profiles/ralph-docs/profile.json`:
```json
{
  "repo": "~/repositories/kentico-docs-jekyll",
  "timeoutMs": 1800000,
  "transitions": {
    "inProgressId": "141",
    "readyForReviewId": "91",
    "revisionId": "151"
  },
  "variants": [
    {
      "agent": "ralph",
      "match": {
        "projects": ["DF"],
        "keywords": [],
        "statuses": ["New", "To Do"],
        "revisionStatuses": ["Defect Found"]
      }
    }
  ]
}
```

### Multiple Variants in One Profile

`profiles/ralph-docs/profile.json`:
```json
{
  "repo": "~/repositories/kentico-docs-jekyll",
  "cli": "copilot",
  "timeoutMs": 3600000,
  "transitions": {
    "inProgressId": "141",
    "readyForReviewId": "91",
    "revisionId": "141"
  },
  "variants": [
    {
      "agent": "ralph.docs",
      "match": { "projects": ["DOCS"], "keywords": ["RalphDocs"], "statuses": ["To Do"] }
    },
    {
      "agent": "ralph",
      "match": { "projects": ["DF"], "keywords": ["Ralph"], "statuses": ["New", "To Do"], "revisionStatuses": ["Defect Found"] }
    }
  ]
}
```

In this setup, the same Docker infrastructure serves both variants. Issues with "RalphDocs" in the summary use the `ralph.docs` agent; all other `DF` issues with "Ralph" fall through to the `ralph` agent.

### Multiple Profiles (Mixed CLIs)

`profiles/ralph-vscode/profile.json`:
```json
{
  "repo": "~/repositories/kentico-docs-autocomplete-vscode",
  "cli": "claude",
  "timeoutMs": 1800000,
  "transitions": { "inProgressId": "51", "readyForReviewId": "91" },
  "variants": [
    { "agent": "ralph", "match": { "projects": ["DOC"], "keywords": ["RalphAutocomplete"] } }
  ]
}
```

Runs Claude Code CLI for the VS Code extension repo, while `ralph-docs` uses Copilot CLI.

## Validation

The orchestrator validates the configuration on startup:

- **Required fields:** `jira.cloudId`, at least one profile directory with valid `profile.json`, `JIRA_PAT`, `JIRA_EMAIL`
- **CLI credentials:** At least one of `GH_TOKEN` or `ANTHROPIC_API_KEY` must be set
- **Profile integrity:** Non-overlapping `statuses` and `revisionStatuses` within each variant, valid `repo` paths
- **Transition IDs:** Must be valid numeric strings
- **Profiles auto-discovered** from `profiles/*/profile.json` — the profile `id` is derived from the directory name

Invalid configuration causes the orchestrator to exit with a descriptive error message.
