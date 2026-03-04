# Profiles

Each profile maps a target repository to agent configurations. Profiles live under `profiles/<id>/` and are auto-discovered at startup by scanning for `profile.json` files.

## Directory Structure

A complete profile directory:

```
profiles/<id>/
├── profile.json              — Configuration (variants, stages, MCP, match rules)
├── Dockerfile                — Container image definition
├── docker-compose.yml        — Base compose file (services, volumes, env)
├── setup.sh                  — Container setup script (runs before agent)
├── agents/                   — Agent templates (Liquid source)
│   ├── ralph.primary.agent.md
│   └── ralph.reviewer.agent.md
├── resources/                — Profile-specific files mounted into container
│   └── data/
│       └── config.json
└── .build/                   — Generated at startup (gitignored)
    ├── *.agent.md            — Rendered agent templates
    ├── mcp-config.json       — CLI MCP config (URL-only, points to sidecar)
    ├── gateway.json          — Sidecar MCP config (credentials + env)
    ├── docker-compose.overlay.yml  — Generated compose overlay
    └── squid.conf            — Generated proxy config
```

### Supporting Shared Directories

```
shared/
├── security/                 — Squid proxy compose overlay + base config
├── agent-includes/           — Shared Liquid partials for agent templates
│   ├── prompt-security.md
│   ├── personality/
│   │   └── ralph.md
│   └── ralph-docs/
│       └── ralph-standard-workflow.md
├── mcp-servers/<name>/       — MCP server manifests + source code
├── mcp-sidecar/              — Gateway container (supergateway process manager)
└── skills/                   — Shared agent skill folders
    ├── workflow/
    │   └── ralph-workflow-setup/
    │       └── SKILL.md
    └── .build/               — Rendered skill output (gitignored)
```

## Profile Discovery

At startup, the orchestrator:

1. Scans `profiles/` for subdirectories containing `profile.json`
2. Validates each against the Zod schema
3. Explodes into one `IAgentProfile` per variant (each variant is an independent match target)
4. Derives `profileId` from the directory name, `agentName` from the first stage's `agent`, and `displayName` by stripping the `ralph.` prefix

## profile.json Reference

### Profile-Level Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `repo` | `string` | — (required) | Path to target repository. Supports `~` expansion |
| `dataSource` | `string` | — (required) | Key from `config.json` `dataSources` |
| `vcsProvider` | `"ado"` &#124; `"github"` | `"ado"` | VCS platform. Controls git auth header format |
| `repoPat` | `string` | `"ADO_PAT"` or `"GH_TOKEN"` | Env var name holding the git PAT. Default depends on `vcsProvider` |
| `cli` | `"copilot"` &#124; `"claude"` | `"copilot"` | Which AI CLI to run inside the container |
| `model` | `string` | *(optional)* | Model override for all variants |
| `timeoutMs` | `number` | `1800000` (30 min) | Max execution time in milliseconds |
| `setupScript` | `string` | `"/usr/local/bin/setup.sh"` | Absolute path to setup script inside container |
| `auditLogPath` | `string` | `"/workspace/.ralph/logs/audit.jsonl"` | Audit log path inside container |
| `composeProjectLabel` | `string` | `"ralph-sandbox"` | Docker Compose project label |
| `cleanPaths` | `string[]` | `[]` | Absolute container paths deleted (`rm -rf`) before each agent run (once before the first stage, not per-stage) |
| `maxContinuations` | `number` | `0` | Max auto-retry attempts (0–10) when agent doesn't produce a result block. Uses exponential backoff (5s base, 30s cap). Also requires `enableContinuation: true` in `config.json` |
| `mcpServers` | `array` | `[]` | MCP servers to deploy. See [MCP Servers](mcp-servers.md) |
| `githubMcpTools` | `false` &#124; `string[]` | `false` | Copilot's built-in GitHub MCP server. `false` disables it, array enables specific tools only. No effect on `cli: "claude"` |
| `resources` | `object` | *(optional)* | Resource auto-mount config. See [Resources](#resources) |
| `skills` | `string[]` | `[]` | Skill folder names from `shared/skills/` to mount at `.github/skills/` |

### Variants

Each profile has a `variants` array. Each variant is an independent trigger target with its own match rules, stages, and lifecycle transitions.

```json
{
  "variants": [
    {
      "description": "Primary documentation agent",
      "match": {
        "projects": ["DOC"],
        "statuses": ["To Do", "Defect Found"],
        "commentTrigger": "@Ralph",
        "revisionStatuses": ["Defect Found"]
      },
      "beforeAgent": { "targetStatus": "In Progress" },
      "afterAgent": { "targetStatus": "Ready for Review" },
      "stages": [
        { "agent": "ralph.ralph", "role": "primary", "mode": "container" }
      ]
    }
  ]
}
```

#### Variant Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `description` | `string` | *(optional)* | Human-readable description |
| `model` | `string` | *(optional)* | Model override for this variant (overrides profile-level) |
| `match` | `object` | — (required) | Match rules (see below) |
| `beforeAgent` | `object` | *(optional)* | Pre-execution JIRA transitions |
| `afterAgent` | `object` | *(optional)* | Post-execution JIRA transitions |
| `stages` | `IStageConfig[]` | — (required, min 1) | Sequential agent pipeline |
| `preflight` | `string` | *(optional)* | Named preflight check. Aborts on failure |
| `failureComment` | `string` | *(optional)* | JIRA comment posted when preflight fails |
| `postTaskHooks` | `array` | `[]` | Post-task hook pipelines (local-only). See [Post-Task Hooks](#post-task-hooks) |

#### Match Rules

| Field | Type | Default | Description |
|---|---|---|---|
| `projects` | `string[]` | `[]` | JIRA project keys to match. Empty = match any |
| `statuses` | `string[]` | `[]` | JIRA statuses to match (case-insensitive). Empty = match any |
| `commentTrigger` | `string` | — (required) | Trigger string in JIRA comments. Case-insensitive word-boundary match. Supports parenthesized parameters |
| `revisionStatuses` | `string[]` | `[]` | Statuses that set `isRevision: true` in the template context |

#### Lifecycle Transitions

| Field | Type | Description |
|---|---|---|
| `beforeAgent.targetStatus` | `string` | JIRA status to transition to before running the agent |
| `afterAgent.targetStatus` | `string` | JIRA status to transition to after successful completion |

### Stages

Each variant has a `stages` array defining a sequential agent pipeline. Stages execute in order; each stage's output is available to subsequent stages.

```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "primary", "mode": "container", "skills": ["git-workflow"] },
    { "agent": "ralph.malph", "role": "reviewer", "mode": "container", "model": "claude-sonnet-4-20250514" }
  ]
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `agent` | `string` | — (required) | Agent CLI name (e.g. `"ralph.ralph"`). Maps to `agents/<agent>.agent.md` |
| `role` | `string` | — (required) | Unique role within the pipeline (e.g. `"primary"`, `"reviewer"`) |
| `mode` | `"container"` &#124; `"local"` | `"container"` | `"container"` runs in Docker, `"local"` runs on the host |
| `skills` | `string[]` | `[]` | Skill names for this stage. Overrides profile-level `skills` for template rendering |
| `model` | `string` | *(optional)* | Model override. Precedence: stage > variant > profile |
| `timeoutMs` | `number` | *(optional)* | Timeout override for this stage. Falls back to profile-level `timeoutMs` |

### Preflight Checks

Available named checks:

| Name | Validates |
|---|---|
| `review-ready` | PR URL exists in issue comments AND handoff attachment is available |
| `revision-ready` | PR URL exists in issue comments AND handoff attachment is available |

Unknown check names pass by default.

### Post-Task Hooks

Post-task hooks run local-mode stages after the main pipeline completes. They receive the task's log directory and collected artifacts.

```json
{
  "postTaskHooks": [
    {
      "name": "run-analysis",
      "stages": [
        { "agent": "ralph.run-analyzer", "role": "analyzer", "mode": "local" }
      ]
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Lowercase alphanumeric + hyphens. Identifies the hook |
| `stages` | `IStageConfig[]` | Yes (min 1) | Stage objects. **All must have `mode: "local"`**. Roles must be unique within the hook |

Hook agents have access to additional template variables under `hook.*` — see [Template Variables](template-variables.md#post-task-hook-context).

## Resources

Files in `profiles/<id>/resources/` are automatically mounted read-only into the container.

```json
{
  "resources": {
    "mountBase": "resources/my-data"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `mountBase` | `string` | Container path prefix relative to `/workspace`. Files mount at `/workspace/<mountBase>/<relative-path>` |

All files in the `resources/` directory are discovered recursively and mounted individually.

## Compose Merge

Containers use a three-file compose merge:

```
profiles/<id>/docker-compose.yml                    — Base (services, volumes, env)
+ shared/security/docker-compose.security.yml       — Security overlay (Squid, network isolation, resource limits)
+ profiles/<id>/.build/docker-compose.overlay.yml   — Generated (MCP sidecar, skill mounts, resource mounts)
```

The overlay is skipped if absent.

## Creating a New Profile

1. Create `profiles/<id>/` directory
2. Add `profile.json` with at minimum `repo`, `dataSource`, and one variant with a `stages` array
3. Create a `Dockerfile` for the container image
4. Create `docker-compose.yml` defining the base service
5. Create `setup.sh` for container initialization (dependency install, env setup)
6. Create agent templates in `agents/` — one `.agent.md` per agent name referenced in stages
7. Optionally add `resources/` for profile-specific files and declare `resources.mountBase`
8. Run `npm run validate` to check all config, schemas, and Docker setup

The profile is auto-discovered on next startup. Use an existing profile (e.g. `profiles/ralph-docs/`) as a reference for the Dockerfile, compose file, and setup script structure.

## Bind-Mount Artifact Exclusion

Docker bind mounts for skills, agent templates, and `.ralph/` create files inside the target repo checkout on the host. The `RepoSyncHook` automatically writes patterns (`.ralph/`, `.github/skills/`, `.github/agents/`) to `.git/info/exclude` before any git operation, preventing these artifacts from appearing in `git status` or being staged.
