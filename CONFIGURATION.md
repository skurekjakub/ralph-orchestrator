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
    docker-compose.yml    — Base compose: services, volumes, env vars
    setup.sh              — Post-create setup script
    agents/               — Agent definition files (.md)
  ralph-vscode/
    profile.json
    ...
shared/
  security/
    docker-compose.security.yml  — Security overlay (proxy, isolation, limits)
    squid.conf                   — Domain allowlist for egress proxy
  hooks/                         — Copilot CLI audit hooks
  agent-includes/                — Shared include files for agent templates
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
  "mcpServers": ["playwright", "discord-hitl"],
  "resources": { "mountBase": "resources/ralph-resources" },
  "cleanPaths": ["/workspace/resources/chats"],
  "beforeAgent": { "targetStatus": "In Progress" },
  "afterAgent": { "targetStatus": "Ready for Review" },
  "variants": [
    {
      "agent": "ralph.ralph",
      "match": { "projects": ["DF"], "statuses": ["New", "To Do"], "commentTrigger": "@RalphDf" }
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
| `mcpServers` | Array of MCP server names to enable. Must match subdirectories in `shared/mcp-servers/`. | `[]` |
| `resources` | Resource auto-discovery config: `{ "mountBase": "<path>" }`. Files in `profiles/<id>/resources/` are mounted read-only at `/workspace/<mountBase>/`. | — (optional) |
| `cleanPaths` | Array of absolute container paths to delete before each agent run. | `[]` |

The profile `id` is derived from the directory name (e.g. `profiles/ralph-docs/` → `id: "ralph-docs"`). The compose file path is always `profiles/<id>/docker-compose.yml`, which is automatically merged with the security overlay at `shared/security/docker-compose.security.yml` and the resources overlay at `profiles/<id>/agents/.build/docker-compose.overlay.yml` (if present).

#### Variants

Each profile has a `variants` array. Each variant is a separate routing entry that maps JIRA matching rules to an agent name.

| Field | Description |
|---|---|
| `variant.agent` | Agent name passed to Copilot CLI (`--agent`). Must match a `<name>.agent.md` file in the profile's `agents/` directory (validated at startup). Not used by Claude Code. |
| `variant.model` | Optional model override (overrides the profile-level `model`). |
| `variant.match.projects` | JIRA project keys to match (e.g. `["DF"]`). Issue key prefix must match. |
| `variant.match.statuses` | Only match issues in these JIRA statuses (case-insensitive). Empty `[]` = match any. |
| `variant.match.commentTrigger` | Trigger string (required). At least one JIRA comment must contain this string (case-insensitive substring match) for the variant to trigger. Each matching comment triggers exactly one operation, tracked in the operation ledger. |
| `variant.match.revisionStatuses` | Statuses that indicate a revision task (e.g. `["Defect Found"]`). When the issue is in one of these statuses, the agent follows the revision workflow instead of starting fresh. Empty `[]` = never treat as revision. |

**Matching order:** Variants are evaluated in order, across all profiles. All matching triggers are planned, not just the first.

**Comment trigger dedup:** Each trigger comment is consumed exactly once per variant. The orchestrator tracks consumed comment IDs in the operation ledger. Repeated triggers on the same comment are ignored. Post a new trigger comment to request another invocation.

#### Transitions

| Field | Description |
|---|---|
| `beforeAgent.targetStatus` | Target JIRA status name to transition to before the agent runs (e.g. `"In Progress"`) |
| `afterAgent.targetStatus` | Target JIRA status name to transition to after successful completion (e.g. `"Ready for Review"`) |

Both are optional — omit or leave empty (`{}`) to skip transitions (useful for observer agents that don't change issue state).

**Dynamic resolution:** The orchestrator queries the JIRA transitions API at runtime to find the transition ID that reaches the target status. This makes transitions portable across JIRA projects and source statuses — there's no need to look up or hardcode numeric IDs.

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

**Copilot CLI** runs: `copilot --config-dir /workspace/.ralph --agent <agent> --model <model> --experimental --yolo --share <transcript> -p <prompt>`

**Claude Code CLI** runs: `claude -p <prompt> --dangerously-skip-permissions --mcp-config /workspace/.ralph/mcp-config.json --strict-mcp-config [--model <model>]`

Both CLIs share the same `mcp-config.json` (generated at startup from profile `mcpServers` declarations). Copilot CLI discovers it via `--config-dir`; Claude Code loads it explicitly via `--mcp-config`.

#### MCP Servers

Profiles can declare MCP (Model Context Protocol) servers via the `mcpServers` array in `profile.json`. Each entry must match a subdirectory of `shared/mcp-servers/`.

At startup, the orchestrator:
1. Reads each server's `mcp-server.json` manifest
2. Generates `agents/.build/mcp-config.json` — shared by both Copilot and Claude Code CLIs
3. Generates `agents/.build/docker-compose.overlay.yml` — mounts the MCP servers directory, config file, and required env vars into the container

**Adding an MCP server:**
1. Create `shared/mcp-servers/<name>/mcp-server.json`:
   ```json
   {
     "name": "<name>",
     "description": "What this server does",
     "type": "npm",
     "command": "npx",
     "args": ["-y", "@scope/mcp-server-name"],
     "requiredEnv": ["SOME_TOKEN"],
     "proxyDomains": ["api.example.com"]
   }
   ```
2. Add `"<name>"` to the profile's `mcpServers` array
3. Add any required domains to `shared/security/squid.conf`
4. Pass required env vars via the profile's base `docker-compose.yml`

**Server types:**
- `"npm"` — npx-based servers. No local code needed (e.g. Playwright, ADO).
- `"custom"` — locally built servers with source in `src/` and bundle in `dist/`. Set `containerPath` to the mount target inside the container.

#### Resources

Profiles can auto-mount files from a `resources/` directory into the container. Configure via `resources.mountBase` in `profile.json`:

```json
{
  "resources": { "mountBase": "resources/ralph-resources" }
}
```

All files in `profiles/<id>/resources/` are recursively discovered and mounted read-only at `/workspace/<mountBase>/<relative-path>`. Mounts are included in the auto-generated compose overlay.

#### Clean Paths

The `cleanPaths` array lists absolute container paths that are deleted before each agent run:

```json
{
  "cleanPaths": ["/workspace/resources/chats"]
}
```

Useful for clearing agent-generated state (e.g. chat logs, cache files) between runs.

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

### Prompt Audit Settings

```json
"promptAudit": {
  "mode": "warn"
}
```

| Field | Description | Default |
|---|---|---|
| `mode` | How the prompt injection auditor handles findings: `"block"`, `"warn"`, or `"off"` | `"warn"` |

**Modes:**
- `"warn"` — Logs findings to the activity log but allows execution to proceed. Recommended for production to build baseline visibility without blocking legitimate tasks.
- `"block"` — Logs findings and **blocks execution** when critical patterns are detected (e.g., system instruction overrides, credential probing, prompt format tokens). Warnings still proceed.
- `"off"` — Disables prompt auditing entirely. Not recommended except for debugging.

The auditor scans untrusted JIRA data (description, comments, custom fields, handoff attachments) for common prompt injection patterns before passing the prompt to the agent CLI. See [SECURITY.md](SECURITY.md) for the full list of detected patterns.

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
  "beforeAgent": { "targetStatus": "In Progress" },
  "afterAgent": { "targetStatus": "Ready for Review" },
  "variants": [
    {
      "agent": "ralph.ralph",
      "match": {
        "projects": ["DF"],
        "statuses": ["New", "To Do", "Defect Found"],
        "commentTrigger": "@RalphDf",
        "revisionStatuses": ["Defect Found"]
      }
    }
  ]
}
```

When an issue is in "Defect Found" status and triggered, the agent receives a `Mode: REVISION` prompt with the previous handoff content.

### Multiple Variants in One Profile

`profiles/ralph-docs/profile.json`:
```json
{
  "repo": "~/repositories/kentico-docs-jekyll",
  "cli": "copilot",
  "timeoutMs": 3600000,
  "variants": [
    {
      "agent": "ralph.ralph",
      "match": {
        "projects": ["DF"],
        "statuses": ["New", "To Do", "Defect Found"],
        "commentTrigger": "@RalphDf",
        "revisionStatuses": ["Defect Found"]
      },
      "beforeAgent": { "targetStatus": "In Progress" },
      "afterAgent": { "targetStatus": "Ready for Review" }
    },
    {
      "agent": "ralph.malph",
      "match": { "projects": ["DF"], "statuses": ["Ready for Review"], "commentTrigger": "@Malph" }
    }
  ]
}
```

In this setup, the same Docker infrastructure serves both variants. Comments with `@RalphDf` trigger the writer agent on "New"/"To Do"/"Defect Found" issues; comments with `@Malph` trigger the reviewer on "Ready for Review" issues.

### Multiple Profiles (Mixed CLIs)

`profiles/ralph-vscode/profile.json`:
```json
{
  "repo": "~/repositories/kentico-docs-autocomplete-vscode",
  "cli": "claude",
  "timeoutMs": 1800000,
  "beforeAgent": { "targetStatus": "In Progress" },
  "afterAgent": { "targetStatus": "Ready for Review" },
  "variants": [
    { "agent": "ralph.ralph", "match": { "projects": ["DOC"], "commentTrigger": "@RalphAutocomplete" } }
  ]
}
```

Runs Claude Code CLI for the VS Code extension repo, while `ralph-docs` uses Copilot CLI.

## Validation

The orchestrator validates the configuration on startup:

- **Required fields:** `jira.cloudId`, at least one profile directory with valid `profile.json`, `JIRA_PAT`, `JIRA_EMAIL`
- **CLI credentials:** At least one of `GH_TOKEN` or `ANTHROPIC_API_KEY` must be set
- **Profile integrity:** Valid `repo` paths, agent names match `.agent.md` files in each profile's `agents/` directory, unique `commentTrigger` values
- **Transition IDs:** Must be valid numeric strings
- **Security infrastructure:** Security overlay compose file and squid.conf must exist, base compose files must use `ralph-internal` network, no `docker.sock` mounts
- **Docker daemon:** Must be reachable via `docker info`
- **Profiles auto-discovered** from `profiles/*/profile.json` — the profile `id` is derived from the directory name

Invalid configuration causes the orchestrator to exit with a descriptive error message.
