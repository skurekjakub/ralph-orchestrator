# Ralph Orchestrator — Configuration Guide

This document covers all configuration options for the Ralph Orchestrator. [docs/user-guide/](docs/user-guide/README.md) is the per-topic operator reference for the same settings.

## Quick Start

1. Copy `.env.example` to `.env` and fill in your credentials (`cp .env.example .env`)
2. Copy `config.json.sample` to `config.json` (`cp config.json.sample config.json`) and set your JIRA cloud ID and global settings
3. Configure agent profiles in `profiles/*/profile.json`
4. Run `npm run validate`, then `npm run dev` to start in development mode

## Environment Variables (`.env`)

Secrets and credentials live in `.env`. Never commit this file.

| Variable                                 | Description                                                                                                                                                                                                                | Required                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `CLAUDE_CODE_OAUTH_TOKEN`                | Claude Code OAuth token from `claude setup-token`, the credential of the default `claudeAuth: "oauth-token"`                                                                                                               | When a stage runs Claude Code (the default CLI)  |
| `ANTHROPIC_API_KEY`                      | Anthropic API key for Claude Code, used instead of `CLAUDE_CODE_OAUTH_TOKEN` when `config.json` sets `claudeAuth: "api-key"`                                                                                               | When a stage runs Claude Code under `"api-key"`  |
| `GH_TOKEN`                               | GitHub fine-grained PAT with **Copilot Requests** permission. Also the default `repoPat` of `vcsProvider: "github"` profiles                                                                                               | When a stage runs Copilot CLI, or as `repoPat`   |
| `ADO_PAT`                                | Azure DevOps PAT for KenticoCustomerSuccess org (Code: Read+Write). Used by the `ado` MCP server (sidecar) and as the default `repoPat` for `vcsProvider: "ado"` profiles                                                  | Yes                                              |
| `ADO_PAT_XPERIENCE`                      | Azure DevOps PAT for kenticoxperience org (Code: Read, Packaging: Read, Build: Read). Passed into the `ralph-docs` agent container                                                                                         | No                                               |
| `JIRA_PAT_<KEY>`                         | JIRA API token (classic, from [id.atlassian.com](https://id.atlassian.com)) for the JIRA data source `<KEY>` — the `dataSources` key uppercased, dashes replaced by underscores (`kentico-jira` → `JIRA_PAT_KENTICO_JIRA`) | Yes, per JIRA data source                        |
| `JIRA_EMAIL_<KEY>`                       | Email associated with that API token (`JIRA_EMAIL_KENTICO_JIRA`)                                                                                                                                                           | Yes, per JIRA data source                        |
| `DASHBOARD_URL`                          | Ralph status dashboard URL                                                                                                                                                                                                 | No                                               |
| `DASHBOARD_SECRET`                       | Shared secret for dashboard authentication                                                                                                                                                                                 | No                                               |
| `DISCORD_BOT_TOKEN`                      | Discord bot token for the discord-hitl MCP server                                                                                                                                                                          | When using discord-hitl                          |
| `DISCORD_CHANNEL_ID`                     | Discord channel ID where HITL threads are created                                                                                                                                                                          | When using discord-hitl                          |
| `DISCORD_TASK_CONTEXT`                   | Label for Discord thread names (default `Agent`)                                                                                                                                                                           | No                                               |
| `NODEBB_API_URL`                         | NodeBB API URL as seen from the MCP sidecar (e.g. `http://host.docker.internal:4567`)                                                                                                                                      | When using ralphchives-read/-write               |
| `NODEBB_TOKEN_<PROFILEID>_<DISPLAYNAME>` | Per-variant NodeBB token resolved by `$variantEnv.NODEBB_TOKEN` (e.g. `NODEBB_TOKEN_RALPH_DOCS_RALPH`)                                                                                                                     | For each variant whose MCP config uses the macro |

The JIRA connector factory (`resolveJiraCredentials` in `src/datasource/connectors/jira/factory.ts`) throws at startup if a JIRA data source's pair is missing. MCP servers read their `requiredEnv` names literally: the `jira-kentico` server needs `JIRA_PAT_KENTICO_JIRA` / `JIRA_EMAIL_KENTICO_JIRA`. See [docs/user-guide/environment-variables.md](docs/user-guide/environment-variables.md).

> Startup validation requires the credential of every CLI some stage runs, variant and post-task hook stages alike: for Claude Code the one `claudeAuth` selects, for Copilot `GH_TOKEN`. A stage never switches to another CLI. An agent container receives only the credential of each CLI its container stages run; a host stage receives only its own CLI's.

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
  "output": { ... },
  "dashboard": { ... },
  "promptAudit": { ... },
  "ralphchives": { ... },
  "enableContinuation": false,
  "claudeAuth": "oauth-token"
}
```

`config.json` is gitignored; start from `config.json.sample`.

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

| Field            | Type     | Description                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`           | `string` | Registered data source type (e.g. `"jira"`). Must match a factory registered via `registerDataSourceFactory()`.                                                                                                                                                                                                                             |
| `connection`     | `object` | Type-specific connection properties. For JIRA: `baseUrl`, `cloudId`, `excludeFields` (custom field IDs to exclude from agent prompts), `allowedUsers` (Atlassian account IDs allowed to trigger invocations; empty = unrestricted). Credentials are injected by the connector factory from `JIRA_PAT_<KEY>` / `JIRA_EMAIL_<KEY>` in `.env`. |
| `pollIntervalMs` | `number` | How often to poll for new work items (milliseconds). Default: `60000`.                                                                                                                                                                                                                                                                      |
| `maxResults`     | `number` | Accepted by the schema (default `100`) but not used by the JIRA connector, which pages searches at 100 results per request.                                                                                                                                                                                                                 |

**Finding your JIRA Cloud ID:** Visit `https://<your-site>.atlassian.net/_edge/tenant_info` — the `cloudId` field is what you need.

Data source connectors are built in; JIRA (`"jira"`) is the only one today. To add another, see [docs/dev-doc/data-source-registration.md](docs/dev-doc/data-source-registration.md).

### Agent Profiles (`profiles/*/profile.json`)

Profiles define how JIRA issues map to repositories and agent configurations. Each profile lives in its own directory under `profiles/` and is auto-discovered at startup.

```
profiles/
  ralph-docs/
    profile.json          — Profile configuration
    Dockerfile            — Container image
    docker-compose.yml    — Base compose: services, volumes, env vars
    setup.sh              — Post-create setup script
    agents/               — Liquid agent templates (*.agent.md)
  ralph-vscode/
    profile.json
    ...
shared/
  security/
    docker-compose.security.yml  — Security overlay (proxy, isolation, limits)
    squid.conf                   — Baseline domain allowlist for egress proxy
  hooks/                         — Audit hooks of both CLIs, the Claude Code result gate, the redactor
  agent-includes/                — Shared Liquid partials for agent templates (*.md)
  skills/                        — Skill folders (SKILL.md), grouped in category subdirectories
  mcp-servers/<name>/            — MCP server manifests (+ source for custom servers)
  mcp-sidecar/                   — MCP sidecar gateway image
```

#### `profile.json` Schema

```json
{
  "repoUrl": "https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_git/kentico-docs-jekyll",
  "dataSource": "kentico-jira",
  "cli": "claude",
  "model": "opus",
  "timeoutMs": 3600000,
  "setupScript": "/usr/local/bin/setup.sh",
  "auditLogPath": "/workspace/.ralph/logs/audit.jsonl",
  "composeProjectLabel": "ralph-sandbox",
  "allowlistDomains": [".npmjs.org", ".rubygems.org"],
  "mcpServers": [
    { "name": "jira-kentico", "env": { "JIRA_ISSUE_KEY": "$task.id" } },
    {
      "name": "ado",
      "env": { "ADO_PROJECT": "CustomerEducation", "ADO_REPO": "kentico-docs-jekyll", "TASK_BRANCH": "$task.branch" }
    }
  ],
  "resources": { "mountBase": "resources/ralph-resources" },
  "cleanPaths": ["/workspace/tmp"],
  "vcsProvider": "ado",
  "repoPat": "ADO_PAT",
  "claude": { "loadRepoInstructions": false },
  "variants": [
    {
      "stages": [{ "agent": "ralph.ralph", "role": "primary", "skills": ["ralph-workflow"], "effort": "high" }],
      "mcpServers": [
        {
          "name": "codegraphcontext",
          "sidecarEnv": { "CGC_INDEX_PATH": "/workspace/resources/repositories/xperience" }
        }
      ],
      "match": { "projects": ["DF"], "statuses": ["New", "To Do"], "commentTrigger": "@RalphDf" },
      "beforeAgent": { "targetStatus": "In Progress" },
      "afterAgent": { "targetStatus": "Ready for Review" }
    }
  ]
}
```

#### Profile-Level Fields

| Field                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Default                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `repoUrl`             | `https://` URL of the target repository, without credentials (`user@` or `user:secret@` fails validation). The orchestrator keeps a bare clone of it in `cache/repos/<id>` and runs each task in its own clone, `cache/workspaces/<key>-<startTs>`; see [Task Workspaces](#task-workspaces).                                                                                                                                                                                                                    | — (required)                             |
| `dataSource`          | Key of the `config.json` `dataSources` entry this profile polls. Startup fails if the key doesn't exist.                                                                                                                                                                                                                                                                                                                                                                                                        | — (required)                             |
| `cli`                 | Default CLI of the profile's stages: `"claude"` (Claude Code) or `"copilot"` (GitHub Copilot CLI). A stage's own `cli` overrides it; see [CLI Selection](#cli-selection).                                                                                                                                                                                                                                                                                                                                       | `"claude"`                               |
| `claude`              | Claude Code options. `{ "loadRepoInstructions": true }` lets container stages that run `"claude"` load the target repo's own `CLAUDE.md` files and `.claude/` project settings (`--setting-sources user,project`); off, they load only Ralph's settings, agents and skills. Startup fails when it is set and no container stage runs `"claude"`.                                                                                                                                                                | `{ "loadRepoInstructions": false }`      |
| `model`               | Model for all variants, validated for each stage's CLI. Claude Code takes an alias (`opus`, `sonnet`, `haiku`, `fable`, optionally with `[1m]`) or a hyphenated id (`claude-opus-5-5`); Copilot takes a dotted id (`claude-opus-4.6`). Without one, a Claude Code stage runs the model its root agent declares and a Copilot stage runs `claude-opus-4.6`.                                                                                                                                                      | — (optional)                             |
| `timeoutMs`           | Maximum execution time in milliseconds                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `1800000` (30 min)                       |
| `setupScript`         | Absolute path to the setup script inside the container                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `"/usr/local/bin/setup.sh"`              |
| `auditLogPath`        | Absolute path to the audit JSONL log inside the container                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `"/workspace/.ralph/logs/audit.jsonl"`   |
| `composeProjectLabel` | Docker compose project label used for container lookup                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `"ralph-sandbox"`                        |
| `mcpServers`          | Array of MCP server entries. Each entry is either a string (server name) or an object `{ name, env?, sidecarEnv? }` with per-server environment variables. Server names must match subdirectories in `shared/mcp-servers/`. Values in `env` starting with `$` are JIT macros resolved per-task (see MCP Servers section). `sidecarEnv` injects container-level env vars into the sidecar Docker service (for entrypoint scripts, not macro-resolved). Variants can declare additional `mcpServers` — see below. | `[]`                                     |
| `resources`           | Resource auto-discovery config: `{ "mountBase": "<path>" }`. Files in `profiles/<id>/resources/` are mounted read-only at `/workspace/<mountBase>/`.                                                                                                                                                                                                                                                                                                                                                            | — (optional)                             |
| `cleanPaths`          | Array of absolute container paths to delete before each agent run.                                                                                                                                                                                                                                                                                                                                                                                                                                              | `[]`                                     |
| `maxContinuations`    | Maximum number of automatic retry attempts (0–10) when a stage that requires the `===RALPH_RESULT_START===` block (`stage.requireResultBlock`) ends its session without it; a stage that waives the block, or a timed-out session, is never resumed. Copilot resumes with `--continue`, Claude Code with `--resume <session id>`, after an exponential backoff (5s base, 30s cap). Only takes effect when `enableContinuation: true` is set in `config.json`. `0` = disabled (single invocation only).          | `0`                                      |
| `allowlistDomains`    | Extra domains added to this profile's Squid allowlist and Copilot `allowedUrls` (e.g. `[".npmjs.org"]`), besides the model API of each CLI the variant's container stages run.                                                                                                                                                                                                                                                                                                                                  | `[]`                                     |
| `githubMcpTools`      | Control the bundled GitHub MCP server in Copilot CLI. `false` = server disabled (`--disable-builtin-mcps`), `["get_file_contents"]` = enable only listed tools (`--add-github-mcp-tool`). Empty array is a validation error. Only affects Copilot stages; startup fails when it is set and no stage runs `"copilot"`.                                                                                                                                                                                           | `false`                                  |
| `vcsProvider`         | VCS hosting provider for the target repo: `"ado"` (Azure DevOps) or `"github"`. Controls the auth header format the workspace's git commands send and selects the PR metadata resolver used for revision branch inference.                                                                                                                                                                                                                                                                                      | `"ado"`                                  |
| `repoPat`             | Name of the env var holding the git PAT that clones and fetches `repoUrl`. Startup fails when it is unset.                                                                                                                                                                                                                                                                                                                                                                                                      | `ADO_PAT` (`ado`), `GH_TOKEN` (`github`) |

The profile `id` is derived from the directory name (e.g. `profiles/ralph-docs/` → `id: "ralph-docs"`). The compose file path is always `profiles/<id>/docker-compose.yml`, which is automatically merged with the security overlay at `shared/security/docker-compose.security.yml` and the overlay generated per task at `profiles/<id>/.build/docker-compose.overlay.yml` (if present): the pinned CLI versions as image build args, the mounts, environment and credential of each CLI the variant's container stages run, the MCP sidecar, and the resource mounts.

#### Variants

Each profile has a `variants` array. Each variant is a separate routing entry that maps JIRA matching rules to a **pipeline of stages** — one or more agent invocations executed sequentially.

| Field                            | Description                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variant.stages`                 | Array of stage objects (at least one required). Each stage defines an agent, role, execution mode, and optional overrides. Stages run sequentially — if any stage fails, the pipeline aborts. See [Stages](#stages) below.                                                                                                    |
| `variant.model`                  | Optional model override (overrides the profile-level `model`). Individual stages can further override this.                                                                                                                                                                                                                   |
| `variant.match.projects`         | JIRA project keys to match (e.g. `["DF"]`). Issue key prefix must match. Empty `[]` = the variant matches nothing, and startup validation warns.                                                                                                                                                                              |
| `variant.match.statuses`         | Only match issues in these JIRA statuses (case-insensitive). Empty `[]` = match any.                                                                                                                                                                                                                                          |
| `variant.match.commentTrigger`   | Trigger string (required). At least one JIRA comment must contain this string (case-insensitive word-boundary match) for the variant to trigger. Each matching comment triggers exactly one operation, tracked in the operation ledger. Supports optional parenthesized parameters — see below.                               |
| `variant.match.revisionStatuses` | Statuses that indicate a revision task (e.g. `["Defect Found"]`). When the issue is in one of these statuses, the agent follows the revision workflow instead of starting fresh. Empty `[]` = never treat as revision. When `statuses` is set, each must be one of them.                                                      |
| `variant.beforeAgent`            | JIRA transition config `{ targetStatus }` to execute before the agent runs. Empty `{}` = no transition.                                                                                                                                                                                                                       |
| `variant.afterAgent`             | JIRA transition config `{ targetStatus }` to execute after successful completion. Empty `{}` = no transition.                                                                                                                                                                                                                 |
| `variant.preflight`              | Named preflight check to run before agent invocation. If it fails, the agent is not invoked. Optional.                                                                                                                                                                                                                        |
| `variant.failureComment`         | JIRA comment posted when preflight fails. Falls back to a generic message. Optional.                                                                                                                                                                                                                                          |
| `variant.postTaskHooks`          | Array of post-task hook objects. Each hook defines a local-only agent pipeline that runs after the main pipeline completes and the container is torn down. Hook failures are logged as warnings and never affect the task result. See [Post-Task Hooks](docs/dev-doc/multistage-pipelines.md#post-task-hooks). Default: `[]`. |
| `variant.mcpServers`             | Additional MCP servers for this variant (same entry format as profile-level). Merged with profile-level `mcpServers` — the effective set is the union. Allows scoping expensive or specialized servers to specific variants. Default: `[]`.                                                                                   |

#### Stages

Each variant contains a `stages` array defining the sequential agent pipeline. The orchestrator executes stages in order, aborting on the first failure.

| Field                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                 | Default                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `stage.agent`              | The stage's root agent: the file id of a `<agent>.agent.md` template in the profile's `agents/` directory (e.g. `ralph.ralph`), validated at startup. Claude Code receives the template's frontmatter `name` with `--agent`, Copilot CLI this file id.                                                                                                                                                                      | — (required)                                       |
| `stage.role`               | Unique role identifier within the pipeline (e.g. `primary`, `reviewer`). Used in logs, collected log names and `StageResult`. Roles must be unique across stages in the same variant. A `"local"` stage's role names its workspace directory, so it must be letters, digits, `_` and `-`.                                                                                                                                   | — (required)                                       |
| `stage.mode`               | Execution mode: `"container"` (inside Docker) or `"local"` (on the host). A local stage runs the CLI on the orchestrator host, in a workspace of its own under the task's output directory — useful for lightweight analysis stages that don't need the full container environment. See [CLI Selection](#cli-selection).                                                                                                    | `"container"`                                      |
| `stage.cli`                | CLI the stage runs: `"claude"` or `"copilot"`.                                                                                                                                                                                                                                                                                                                                                                              | the profile `cli`                                  |
| `stage.skills`             | Array of skill names from `shared/skills/` (searched recursively) for this stage, rendered with the stage's template context and validated at startup. See [Skills](#skills).                                                                                                                                                                                                                                               | `[]`                                               |
| `stage.model`              | Model override for this stage. Takes precedence over `variant.model` and profile-level `model`, and is validated for the stage's CLI. A stage whose `cli` differs from the profile's must set its own `model` when the variant or profile sets one.                                                                                                                                                                         | — (optional)                                       |
| `stage.effort`             | Claude Code reasoning effort, passed as `--effort`: `"low"`, `"medium"`, `"high"`, `"xhigh"` or `"max"`. Only on stages that run `"claude"`.                                                                                                                                                                                                                                                                                | — (optional)                                       |
| `stage.timeoutMs`          | Timeout override in milliseconds for this stage. Falls back to the profile-level `timeoutMs`.                                                                                                                                                                                                                                                                                                                               | — (optional)                                       |
| `stage.requireResultBlock` | Whether the stage must end with the `===RALPH_RESULT_START===` … `===RALPH_RESULT_END===` block. A stage that requires it and ends without it fails with `missing-result-block`; only such a stage is resumed (`maxContinuations`). A stage that waives it completes on exit code 0. On Claude Code, Ralph's `Stop` hook also holds a stage that requires the block until the agent prints it, up to two times per session. | `true` for variant stages, `false` for hook stages |

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
    { "agent": "ralph.reviewer", "role": "reviewer", "mode": "local", "model": "sonnet", "timeoutMs": 600000 }
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
- Local-mode stages (`mode: "local"`) run the stage's CLI, Claude Code or Copilot, on the host in a workspace of their own, not inside Docker.

**Matching order:** Variants are evaluated in order, across all profiles. All matching triggers are planned, not just the first.

**Comment trigger dedup:** Each trigger comment is consumed exactly once per variant. The orchestrator tracks consumed comment IDs in the operation ledger. Repeated triggers on the same comment are ignored. Post a new trigger comment to request another invocation.

**Trigger parameters:** Comments can include parenthesized parameters after the trigger string: `@RalphDf(codesamples, verbose)`. The orchestrator extracts the raw comma-separated strings from parentheses, then converts them into `triggerParams` (`Record<string, string>`) — bare params map to `"true"`, key-value params map to the value. This is persisted in the operation ledger and passed to the `TemplateContext` for use in agent templates. Parameters are comma-separated, whitespace-trimmed, and case-preserved. Empty parens `@RalphDf()` and bare triggers `@RalphDf` both result in an empty record. The trigger match itself ignores the parenthesized suffix — `@RalphDf(verbose)` matches the `@RalphDf` trigger.

`buildTriggerParams()` in `agent-includes.ts` performs the conversion. Templates can check `{% if triggerParams.codesamples %}` or interpolate `{{ triggerParams.branch_name }}`. See [docs/dev-doc/agent-templates.md](docs/dev-doc/agent-templates.md) for the full parameter reference.

**Reserved orchestrator-level parameters:** `source_branch`, `branch`, and `skip_hooks` are consumed by the orchestrator before templates run. For revision tasks, `source_branch` and `branch` can also be inferred from an existing pull request URL in comments when the configured `vcsProvider` supports it. `skip_hooks` bypasses post-task hook execution and writes a `hook-manifest.json` for manual replay. See [docs/user-guide/trigger-parameters.md](docs/user-guide/trigger-parameters.md) for details.

#### Transitions

| Field                      | Description                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `beforeAgent.targetStatus` | Target JIRA status name to transition to before the agent runs (e.g. `"In Progress"`)            |
| `afterAgent.targetStatus`  | Target JIRA status name to transition to after successful completion (e.g. `"Ready for Review"`) |

Both are optional — omit or leave empty (`{}`) to skip transitions (useful for observer agents that don't change issue state).

**Dynamic resolution:** The orchestrator queries the JIRA transitions API at runtime to find the transition ID that reaches the target status. This makes transitions portable across JIRA projects and source statuses — there's no need to look up or hardcode numeric IDs.

#### Operation Ledger

The orchestrator tracks every agent invocation in a persistent per-issue JSON file at `<output.logDir>/history/<dataSource>/<issueKey>.json` (`output.logDir` defaults to `./output/logs`). Operations go through lifecycle states:

```
pending → active | rejected | error
active  → completed | error
```

- **Rejected:** the issue's status no longer matches the variant, a preflight check fails, or the trigger author is not in the data source's `allowedUsers` (recorded as rejected directly when the trigger is scanned).
- **Pending → error:** the operation could not be started (e.g. its profile no longer exists or the work item can't be fetched). The trigger stays consumed.
- **Crash recovery:** On startup, `active` operations are marked as `error` and a recovery comment is posted to JIRA.
- **Pending operations survive restart:** They're persisted on disk and resumed after recovery.
- **State re-validation:** Before executing, the orchestrator re-fetches the issue to verify it's still in a valid status.

#### CLI Selection

Each stage runs one CLI: its `cli`, else the profile's `cli`, else `claude`. Startup validation requires the credential of every CLI a stage runs (`GH_TOKEN` for Copilot; `CLAUDE_CODE_OAUTH_TOKEN`, or `ANTHROPIC_API_KEY` with `claudeAuth: "api-key"`, for Claude Code). There is no fallback to the other CLI. Both CLIs are installed root-owned in the agent images at the exact versions of `@anthropic-ai/claude-code` and `@github/copilot` in the orchestrator's `package.json` `dependencies`.

**Claude Code CLI** runs in a container stage as the `vscode` user, with `CLAUDE_CONFIG_DIR=/workspace/.ralph/claude` and the prompt on stdin: `/usr/local/bin/claude -p --output-format stream-json --verbose --agent <frontmatter name> [--model <model>] [--effort <effort>] --setting-sources user[,project] --settings /etc/ralph/claude-settings.json --mcp-config /workspace/.ralph/mcp-config.json --strict-mcp-config --permission-mode bypassPermissions --tools <built-in tools>[,Agent] (--session-id | --resume) <uuid> --debug-file /workspace/.ralph/logs/cli-debug/claude.log`. The `--settings` file holds Ralph's audit hooks, the result gate and the no-attribution policy. `project` joins the setting sources only with `claude.loadRepoInstructions`.

**Copilot CLI** runs in a container stage, with `COPILOT_HOME=/workspace/.ralph` and the prompt on stdin: `/usr/local/bin/copilot --additional-mcp-config @/workspace/.ralph/mcp-config.json --agent <agent file id> --model <model, default claude-opus-4.6> (--disable-builtin-mcps | --add-github-mcp-tool <tool>…) --log-level debug --log-dir /workspace/.ralph/logs/cli-debug --allow-all-tools --allow-all-paths --share /workspace/.ralph/logs/session-transcript.md [--continue]`

Both container CLIs read the same `mcp-config.json`, regenerated per task for the variant's `mcpServers`. Copilot CLI loads it via `--additional-mcp-config`; Claude Code loads it via `--mcp-config`.

**Host stages** (`mode: "local"`, and every post-task hook stage) run the CLI the orchestrator's `npm ci` installed, `node_modules/.bin/claude` or `node_modules/.bin/copilot`, in a workspace of their own: `<task output dir>/stages/<role>/` for a variant stage, `<task output dir>/hooks/<hook>/<role>/` for a hook stage, with the CLI's working directory in `work/`, its home in `home/` and its logs in `logs/`. Its environment holds only `PATH`, `HOME`, `LANG` and its CLI's credential. Claude Code runs there with `--permission-mode dontAsk` and permission rules that let it read the task's logs and the orchestrator's `profiles/` and `shared/`, write only in its working and artifact directories and run only read-only shell commands; it loads no MCP server, has no web tools, and runs Ralph's audit hooks from `shared/hooks/`. Copilot runs there with `--config-dir home/`, every tool and path allowed, and no MCP config. Startup validation checks the installed version of every CLI a host stage runs, `jq` when a host stage runs Claude Code, and `perl`, which redacts transcripts.

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

| Macro                  | Resolves to                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$task.id`             | JIRA issue key (e.g. `DOC-3143`)                                                                                                                                                                          |
| `$task.project`        | Project key prefix (e.g. `DOC`)                                                                                                                                                                           |
| `$task.branch`         | Resolved task branch name: explicit `branch` trigger param, else inferred PR source branch for revision tasks when available, else `ralph/<taskId>-<slugified-summary>` (max 80 chars)                    |
| `$task.title`          | JIRA issue summary text                                                                                                                                                                                   |
| `$trigger.<key>`       | Value of trigger parameter `<key>` from the JIRA comment (e.g. `$trigger.branch` resolves from `@RalphDf(branch=feature-xyz)`). Returns empty string if the parameter is missing.                         |
| `$variantEnv.<PREFIX>` | Value of the env var `<PREFIX>_<PROFILEID>_<DISPLAYNAME>` (uppercase; `-`, `.`, `/` → `_`), e.g. `$variantEnv.NODEBB_TOKEN` → `NODEBB_TOKEN_RALPH_DOCS_RALPH`. The task fails if the variable is missing. |

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
     "tools": ["some_tool"]
   }
   ```
2. Add `"<name>"` to the profile's `mcpServers` array
3. Set required env vars in `.env` — they're embedded in `gateway.json` automatically

The MCP sidecar has **unrestricted direct internet access** via the `ralph-sidecar-external` Docker network — no Squid configuration changes are needed for new servers. See [MCP.md](MCP.md) for the full MCP architecture.

**Server types:**

- `"npm"` — Pre-installed npm packages that speak MCP over stdio. No local code needed (e.g. Playwright). The gateway bridges them in process, behind its tool-filter proxy, so the manifest must list `tools`.
- `"custom"` — locally built servers with source in `src/` and bundle in `dist/`. Must honour the launch contract `--transport http --port <port> --host <address>` (default host `0.0.0.0`) for sidecar mode; `shared/mcp-servers/common/http-launch.ts` implements it. Set `containerPath` to `/opt/mcp/servers/<name>`.

**Port assignment:** Each server must declare a unique `sidecarPort` in its manifest. Ports are validated at startup — duplicates, out-of-range values, port 9000 (the sidecar health endpoint) and the `sidecarPort + 10000` upstream port of a custom server with `tools` cause a startup error.

**Pre-gateway initialization:** Servers can declare `"initScript": "init.sh"` in their manifest to run a script at sidecar startup before the gateway launches (e.g. code indexing, cache warming). The script path must be relative within the server directory. Failures are logged but non-fatal.

#### Resources

Profiles can auto-mount files from a `resources/` directory into the container. Configure via `resources.mountBase` in `profile.json`:

```json
{
  "resources": { "mountBase": "resources/ralph-resources" }
}
```

All files in `profiles/<id>/resources/` are recursively discovered and mounted read-only at `/workspace/<mountBase>/<relative-path>`. Mounts are included in the auto-generated compose overlay.

#### Skills

Stages can mount shared skill folders into the container. Skills live in `shared/skills/` (usually under a category directory, e.g. `shared/skills/workflow/<name>/SKILL.md`). Before each task and stage they are rendered as Liquid templates into `profiles/<id>/.build/skills/<name>/` and mounted read-only into the CLI's skills directory: `/workspace/.github/skills/<name>/` for Copilot CLI (the standard Copilot skills path, sibling to `.github/agents/`), `/workspace/.ralph/claude/skills/` for Claude Code.

Skills are declared per stage:

```json
{
  "stages": [{ "agent": "ralph.ralph", "role": "primary", "skills": ["ralph-workflow", "ralph-style-guide-review"] }]
}
```

Each skill name must match a skill directory (containing `SKILL.md`) anywhere under `shared/skills/`. Skills are validated at startup — missing skills cause a startup error. Claude Code sees the whole rendered skills directory, which each stage re-renders with its own skills; Copilot CLI gets one mount per skill of its container stages. The mounts are in the compose overlay, which is regenerated per task for the matched variant. A host stage renders its skills into its own workspace.

Because skills and agent templates are injected via Docker bind mounts into the task's workspace, they would appear as untracked files to git. When the workspace is created, `.ralph/` and the mount targets of the CLIs the variant's container stages run (`.github/skills/`, `.github/agents/`, `.github/hooks/ralph-audit.json` for Copilot) go into its `.git/info/exclude`, so these artifacts never appear in `git status` or get staged by `git add`.

#### Task Workspaces

There is no target-repo checkout to prepare. Every task works in its own clone of `repoUrl`:

- `cache/repos/<profileId>` is the orchestrator's bare clone of `repoUrl`, made on the profile's first task and fetched (every branch, `--prune`) before each later task.
- `cache/workspaces/<key>-<startTs>` is the task's workspace: a local clone of the bare clone on the base branch, with `origin` set to `repoUrl`. The task branch is checked out from the remote when it exists there (a revision requires it) or created from the base branch. It is mounted at `/workspace` in the agent container and the MCP sidecar.
- Git authenticates with the `repoPat` PAT through a per-command `http.extraHeader`; no clone stores the credential.
- The workspace is deleted when the task succeeds and kept, with its path logged, when it fails.

#### Clean Paths

The `cleanPaths` array lists absolute container paths that are deleted before each agent run:

```json
{
  "cleanPaths": ["/workspace/tmp"]
}
```

Each task starts in a fresh workspace and a newly created container, so there is rarely state left to clear. Don't list `/workspace/.ralph/tasks`: it holds the task's own directory, created with the workspace.

#### Agent Templates

Agent definition files live in `profiles/<id>/agents/` as `.agent.md` files. They use [Liquid](https://liquidjs.com/) template syntax for shared includes and conditional sections.

**Shared includes** — `{% render 'name' %}` pulls in partials from `shared/agent-includes/*.md`, including subdirectories (e.g. `{% render 'personality/ralph' %}`).

**Conditional sections** — `{% if isRevision %}...{% endif %}` renders content only when the issue is in a revision status.

**XML semantic boundaries** — `{% section "name" %}...{% endsection %}` wraps content in `<name>...</name>` XML tags, improving LLM recall and injection isolation.

**Template context** — Templates have access to `TemplateContext` variables at render time (including `triggerParams` for key-value trigger parameter lookup). See [docs/dev-doc/agent-templates.md](docs/dev-doc/agent-templates.md) and [docs/user-guide/template-variables.md](docs/user-guide/template-variables.md) for the variable reference.

**Frontmatter** — every template carries one canonical, CLI-neutral frontmatter (`name`, `description`, `model` as a Claude Code alias or id, `subagents`, optional `tools`, `skills`, `effort`, `maxTurns`, `runtimes`, `copilot.model`), validated at startup and translated into each CLI's agent file format at render time.

Templates are rendered JIT before each task and stage by `AgentTemplateRenderer`. A container stage's agents go to `profiles/<id>/.build/<cli>/agents/` and are mounted read-only into the container; a host stage's go into its own workspace.

### Output Settings

```json
"output": {
  "logDir": "./output/logs",
  "handoffDir": "./output/handoffs"
}
```

| Field        | Description                                                                 | Default               |
| ------------ | --------------------------------------------------------------------------- | --------------------- |
| `logDir`     | Directory for execution logs, audit trails, and activity logs               | `"./output/logs"`     |
| `handoffDir` | Created at startup but unused — Ralph attaches its handoff directly to JIRA | `"./output/handoffs"` |

### Dashboard Settings

```json
"dashboard": {
  "enabled": true,
  "intervalMs": 30000
}
```

| Field        | Description                                        | Default |
| ------------ | -------------------------------------------------- | ------- |
| `enabled`    | Enable heartbeat reporting to the status dashboard | `true`  |
| `intervalMs` | Heartbeat interval in milliseconds                 | `30000` |

The dashboard requires `DASHBOARD_URL` and `DASHBOARD_SECRET` in `.env`. If `enabled` is `false` or the env vars are missing, no heartbeats are sent.

Multiple orchestrator instances can report to the same dashboard — each generates a unique agent ID on startup.

### Prompt Audit Settings

```json
"promptAudit": {
  "mode": "warn"
}
```

| Field  | Description                                                                        | Default  |
| ------ | ---------------------------------------------------------------------------------- | -------- |
| `mode` | How the prompt injection auditor handles findings: `"block"`, `"warn"`, or `"off"` | `"warn"` |

**Modes:**

- `"warn"` — Logs findings to the activity log but allows execution to proceed. Recommended for production to build baseline visibility without blocking legitimate tasks.
- `"block"` — Logs findings and **blocks execution** when critical patterns are detected (e.g., system instruction overrides, credential probing, prompt format tokens). Warnings still proceed.
- `"off"` — Disables prompt auditing entirely. Not recommended except for debugging.

The auditor scans untrusted data (description, comments, custom fields, handoff attachments) for common prompt injection patterns before passing the prompt to the agent CLI. See [SECURITY.md](SECURITY.md) for the full list of detected patterns.

### Additional Global Settings

| Field                                            | Description                                                                                                                                                                                                                                                                        | Default                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `enableContinuation`                             | Resume a stage that ends without the result block it requires (Copilot resumes with `--continue`, Claude Code with `--resume <session id>`). Requires `maxContinuations > 0` in the profile.                                                                                       | `false`                               |
| `claudeAuth`                                     | Credential every Claude Code stage authenticates with: `"oauth-token"` (`CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token`) or `"api-key"` (`ANTHROPIC_API_KEY`). Only that one variable is required and passed on, and only to a container or host stage that runs Claude Code. | `"oauth-token"`                       |
| `ralphchives.enabled`                            | Start the Ralphchives compose stack (`ralphchives/docker-compose.yml`) at startup                                                                                                                                                                                                  | `false`                               |
| `ralphchives.nodebbApiUrl`                       | NodeBB URL                                                                                                                                                                                                                                                                         | `"http://localhost:4567"`             |
| `ralphchives.neo4jUri` / `ralphchives.neo4jUser` | Neo4j connection                                                                                                                                                                                                                                                                   | `"bolt://localhost:7687"` / `"neo4j"` |

`excludeFields` and `allowedUsers` are JIRA connection settings — set them per data source under `dataSources.<key>.connection`.

An organisation can deliver server-managed settings with either Claude Code credential. They outrank the `--settings` file Ralph passes every session, so they can switch Ralph's audit hooks off; a container session that ran without them is logged and listed in the task summary's `hooklessSessions`.

## Example Configurations

### `config.json` (Global Settings)

```json
{
  "dataSources": {
    "kentico-jira": {
      "type": "jira",
      "connection": {
        "baseUrl": "https://api.atlassian.com/ex/jira",
        "cloudId": "abc123-def456",
        "excludeFields": [],
        "allowedUsers": []
      },
      "pollIntervalMs": 60000
    }
  },
  "output": { "logDir": "./output/logs", "handoffDir": "./output/handoffs" },
  "dashboard": { "enabled": false }
}
```

With this data source key, `.env` needs `JIRA_PAT_KENTICO_JIRA` and `JIRA_EMAIL_KENTICO_JIRA`.

### Single Profile, Single Variant

`profiles/ralph-docs/profile.json`:

```json
{
  "repoUrl": "https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_git/kentico-docs-jekyll",
  "dataSource": "kentico-jira",
  "timeoutMs": 1800000,
  "variants": [
    {
      "stages": [{ "agent": "ralph.ralph", "role": "primary" }],
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
  "repoUrl": "https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_git/kentico-docs-jekyll",
  "dataSource": "kentico-jira",
  "cli": "claude",
  "timeoutMs": 3600000,
  "variants": [
    {
      "stages": [{ "agent": "ralph.ralph", "role": "primary" }],
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
      "stages": [{ "agent": "ralph.malph", "role": "primary" }],
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
    {
      "agent": "ralph.reviewer",
      "role": "reviewer",
      "mode": "local",
      "model": "sonnet",
      "timeoutMs": 600000
    }
  ],
  "match": { "projects": ["DF"], "commentTrigger": "@RalphDf" },
  "beforeAgent": { "targetStatus": "In Progress" },
  "afterAgent": { "targetStatus": "Ready for Review" }
}
```

The writer stage runs inside Docker, then the reviewer stage runs on the host. If the writer fails, the reviewer is skipped.

### Mixed CLIs

Both bundled profiles run Claude Code in every stage. A stage can run Copilot CLI instead:

```json
{
  "repoUrl": "https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_git/kentico-docs-autocomplete-vscode",
  "dataSource": "kentico-jira",
  "cli": "claude",
  "model": "opus",
  "variants": [
    {
      "stages": [
        { "agent": "ralph.ralph", "role": "writer" },
        { "agent": "ralph.reviewer", "role": "reviewer", "cli": "copilot", "model": "gpt-5.4" }
      ],
      "match": { "projects": ["DOC"], "commentTrigger": "@RalphAutocomplete" },
      "beforeAgent": { "targetStatus": "In Progress" },
      "afterAgent": { "targetStatus": "Ready for Review" }
    }
  ]
}
```

The writer runs Claude Code on `opus`; the reviewer runs Copilot CLI and sets its own Copilot model, because the profile's `opus` is not a Copilot model id. Every agent the reviewer can reach must list `copilot` in its `runtimes` (the default lists both CLIs). The agent container gets the mounts and credentials of both CLIs, so `.env` needs `GH_TOKEN` as well as the Claude Code credential.

## Validation

The orchestrator validates the configuration on startup:

- **Required fields:** `config.json` with at least one `dataSources` entry (JIRA: `connection.baseUrl`, `connection.cloudId`) and a valid `claudeAuth`, at least one profile directory with a valid `profile.json` whose `dataSource` names an existing entry
- **Required env vars:** `ADO_PAT`; the env var named by each profile's `repoPat`; `JIRA_PAT_<KEY>` / `JIRA_EMAIL_<KEY>` for each JIRA data source (checked when the connector is created at startup)
- **CLI credentials:** the credential of every CLI some variant or post-task hook stage runs: `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY` under `claudeAuth: "api-key"`) for Claude Code, `GH_TOKEN` for Copilot
- **Profile integrity:** an `https://` `repoUrl` without credentials (validation does not contact the remote), a `docker-compose.yml`, `stages` with at least one entry and unique roles, `revisionStatuses` within `statuses`, no comment trigger shared by two variants with a common project, and a warning for a variant without `projects`
- **Stage CLIs:** `effort` only on Claude Code stages, `githubMcpTools` only when some stage runs Copilot, `claude.loadRepoInstructions` only when some container stage runs Claude Code, each stage's model valid for its CLI, and a local stage's role usable as a directory name
- **Agent templates:** canonical frontmatter in every `profiles/<id>/agents/*.agent.md`, unique names, `subagents` that exist and form no cycle; for each stage, a root agent that exists and does not `inherit` its model, a Claude Code root that lists skills keeps the `Skill` tool, every reachable agent runs on the stage's CLI and preloads only skills the stage has, and on Copilot every reachable model has a Copilot equivalent
- **Skills:** every stage's skills exist under `shared/skills/`; every skill folder name is unique, and its `SKILL.md` frontmatter `name` equals the folder name and has a non-empty `description`
- **MCP manifests:** Referenced servers must exist in `shared/mcp-servers/`, `sidecarPort` must be a valid integer (1–65535), ports must be unique across all servers and clear of the sidecar health port and filtered servers' upstream ports, and each variant must provide every `requiredConfig` variable
- **Security infrastructure:** Security overlay compose file and squid.conf must exist, base compose files must use `ralph-internal` network, no `docker.sock` mounts
- **Docker daemon:** Must be reachable via `docker info`
- **Host tools:** `perl` runs; `jq` runs when a host stage runs Claude Code; every CLI a host stage runs is installed under `node_modules/.bin` at the version `package.json` pins
- **Profiles auto-discovered** from `profiles/*/profile.json` — the profile `id` is derived from the directory name

Invalid configuration causes the orchestrator to exit with a descriptive error message.
