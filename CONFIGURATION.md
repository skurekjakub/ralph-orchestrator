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
| `ADO_PAT` | Azure DevOps PAT for KenticoCustomerSuccess org (Code: Read+Write) | Yes |
| `ADO_PAT_XPERIENCE` | Azure DevOps PAT for kenticoxperience org (Code: Read) | No |
| `JIRA_PAT` | JIRA API token (classic, from [id.atlassian.com](https://id.atlassian.com)) | Yes |
| `JIRA_EMAIL` | Email associated with the JIRA API token | Yes |
| `DASHBOARD_URL` | Ralph status dashboard URL | No |
| `DASHBOARD_SECRET` | Shared secret for dashboard authentication | No |
| `DISCORD_BOT_TOKEN` | Discord bot token for the discord-hitl MCP server | When using discord-hitl |
| `DISCORD_CHANNEL_ID` | Discord channel ID where HITL threads are created | When using discord-hitl |

> At least one of `GH_TOKEN` or `ANTHROPIC_API_KEY` must be set. The orchestrator selects the CLI based on each profile's preference, falling back to the other if the preferred credential is missing.

## Configuration File (`config.json`)

### Structure

```json
{
  "dataSources": {
    "<source-key>": {
      "type": "jira",
      "connection": { ... },
      "pollIntervalMs": 60000
    }
  },
  "plugins": [],
  "output": { ... },
  "dashboard": { ... },
  "promptAudit": { ... },
  "enableContinuation": true
}
```

Agent profiles are configured separately in `profiles/*/profile.json`, not in `config.json`.

### Data Sources

Each entry in `dataSources` defines a connection to an external work item source. The key (e.g. `"kentico-jira"`) is referenced by profiles via `profile.dataSource`.

```json
"dataSources": {
  "kentico-jira": {
    "type": "jira",
    "connection": {
      "baseUrl": "https://api.atlassian.com/ex/jira",
      "cloudId": "<your-jira-cloud-guid>",
      "excludeFields": [],
      "allowedUsers": []
    },
    "pollIntervalMs": 60000
  }
}
```

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Registered data source type (e.g. `"jira"`). Must match a factory registered via `registerDataSourceFactory()`. |
| `connection` | `object` | Type-specific connection properties. For JIRA: `baseUrl`, `cloudId`, `excludeFields`, `allowedUsers`. Credentials (`email`, `apiToken`) are injected from `.env` at load time. |
| `pollIntervalMs` | `number` | How often to poll for new work items (milliseconds). Default: `60000`. |

**Finding your JIRA Cloud ID:** Visit `https://<your-site>.atlassian.net/_edge/tenant_info` — the `cloudId` field is what you need.

### Plugins

Additional data source connector modules to load at startup. Each module must call `registerDataSourceFactory()` as a side effect on import.

```json
"plugins": [
  "my-datasource-package/factory.js"
]
```

Built-in connectors (JIRA) are loaded automatically — they don't need to be listed here. See `docs/data-source-registration.md` for the full integration guide.

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
  agent-includes/                — Shared Liquid partials for agent templates (*.md)
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
  "mcpServers": [
    { "name": "jira-kentico", "env": { "JIRA_ISSUE_KEY": "$task.id" } },
    { "name": "ado", "env": { "ADO_PROJECT": "CustomerEducation", "ADO_REPO": "kentico-docs-jekyll", "TASK_BRANCH": "$task.branch" } }
  ],
  "resources": { "mountBase": "resources/ralph-resources" },
  "skills": ["git-workflow"],
  "cleanPaths": ["/workspace/.ralph/tasks"],
  "vcsProvider": "ado",
  "repoPat": "ADO_PAT",
  "variants": [
    {
      "stages": [
        { "agent": "ralph.ralph", "role": "primary" }
      ],
      "match": { "projects": ["DF"], "statuses": ["New", "To Do"], "commentTrigger": "@RalphDf" },
      "beforeAgent": { "targetStatus": "In Progress" },
      "afterAgent": { "targetStatus": "Ready for Review" }
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
| `mcpServers` | Array of MCP server entries. Each entry is either a string (server name) or an object `{ name, env? }` with per-server environment variables. Server names must match subdirectories in `shared/mcp-servers/`. Values in `env` starting with `$` are JIT macros resolved per-task (see MCP Servers section). | `[]` |
| `resources` | Resource auto-discovery config: `{ "mountBase": "<path>" }`. Files in `profiles/<id>/resources/` are mounted read-only at `/workspace/<mountBase>/`. | — (optional) |
| `cleanPaths` | Array of absolute container paths to delete before each agent run. | `[]` |
| `maxContinuations` | Maximum number of automatic retry attempts when the agent's session ends without producing the `===RALPH_RESULT_START===` block. Uses `--continue` to resume the previous CLI session with exponential backoff (5s base, 30s cap). `0` = disabled (single invocation only). | `0` |
| `githubMcpTools` | Control the bundled GitHub MCP server in Copilot CLI. `false` = server disabled (`--disable-builtin-mcps`), `["get_file_contents"]` = enable only listed tools (`--add-github-mcp-tool`). Empty array is a validation error. Only affects `cli: "copilot"`. | `false` |
| `skills` | Array of skill folder names from `shared/skills/` to mount into the container at `.github/skills/`. Each name must match a subdirectory in `shared/skills/`. Validated at startup. | `[]` |
| `vcsProvider` | VCS hosting provider for the target repo: `"ado"` (Azure DevOps) or `"github"`. Controls the auth header format used by the repo-sync hook. | `"ado"` |
| `repoPat` | Name of the env var containing the git PAT for the repo-sync hook. | `"ADO_PAT"` (ado) or `"GH_TOKEN"` (github) |

The profile `id` is derived from the directory name (e.g. `profiles/ralph-docs/` → `id: "ralph-docs"`). The compose file path is always `profiles/<id>/docker-compose.yml`, which is automatically merged with the security overlay at `shared/security/docker-compose.security.yml` and the resources overlay at `profiles/<id>/.build/docker-compose.overlay.yml` (if present).

#### Variants

Each profile has a `variants` array. Each variant is a separate routing entry that maps JIRA matching rules to a **pipeline of stages** — one or more agent invocations executed sequentially.

| Field | Description |
|---|---|
| `variant.stages` | Array of stage objects (at least one required). Each stage defines an agent, role, execution mode, and optional overrides. Stages run sequentially — if any stage fails, the pipeline aborts. See [Stages](#stages) below. |
| `variant.model` | Optional model override (overrides the profile-level `model`). Individual stages can further override this. |
| `variant.match.projects` | JIRA project keys to match (e.g. `["DF"]`). Issue key prefix must match. |
| `variant.match.statuses` | Only match issues in these JIRA statuses (case-insensitive). Empty `[]` = match any. |
| `variant.match.commentTrigger` | Trigger string (required). At least one JIRA comment must contain this string (case-insensitive word-boundary match) for the variant to trigger. Each matching comment triggers exactly one operation, tracked in the operation ledger. Supports optional parenthesized parameters — see below. |
| `variant.match.revisionStatuses` | Statuses that indicate a revision task (e.g. `["Defect Found"]`). When the issue is in one of these statuses, the agent follows the revision workflow instead of starting fresh. Empty `[]` = never treat as revision. |
| `variant.beforeAgent` | JIRA transition config `{ targetStatus }` to execute before the agent runs. Empty `{}` = no transition. |
| `variant.afterAgent` | JIRA transition config `{ targetStatus }` to execute after successful completion. Empty `{}` = no transition. |
| `variant.preflight` | Named preflight check to run before agent invocation. If it fails, the agent is not invoked. Optional. |
| `variant.failureComment` | JIRA comment posted when preflight fails. Falls back to a generic message. Optional. |

#### Stages

Each variant contains a `stages` array defining the sequential agent pipeline. The orchestrator executes stages in order, aborting on the first failure.

| Field | Description | Default |
|---|---|---|
| `stage.agent` | Agent CLI name (e.g. `ralph.ralph`). Passed to Copilot CLI via `--agent`. Must match a `<name>.agent.md` file in the profile's `agents/` directory (validated at startup). | — (required) |
| `stage.role` | Unique role identifier within the pipeline (e.g. `primary`, `reviewer`). Used in logs and `StageResult`. Roles must be unique across stages in the same variant. | — (required) |
| `stage.mode` | Execution mode: `"container"` (inside Docker) or `"local"` (on the host). Local mode runs the CLI directly on the orchestrator host — useful for lightweight analysis stages that don't need the full container environment. | `"container"` |
| `stage.skills` | Array of skill folder names for this stage. Overrides the profile-level `skills` for this stage's template rendering. | `[]` |
| `stage.model` | Model override for this stage. Takes precedence over `variant.model` and profile-level `model`. | — (optional) |
| `stage.timeoutMs` | Timeout override in milliseconds for this stage. Falls back to the profile-level `timeoutMs`. | — (optional) |

**Single-stage example (most profiles):**
```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "primary", "mode": "container" }
  ],
  "match": { ... }
}
```

**Multi-stage example (writer + reviewer pipeline):**
```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "writer", "mode": "container", "timeoutMs": 3600000 },
    { "agent": "ralph.reviewer", "role": "reviewer", "mode": "local", "model": "claude-sonnet-4-20250514", "timeoutMs": 600000 }
  ],
  "match": { ... }
}
```

**Pipeline behavior:**
- Stages execute sequentially within the same container lifecycle (the container is started once, setup runs once).
- Each stage gets its own CLI invocation with stage-specific agent, model, skills, and timeout.
- The last stage's `RalphResult` is authoritative (PR URL, status, etc.).
- Total `durationMs` is always the sum of all stage durations, regardless of stage count.
- If `stages.length > 1`, individual `StageResult` objects are attached to the final result.
- On stage failure (`TaskStatus.Error`), the pipeline aborts immediately — remaining stages are skipped.
- Local-mode stages (`mode: "local"`) run the CLI on the host via `LocalCopilotExecutor`, not inside Docker.

**Matching order:** Variants are evaluated in order, across all profiles. All matching triggers are planned, not just the first.

**Comment trigger dedup:** Each trigger comment is consumed exactly once per variant. The orchestrator tracks consumed comment IDs in the operation ledger. Repeated triggers on the same comment are ignored. Post a new trigger comment to request another invocation.

**Trigger parameters:** Comments can include parenthesized parameters after the trigger string: `@RalphDf(codesamples, verbose)`. The orchestrator extracts the raw comma-separated strings from parentheses, then converts them into `triggerParams` (`Record<string, string>`) — bare params map to `"true"`, key-value params map to the value. This is persisted in the operation ledger and passed to the `TemplateContext` for use in agent templates. Parameters are comma-separated, whitespace-trimmed, and case-preserved. Empty parens `@RalphDf()` and bare triggers `@RalphDf` both result in an empty record. The trigger match itself ignores the parenthesized suffix — `@RalphDf(verbose)` matches the `@RalphDf` trigger.

`buildTriggerParams()` in `agent-includes.ts` performs the conversion. Templates can check `{% if triggerParams.codesamples %}` or interpolate `{{ triggerParams.branch_name }}`. See [docs/agent-templates.md](docs/agent-templates.md) for the full parameter reference.

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

**Copilot CLI** runs: `copilot --config-dir /workspace/.ralph --additional-mcp-config @/workspace/.ralph/mcp-config.json --agent <agent> --model <model> --experimental --allow-all-tools --allow-all-paths --share <transcript> -p <prompt>`

**Claude Code CLI** runs: `claude -p <prompt> --dangerously-skip-permissions --mcp-config /workspace/.ralph/mcp-config.json --strict-mcp-config [--model <model>]`

Both CLIs share the same `mcp-config.json` (generated at startup from profile `mcpServers` declarations). Copilot CLI loads it via `--additional-mcp-config`; Claude Code loads it via `--mcp-config`.

#### MCP Servers

Profiles can declare MCP (Model Context Protocol) servers via the `mcpServers` array in `profile.json`. Each entry is either a string (server name) or an object with `name` and optional `env` for per-server configuration:

```json
"mcpServers": [
  "playwright",
  {
    "name": "jira-kentico",
    "env": { "JIRA_ISSUE_KEY": "$task.id" }
  },
  {
    "name": "ado",
    "env": {
      "ADO_PROJECT": "CustomerEducation",
      "ADO_REPO": "kentico-docs-jekyll",
      "TASK_BRANCH": "$task.branch"
    }
  }
]
```

Server names must match a subdirectory of `shared/mcp-servers/`. Servers declare `requiredConfig` in their manifest — the orchestrator validates at startup that all required env vars are provided by the profile.

**Runtime macros:** Env values starting with `$` are resolved per-task from the current JIRA issue:

| Macro | Resolves to |
|---|---|
| `$task.id` | JIRA issue key (e.g. `DOC-3143`) |
| `$task.project` | Project key prefix (e.g. `DOC`) |
| `$task.branch` | Branch name: `ralph/<taskId>-<slugified-summary>` (max 80 chars) |
| `$task.title` | JIRA issue summary text |
| `$trigger.<key>` | Value of trigger parameter `<key>` from the JIRA comment (e.g. `$trigger.branch` resolves from `@RalphDf(branch=feature-xyz)`). Returns empty string if the parameter is missing. |

Static values (no `$` prefix) are passed through as-is. All env values (static + resolved macros) are injected into the server's env block in `gateway.json` before each task by `JitMcpConfigWriter`.

MCP servers run inside an isolated **sidecar container** — the agent communicates with them via HTTP URLs on the Docker internal network. Server code, credentials, and gateway configuration are never mounted into the agent container. The sidecar also has git installed and the repo volume mounted for git-powered tools.

**Adding an MCP server:**
1. Create `shared/mcp-servers/<name>/mcp-server.json`:
   ```json
   {
     "name": "<name>",
     "description": "What this server does",
     "type": "npm",
     "command": "npx",
     "args": ["@scope/mcp-server-name"],
     "sidecarPort": 9200,
     "requiredEnv": ["SOME_TOKEN"],
     "proxyDomains": [".api.example.com"]
   }
   ```
2. Add `"<name>"` to the profile's `mcpServers` array
3. Set required env vars in `.env` — they're embedded in `gateway.json` automatically

The MCP sidecar has **unrestricted direct internet access** via the `ralph-sidecar-external` Docker network — no Squid configuration changes are needed for new servers. The `proxyDomains` field is kept in the manifest schema for documentation purposes (to record what domains a server accesses) but is no longer injected into the agent's Squid allowlist. See [MCP.md](MCP.md) for the full MCP architecture.

**Server types:**
- `"npm"` — Pre-installed npm packages. No local code needed (e.g. Playwright). Bridged to HTTP via `supergateway`.
- `"custom"` — locally built servers with source in `src/` and bundle in `dist/`. Must support `--transport http --port PORT` for sidecar mode. Set `containerPath` to `/opt/mcp/servers/<name>`.

**Port assignment:** Each server must declare a unique `sidecarPort` in its manifest. Ports are validated at startup — duplicates or out-of-range values cause a startup error.

#### Resources

Profiles can auto-mount files from a `resources/` directory into the container. Configure via `resources.mountBase` in `profile.json`:

```json
{
  "resources": { "mountBase": "resources/ralph-resources" }
}
```

All files in `profiles/<id>/resources/` are recursively discovered and mounted read-only at `/workspace/<mountBase>/<relative-path>`. Mounts are included in the auto-generated compose overlay.

#### Skills

Profiles can mount shared skill folders into the container. Skills live in `shared/skills/<name>/` and are mounted at `/workspace/.github/skills/<name>/` (the standard Copilot CLI skills path, sibling to `.github/agents/`).

```json
{
  "skills": ["git-workflow", "code-review"]
}
```

Each skill name must match a subdirectory in `shared/skills/`. Skills are validated at startup — missing directories cause a startup error. Mounts are read-only and included in the auto-generated compose overlay.

#### Clean Paths

The `cleanPaths` array lists absolute container paths that are deleted before each agent run:

```json
{
  "cleanPaths": ["/workspace/.ralph/tasks"]
}
```

Useful for clearing agent-generated state (e.g. chat logs, cache files) between runs.

#### Agent Templates

Agent definition files live in `profiles/<id>/agents/` as `.agent.md` files. They use [Liquid](https://liquidjs.com/) template syntax for shared includes and conditional sections.

**Shared includes** — `{% render 'name' %}` pulls in partials from `shared/agent-includes/*.md`:


**Conditional sections** — `{% if isRevision %}...{% endif %}` renders content only when the issue is in a revision status.

**XML semantic boundaries** — `{% section "name" %}...{% endsection %}` wraps content in `<name>...</name>` XML tags, improving LLM recall and injection isolation. See `AGENT-PROMPT-AUTHORING.md` for standard section names.

**Template context** — Templates have access to these Liquid variables at render time (including `triggerParams` for key-value trigger parameter lookup). See [docs/agent-templates.md](docs/agent-templates.md) for the full variable reference.


Templates are rendered JIT before each task by `AgentTemplateRenderer`. Resolved output goes to `profiles/<id>/.build/` and is mounted read-only into the container.

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

The auditor scans untrusted data (description, comments, custom fields, handoff attachments) for common prompt injection patterns before passing the prompt to the agent CLI. See [SECURITY.md](SECURITY.md) for the full list of detected patterns.

### Additional Global Settings

| Field | Description | Default |
|---|---|---|
| `excludeFields` | Array of JIRA custom field IDs to exclude from agent prompts | `[]` |
| `allowedUsers` | Array of JIRA `accountId` values allowed to trigger agent invocations. Empty = unrestricted. | `[]` |
| `enableContinuation` | Allow agents to retry via `--continue` when no result block is produced. Requires `maxContinuations > 0` in the profile. | `false` |

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
  "variants": [
    {
      "stages": [
        { "agent": "ralph.ralph", "role": "primary" }
      ],
      "match": {
        "projects": ["DF"],
        "statuses": ["New", "To Do", "Defect Found"],
        "commentTrigger": "@RalphDf",
        "revisionStatuses": ["Defect Found"]
      },
      "beforeAgent": { "targetStatus": "In Progress" },
      "afterAgent": { "targetStatus": "Ready for Review" }
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
      "stages": [
        { "agent": "ralph.ralph", "role": "primary" }
      ],
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
      "stages": [
        { "agent": "ralph.malph", "role": "primary" }
      ],
      "match": { "projects": ["DF"], "statuses": ["Ready for Review"], "commentTrigger": "@Malph" }
    }
  ]
}
```

In this setup, the same Docker infrastructure serves both variants. Comments with `@RalphDf` trigger the writer agent on "New"/"To Do"/"Defect Found" issues; comments with `@Malph` trigger the reviewer on "Ready for Review" issues.

### Multi-Stage Pipeline

```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "writer", "mode": "container", "timeoutMs": 3600000 },
    { "agent": "ralph.reviewer", "role": "reviewer", "mode": "local", "model": "claude-sonnet-4-20250514", "timeoutMs": 600000 }
  ],
  "match": { "projects": ["DF"], "commentTrigger": "@RalphDf" },
  "beforeAgent": { "targetStatus": "In Progress" },
  "afterAgent": { "targetStatus": "Ready for Review" }
}
```

The writer stage runs inside Docker, then the reviewer stage runs on the host. If the writer fails, the reviewer is skipped.

### Multiple Profiles (Mixed CLIs)

`profiles/ralph-vscode/profile.json`:
```json
{
  "repo": "~/repositories/kentico-docs-autocomplete-vscode",
  "cli": "claude",
  "timeoutMs": 1800000,
  "variants": [
    {
      "stages": [
        { "agent": "ralph.ralph", "role": "primary" }
      ],
      "match": { "projects": ["DOC"], "commentTrigger": "@RalphAutocomplete" },
      "beforeAgent": { "targetStatus": "In Progress" },
      "afterAgent": { "targetStatus": "Ready for Review" }
    }
  ]
}
```

Runs Claude Code CLI for the VS Code extension repo, while `ralph-docs` uses Copilot CLI.

## Validation

The orchestrator validates the configuration on startup:

- **Required fields:** `jira.cloudId`, at least one profile directory with valid `profile.json`, `JIRA_PAT`, `JIRA_EMAIL`
- **CLI credentials:** At least one of `GH_TOKEN` or `ANTHROPIC_API_KEY` must be set
- **Profile integrity:** Valid `repo` paths, stage agent names match `.agent.md` files in each profile's `agents/` directory, unique `commentTrigger` values, `stages` array has at least one entry with unique roles
- **MCP manifests:** Referenced servers must exist in `shared/mcp-servers/`, `sidecarPort` must be a valid integer (1–65535), ports must be unique across all servers
- **Security infrastructure:** Security overlay compose file and squid.conf must exist, base compose files must use `ralph-internal` network, no `docker.sock` mounts
- **Docker daemon:** Must be reachable via `docker info`
- **Profiles auto-discovered** from `profiles/*/profile.json` — the profile `id` is derived from the directory name

Invalid configuration causes the orchestrator to exit with a descriptive error message.
