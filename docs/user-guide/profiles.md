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
└── .build/                   — Generated at startup and again for every task (gitignored)
    ├── <cli>/agents/         — Rendered agents of the current stage, in its CLI's format
    ├── skills/               — Rendered skills of the current stage
    ├── claude/               — Claude Code session settings (hooks, attribution) and an empty user settings file, when a container stage runs Claude Code
    ├── copilot-settings.json — Copilot CLI settings (URL allowlist), when a container stage runs Copilot
    ├── mcp-config.json       — CLI MCP config (URL-only, points to sidecar)
    ├── gateway.json          — Sidecar MCP config (credentials + env)
    ├── docker-compose.overlay.yml  — Generated compose overlay
    ├── squid.conf            — Generated proxy config
    ├── pre-init.sh           — Sidecar init script, when an MCP server declares an `initScript`
    └── attachments/          — File exchange between the agent container and the sidecar
```

### Supporting Shared Directories

```
shared/
├── security/                 — Squid proxy compose overlay + base config
├── hooks/                    — Audit hooks of both CLIs and the Claude Code result gate
├── agent-includes/           — Shared Liquid partials for agent templates
│   ├── prompt-security.md
│   ├── personality/
│   │   └── ralph.md
│   └── ralph-docs/
│       └── ralph-standard-workflow.md
├── mcp-servers/<name>/       — MCP server manifests + source code
├── mcp-sidecar/              — Gateway container (process manager + tool-filter proxy)
└── skills/                   — Shared agent skill folders, grouped by category
    └── workflow/
        └── docs/
            └── ralph-workflow/
                └── SKILL.md
```

## Profile Discovery

At startup, the orchestrator:

1. Scans `profiles/` for subdirectories containing `profile.json`
2. Validates each against the Zod schema
3. Explodes into one `IAgentProfile` per variant (each variant is an independent match target)
4. Derives `profileId` from the directory name, `agentName` from the first stage's `agent`, and `displayName` by stripping the `ralph.` prefix

## profile.json Reference

### Profile-Level Fields

| Field                 | Type                          | Default                                | Description                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repoUrl`             | `string`                      | — (required)                           | `https://` URL of the target repository, without credentials (`user@` or `user:secret@` is rejected). Each task works in its own clone of it; see [Task Workspaces](#task-workspaces)                                                                                                                                                                                             |
| `dataSource`          | `string`                      | — (required)                           | Key from `config.json` `dataSources`                                                                                                                                                                                                                                                                                                                                              |
| `vcsProvider`         | `"ado"` &#124; `"github"`     | `"ado"`                                | VCS platform. Controls git auth header format                                                                                                                                                                                                                                                                                                                                     |
| `repoPat`             | `string`                      | `"ADO_PAT"` or `"GH_TOKEN"`            | Env var name holding the git PAT that clones and fetches `repoUrl`. Default depends on `vcsProvider`; startup validation fails when it is unset                                                                                                                                                                                                                                   |
| `cli`                 | `"claude"` &#124; `"copilot"` | `"claude"`                             | Default CLI of the profile's stages; `stages[].cli` overrides it.                                                                                                                                                                                                                                                                                                                 |
| `claude`              | `object`                      | `{ "loadRepoInstructions": false }`    | Claude Code options. `loadRepoInstructions: true` loads the target repo's own `CLAUDE.md` files and `.claude/` project settings in container stages that run `"claude"`; off, Claude Code reads only the orchestrator's settings, agents and skills. Startup validation fails when it is set and no container stage runs `"claude"`                                               |
| `model`               | `string`                      | _(optional)_                           | Model for all variants, validated for each stage's CLI: a Claude Code alias (`opus`, `sonnet`, `haiku`, `fable`, optionally with `[1m]`) or hyphenated id (`claude-opus-5-5`), or a dotted Copilot id (`claude-opus-4.6`). Without one, a Claude Code stage runs the model its root agent declares and a Copilot stage runs `claude-opus-4.6`                                     |
| `timeoutMs`           | `number`                      | `1800000` (30 min)                     | Max execution time in milliseconds                                                                                                                                                                                                                                                                                                                                                |
| `setupScript`         | `string`                      | `"/usr/local/bin/setup.sh"`            | Absolute path to setup script inside container                                                                                                                                                                                                                                                                                                                                    |
| `auditLogPath`        | `string`                      | `"/workspace/.ralph/logs/audit.jsonl"` | Audit log path inside container                                                                                                                                                                                                                                                                                                                                                   |
| `composeProjectLabel` | `string`                      | `"ralph-sandbox"`                      | Docker Compose project label                                                                                                                                                                                                                                                                                                                                                      |
| `cleanPaths`          | `string[]`                    | `[]`                                   | Absolute container paths deleted (`rm -rf`) before each agent run (once before the first stage, not per-stage). Each task starts in a fresh workspace; never list `/workspace/.ralph/tasks`, which holds the task's own directory                                                                                                                                                 |
| `maxContinuations`    | `number`                      | `0`                                    | Max times (0–10) a stage is resumed when it ends without the result block it requires (`requireResultBlock`); a stage that waives the block is never resumed, nor is a timed-out session. Copilot resumes with `--continue`, Claude Code with `--resume <session id>`, after an exponential backoff (5s base, 30s cap). Also requires `enableContinuation: true` in `config.json` |
| `mcpServers`          | `array`                       | `[]`                                   | MCP servers to deploy. Entries can be plain strings or objects with `env` (task-scoped macros) and `sidecarEnv` (container-level env). See [MCP Servers](mcp-servers.md)                                                                                                                                                                                                          |
| `allowlistDomains`    | `string[]`                    | `[]`                                   | Domains added to the task's Squid egress allowlist (and Copilot's `allowedUrls`), besides the model API of each CLI the variant's container stages run                                                                                                                                                                                                                            |
| `githubMcpTools`      | `false` &#124; `string[]`     | `false`                                | Copilot's built-in GitHub MCP server. `false` disables it, array enables specific tools only. Affects only Copilot stages; startup validation fails when it is set and no stage runs `"copilot"`                                                                                                                                                                                  |
| `resources`           | `object`                      | _(optional)_                           | Resource auto-mount config. See [Resources](#resources)                                                                                                                                                                                                                                                                                                                           |

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
      "stages": [{ "agent": "ralph.ralph", "role": "primary", "mode": "container" }]
    }
  ]
}
```

#### Variant Fields

| Field            | Type             | Default             | Description                                                                                                                                                                               |
| ---------------- | ---------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`    | `string`         | _(optional)_        | Human-readable description                                                                                                                                                                |
| `model`          | `string`         | _(optional)_        | Model override for this variant (overrides profile-level)                                                                                                                                 |
| `match`          | `object`         | — (required)        | Match rules (see below)                                                                                                                                                                   |
| `beforeAgent`    | `object`         | _(optional)_        | Pre-execution JIRA transitions                                                                                                                                                            |
| `afterAgent`     | `object`         | _(optional)_        | Post-execution JIRA transitions                                                                                                                                                           |
| `stages`         | `IStageConfig[]` | — (required, min 1) | Sequential agent pipeline                                                                                                                                                                 |
| `mcpServers`     | `array`          | `[]`                | Additional MCP servers for this variant. Merged with profile-level (effective set = union). Same syntax as profile-level `mcpServers` — supports string or object with `env`/`sidecarEnv` |
| `preflight`      | `string`         | _(optional)_        | Named preflight check. Aborts on failure                                                                                                                                                  |
| `failureComment` | `string`         | _(optional)_        | JIRA comment posted when preflight fails                                                                                                                                                  |
| `postTaskHooks`  | `array`          | `[]`                | Post-task hook pipelines (local-only). See [Post-Task Hooks](#post-task-hooks)                                                                                                            |

#### Match Rules

| Field              | Type       | Default      | Description                                                                                                                                                          |
| ------------------ | ---------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`         | `string[]` | `[]`         | JIRA project keys to match. Empty = the variant matches nothing, and startup validation warns                                                                        |
| `statuses`         | `string[]` | `[]`         | JIRA statuses to match (case-insensitive). Empty = match any                                                                                                         |
| `commentTrigger`   | `string`   | — (required) | Trigger string in JIRA comments. Case-insensitive word-boundary match. Supports parenthesized parameters. Two variants that share a project must not share a trigger |
| `revisionStatuses` | `string[]` | `[]`         | Statuses that set `isRevision: true` in the template context. When `statuses` is set, each must be one of them                                                       |

#### Lifecycle Transitions

| Field                      | Type     | Description                                              |
| -------------------------- | -------- | -------------------------------------------------------- |
| `beforeAgent.targetStatus` | `string` | JIRA status to transition to before running the agent    |
| `afterAgent.targetStatus`  | `string` | JIRA status to transition to after successful completion |

### Stages

Each variant has a `stages` array defining a sequential agent pipeline. Stages execute in order; each stage's output is available to subsequent stages.

```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "primary", "mode": "container", "skills": ["ralph-workflow"] },
    { "agent": "ralph.malph", "role": "reviewer", "mode": "container", "model": "sonnet", "effort": "high" }
  ]
}
```

| Field                | Type                                                                      | Default                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`              | `string`                                                                  | — (required)                                       | The stage's root agent: the template file `agents/<agent>.agent.md` (e.g. `"ralph.ralph"`). Claude Code runs it by its frontmatter `name`, Copilot by this file id                                                                                                                                                                                                                                                         |
| `role`               | `string`                                                                  | — (required)                                       | Unique role within the pipeline (e.g. `"primary"`, `"reviewer"`). A `"local"` stage's role names its workspace directory, so it must be letters, digits, `_` and `-`                                                                                                                                                                                                                                                       |
| `mode`               | `"container"` &#124; `"local"`                                            | `"container"`                                      | `"container"` runs in the agent container, `"local"` runs on the host (see [Host Stages](#host-stages))                                                                                                                                                                                                                                                                                                                    |
| `cli`                | `"claude"` &#124; `"copilot"`                                             | the profile `cli`                                  | CLI the stage runs                                                                                                                                                                                                                                                                                                                                                                                                         |
| `skills`             | `string[]`                                                                | `[]`                                               | Skill folder names from `shared/skills/` the stage's agents can use. They are rendered for the stage and validated at startup                                                                                                                                                                                                                                                                                              |
| `model`              | `string`                                                                  | _(optional)_                                       | Model override. Precedence: stage > variant > profile. Validated for the stage's CLI; a stage whose `cli` differs from the profile's must set its own `model` when the variant or profile sets one                                                                                                                                                                                                                         |
| `effort`             | `"low"` &#124; `"medium"` &#124; `"high"` &#124; `"xhigh"` &#124; `"max"` | _(optional)_                                       | Claude Code reasoning effort (`--effort`). Only on stages that run `"claude"`                                                                                                                                                                                                                                                                                                                                              |
| `timeoutMs`          | `number`                                                                  | _(optional)_                                       | Timeout override for this stage. Falls back to profile-level `timeoutMs`                                                                                                                                                                                                                                                                                                                                                   |
| `requireResultBlock` | `boolean`                                                                 | `true` for variant stages, `false` for hook stages | Whether the stage must end with the `===RALPH_RESULT_START===` … `===RALPH_RESULT_END===` block. A stage that requires it and ends without it fails with `missing-result-block`; only such a stage is resumed (`maxContinuations`). A stage that waives it completes on exit code 0. On Claude Code, Ralph's `Stop` hook also holds a stage that requires the block until the agent prints it, up to two times per session |

#### Host Stages

A `"local"` stage, and every post-task hook stage, runs on the host in a workspace of its own under the task's output directory: `stages/<role>/` for a variant stage, `hooks/<hook>/<role>/` for a hook stage. The CLI works in its `work/` directory, with a private home in `home/` and its logs in `logs/`, so the developer's own CLI config, agents, skills and MCP servers stay out.

- It runs the CLI the orchestrator's `npm ci` installed at the version `package.json` pins (`node_modules/.bin/claude` or `node_modules/.bin/copilot`), never one found on `PATH`. Startup validation checks that binary and its version for every CLI a host stage runs.
- Its environment holds `PATH`, `HOME`, `LANG` and its CLI's credential, and no other orchestrator secret.
- A Claude Code host stage loads no MCP server and has no web tools. It may read only its workspace, the task's output directory, the task's workspace (variant stages only), the task profile's `agents/` and the orchestrator's `shared/agent-includes`, `shared/skills` and `shared/mcp-servers`, write only in its working and artifact directories, and run only read-only shell commands. Ralph's audit hooks run from `shared/hooks/`, so the host needs `jq`.
- A Copilot host stage runs with every tool and path allowed (`--allow-all-tools --allow-all-paths`) and without Ralph's audit hooks.
- The host always needs `perl`, which redacts transcripts.

### Preflight Checks

Available named checks:

| Name             | Validates                                                           |
| ---------------- | ------------------------------------------------------------------- |
| `review-ready`   | PR URL exists in issue comments AND handoff attachment is available |
| `revision-ready` | PR URL exists in issue comments AND handoff attachment is available |

Unknown check names pass by default.

### Post-Task Hooks

Post-task hooks run local-mode stages after the main pipeline completes and the containers are torn down. They receive the task's log directory and collected logs. Each stage runs its CLI (`cli`, else the profile `cli`) on the host in its own workspace, `<task output dir>/hooks/<hook>/<role>/`, and all stages of one hook share the artifact directory `hooks/<hook>/artifacts/` (see [Host Stages](#host-stages)). Hook stages are never resumed, and a stage that does not complete skips the rest of its hook. Hook failures are logged and never change the task's result.

```json
{
  "postTaskHooks": [
    {
      "name": "run-analysis",
      "stages": [{ "agent": "ralph.run-analyzer", "role": "analyzer", "mode": "local" }]
    }
  ]
}
```

| Field    | Type             | Required    | Description                                                                            |
| -------- | ---------------- | ----------- | -------------------------------------------------------------------------------------- |
| `name`   | `string`         | Yes         | Lowercase alphanumeric + hyphens. Identifies the hook                                  |
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

| Field       | Type     | Description                                                                                             |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `mountBase` | `string` | Container path prefix relative to `/workspace`. Files mount at `/workspace/<mountBase>/<relative-path>` |

All files in the `resources/` directory are discovered recursively and mounted individually.

## Compose Merge

Containers use a three-file compose merge:

```
profiles/<id>/docker-compose.yml                    — Base (services, volumes, env)
+ shared/security/docker-compose.security.yml       — Security overlay (Squid, network isolation, resource limits)
+ profiles/<id>/.build/docker-compose.overlay.yml   — Generated per task (agent CLI versions, settings, agents, skills and credential; MCP sidecar; resource mounts)
```

The overlay is skipped if absent. It gives the agent container only the mounts, environment and credential of the CLIs the variant's container stages run.

## Creating a New Profile

1. Create `profiles/<id>/` directory
2. Add `profile.json` with at minimum `repoUrl`, `dataSource`, and one variant with a `stages` array
3. Create a `Dockerfile` for the container image
4. Create `docker-compose.yml` defining the base service
5. Create `setup.sh` for container initialization (dependency install, env setup)
6. Create agent templates in `agents/` — one `.agent.md` per agent name referenced in stages, each with the canonical, CLI-neutral frontmatter (see [Agent Templates](../dev-doc/agent-templates.md))
7. Optionally add `resources/` for profile-specific files and declare `resources.mountBase`
8. Run `npm run validate` to check all config, schemas, and Docker setup

The profile is auto-discovered on next startup. Use an existing profile (e.g. `profiles/ralph-docs/`) as a reference for the Dockerfile, compose file, and setup script structure.

## Task Workspaces

There is no target-repo checkout to prepare: the orchestrator clones `repoUrl` itself and gives every task its own clone.

- **Source clone.** `cache/repos/<profileId>` is a bare clone of `repoUrl`, made on the profile's first task and fetched (every branch, pruning deleted ones) before each later task.
- **Workspace.** `cache/workspaces/<key>-<startTs>` (the name of the task's output directory) is a local clone of the source clone, checked out on the base branch (`source_branch`, the PR's target branch on a revision, else `main`) with `origin` set to `repoUrl`. The task branch is then checked out from the remote when it exists there, or created from the base branch; a revision fails when the remote has no task branch. The workspace is mounted at `/workspace` in the agent container and the MCP sidecar, which push the task branch straight to `repoUrl`.
- **Credentials.** Git authenticates with the PAT in the `repoPat` env var through a per-command `http.extraHeader`; no clone's config stores it, and git errors show it as `***`.
- **Cleanup.** A workspace is deleted once its task succeeds (completed or partial). A failed or blocked task keeps it, and the activity log names its path; delete it yourself once you are done with it.

Everything ignored or untracked in a workspace (installed dependencies, build caches, local config copied by `setup.sh`) starts fresh with each task.

## Bind-Mount Artifact Exclusion

Docker bind mounts for skills, agent templates, hook configs and `.ralph/` create files inside the task's workspace. When the workspace is created, `.ralph/` and, anchored to the repo root, the mount targets outside it of the CLIs the variant's container stages run (`/.github/agents/`, `/.github/skills/`, `/.github/hooks/ralph-audit.json` for Copilot) go into its `.git/info/exclude`, so these artifacts never appear in `git status` or get staged. Claude Code mounts only inside `.ralph/`. Before compose up, the orchestrator creates every directory those mounts land in, so Docker does not create them as root and the workspace stays deletable.
