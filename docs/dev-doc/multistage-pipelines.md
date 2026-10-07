# Multistage Pipelines

Sequential agent pipelines that run multiple CLI agents over a single container lifecycle.

## Overview

A multistage pipeline defines an ordered list of agents within a single variant. Each agent (stage) runs to completion before the next starts. Container stages share one Docker container, the task's workspace and MCP configuration — enabling stage-to-stage artifact handoff through the shared filesystem. Local stages run on the host and reach the same workspace through its host path.

```
┌──────────────────────────────────────────────────────────────┐
│  Container lifecycle (one per task)                           │
│                                                              │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│  │ Stage 1   │ ──► │ Stage 2   │ ──► │ Stage 3   │            │
│  │ researcher│     │ writer    │     │ reviewer  │            │
│  │ container │     │ container │     │ local     │            │
│  └──────────┘     └──────────┘     └──────────┘            │
│       │                │                │                    │
│       ▼                ▼                ▼                    │
│   artifacts/       workspace/       artifacts/               │
│   research.md      PR created       review report            │
└──────────────────────────────────────────────────────────────┘
```

**Key behaviors:**

- **Sequential execution** — each stage awaits the previous stage's completion
- **Abort on failure** — if any stage returns `TaskStatus.Error`, the pipeline stops
- **Last stage authoritative** — the final stage's `RalphResult` (status, PR URL, stdout) is the task outcome
- **Duration = sum** — total task duration is the sum of all stage durations
- **Shared workspace** — all container stages share `/workspace`; each local stage runs in a workspace of its own under the task's output directory

## Configuration

Stages are declared in the `stages` array inside a variant in `profile.json`:

```json
{
  "variants": [
    {
      "match": {
        "projects": ["DOC"],
        "statuses": ["To Do"],
        "commentTrigger": "@RalphDocs"
      },
      "stages": [
        {
          "agent": "ralph.ralph-researcher",
          "role": "researcher",
          "mode": "container",
          "skills": ["ralph-research-guide"],
          "timeoutMs": 1800000
        },
        {
          "agent": "ralph.ralph",
          "role": "writer",
          "mode": "container",
          "skills": ["ralph-documentation-syntax", "ralph-codesamples"],
          "timeoutMs": 3600000
        },
        {
          "agent": "ralph.ralph-reviewer",
          "role": "reviewer",
          "mode": "local",
          "skills": ["agent-eval"],
          "model": "sonnet",
          "effort": "high",
          "timeoutMs": 600000
        }
      ]
    }
  ]
}
```

### Stage fields

| Field                | Type                       | Required | Default                                      | Description                                                                                                                                                                                                           |
| -------------------- | -------------------------- | -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`              | `string`                   | Yes      | —                                            | Template file id of the stage's root agent (e.g. `ralph.ralph`). Must match a `.agent.md` file in `profiles/<id>/agents/`.                                                                                            |
| `role`               | `string`                   | Yes      | —                                            | Unique identifier within the pipeline (e.g. `primary`, `reviewer`). Must be unique across stages in the same variant. A local stage's role names its workspace directory, so it must be letters, digits, `_` and `-`. |
| `mode`               | `"container"` \| `"local"` | No       | `"container"`                                | Where the agent runs. `container` = inside Docker; `local` = on the host.                                                                                                                                             |
| `cli`                | `"claude"` \| `"copilot"`  | No       | profile `cli` (`"claude"`)                   | CLI the stage runs.                                                                                                                                                                                                   |
| `skills`             | `string[]`                 | No       | `[]`                                         | Skill folder names for this stage.                                                                                                                                                                                    |
| `model`              | `string`                   | No       | variant/profile default                      | Model override for this stage, in the stage CLI's form: a Claude Code alias (`opus`) or hyphenated id, or a dotted Copilot id (`claude-opus-4.6`).                                                                    |
| `effort`             | `string`                   | No       | —                                            | Claude Code reasoning effort (`--effort`). Claude Code stages only.                                                                                                                                                   |
| `requireResultBlock` | `boolean`                  | No       | `true` (variant stage), `false` (hook stage) | Fail the stage when the agent ends without a result block whose `STATUS` the orchestrator accepts.                                                                                                                    |
| `timeoutMs`          | `number`                   | No       | profile-level `timeoutMs`                    | Execution timeout in milliseconds.                                                                                                                                                                                    |

### Validation rules

- `stages` must contain at least one element
- Each `role` must be unique within the variant (enforced by Zod schema)
- The first stage's `agent` determines the variant's `agentName` and `displayName`
- `npm run validate` checks each stage against its CLI (`src/validate/stages.ts`, `src/validate/agents.ts`): `effort` only on Claude Code stages, a model the CLI accepts, a stage that switches CLI sets its own model, and every agent the stage can reach runs on its CLI. A CLI some stage runs needs its credential, and a CLI a local stage runs must be installed in `node_modules/.bin` at the pinned version

### Single-stage pipelines

A single-element `stages` array runs the pipeline loop once, and all stage context variables take first-stage values. Its templates are rendered once, before the containers start, unless the stage is local.

## Execution Modes

### Container mode (`"container"`)

The default. The agent CLI runs inside the Docker container via `docker compose exec`, as the `vscode` user. The agent has access to the task's workspace at `/workspace`, MCP tools via the sidecar, and the Squid proxy for network access. A Claude Code stage takes its prompt on stdin:

```
docker compose exec -T --user vscode -e RALPH_REQUIRE_RESULT_BLOCK=1 [-e CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=<n>] app \
  /usr/local/bin/claude -p --output-format stream-json --verbose --agent <name> [--model <model>] [--effort <effort>] \
  --setting-sources user --settings /etc/ralph/claude-settings.json --mcp-config /workspace/.ralph/mcp-config.json \
  --strict-mcp-config --permission-mode bypassPermissions \
  --tools Read,Write,Edit,Bash,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate,WebFetch,WebSearch[,Agent] \
  --session-id <uuid> --debug-file /workspace/.ralph/logs/cli-debug/claude.log < prompt
```

`<name>` is the root agent's frontmatter `name`; a continuation passes `--resume <uuid>` instead of `--session-id`. With `claude.loadRepoInstructions` the setting sources are `user,project`. A Copilot stage runs `/usr/local/bin/copilot --agent <fileId>` with its own flags, the prompt on stdin too (`src/container/cli-executors/copilot-executor.ts`).

### Local mode (`"local"`)

The agent CLI runs directly on the host machine, Claude Code (`LocalClaudeCodeExecutor`) or Copilot CLI (`LocalCopilotExecutor`), each from the orchestrator's own `node_modules/.bin` at the version `package.json` pins. It is intended for analysis and self-improvement workflows over the task's logs and the orchestrator's runtime sources (agent templates, skills, profile configs).

Each local stage gets a workspace of its own (`StageWorkspaceResolver`, `src/services/stage-workspace.ts`) under the task's output directory: `<outputDir>/stages/<role>/` for a variant's stage, `<outputDir>/hooks/<hook>/<role>/` for a post-task hook stage.

```
<stageDir>/
  work/                  ← the CLI's cwd (Copilot finds its agents and skills in work/.github/)
  home/                  ← private CLI home: CLAUDE_CONFIG_DIR (agents/, skills/, sessions) or Copilot --config-dir
  logs/                  ← debug log (claude.log, cli-debug/) and, for Claude Code, Ralph's audit hook output
  claude-settings.json   ← Claude Code only: hooks and permission rules, passed with --settings
```

```
node_modules/.bin/claude -p --output-format stream-json --verbose --agent <name> [--model <model>] [--effort <effort>] \
  --setting-sources user --settings <stageDir>/claude-settings.json --strict-mcp-config --permission-mode dontAsk \
  --tools Read,Write,Edit,Bash,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate[,Agent] \
  --add-dir <outputDir> [--add-dir <workspace>] --add-dir <repo>/profiles --add-dir <repo>/shared \
  --session-id <uuid> --debug-file <stageDir>/logs/claude.log < prompt
```

The host path of the task's workspace, its clone of the target repository where containerized stages work, is available in templates via `{{ targetRepoPath }}`; a variant's local stage may read it, and its `artifactDir` is the container stages' `.ralph/tasks/<key>/artifacts` in that workspace. The workspace is deleted after a successful task, once the post-task hooks have run.

**Local mode considerations:**

- No Docker isolation, no Squid proxy, no MCP sidecar. The CLI runs with the host user's permissions, so it is fenced in otherwise:
- Its environment holds only `PATH`, `HOME`, `LANG`, its own credential (`extendEnv: false`) and, for Claude Code, the variables that set its home, its headless behaviour and Ralph's audit log directory; no other orchestrator secret (`ADO_PAT`, `JIRA_*`, another CLI's token) reaches it.
- Its private home keeps the developer's own CLI settings, hooks, plugins, agents, skills, memory, login and MCP servers out.
- Claude Code loads no `CLAUDE.md` (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`; the output directory sits inside the orchestrator checkout), runs no MCP server and has no web tools. It runs in `dontAsk` mode under generated allow rules (`src/cli/claude/claude-host-settings.ts`): read the working directory, every `--add-dir` (the task's output directory, for a variant's stage the task's workspace, and the orchestrator's `profiles/` and `shared/`); write only in its working and artifact directories; run only `jq`, `grep`, `ls`, `wc`, `cat`, `head`, `tail` and `date` with Bash; load skills; track tasks; spawn the stage's subagents. Reading the orchestrator's `.env` is denied. Ralph's audit hooks and result gate run from `shared/hooks/` and write to `<stageDir>/logs/`, so the host needs `jq` and `perl`.
- Copilot CLI runs with `--allow-all-tools --allow-all-paths`, its home at `--config-dir <stageDir>/home` and its debug log in `<stageDir>/logs/cli-debug/`, without Ralph's audit hooks.
- No bundled local stage edits `profiles/` or `shared/`, and a Claude Code host session cannot: improvers write proposals into their artifact directory instead.

## Agent Templates

Each stage references its root agent by template file id (e.g. `ralph.ralph-researcher`). The corresponding template file must exist at `profiles/<id>/agents/<fileId>.agent.md`; Claude Code runs it under its frontmatter `name`, Copilot CLI under its file id.

### Per-stage rendering

Templates are re-rendered before each stage with stage-specific context, so each agent sees correct metadata for its position in the pipeline. Before the containers start, `ProfileSetupService.prepareForTask` renders the agents of every container stage, so every agent file the compose overlay mounts exists. Renders rewrite the files in `.build/` in place, so container stages see the changes through their bind mounts. A local stage renders its agents and skills into its own workspace right before it runs, even in a single-stage pipeline.

Copilot CLI mounts each agent file and skill directory into the target repo's `.github/` one by one (`ICliRuntime.mountsEachRenderedItem`). While a variant with a Copilot container stage runs, renders therefore keep every rendered file in place. Claude Code mounts its agents directory whole, so each stage's render removes the agents its root cannot reach. Local stages, post-task hook stages included, render into their own workspace and always prune.

### Stage context variables

These template variables change per-stage:

| Variable             | Type       | Description                                           |
| -------------------- | ---------- | ----------------------------------------------------- |
| `stageRole`          | `string`   | Current stage's role (e.g. `researcher`, `writer`).   |
| `stageMode`          | `string`   | `"container"` or `"local"`.                           |
| `stageIndex`         | `number`   | 0-based index of the current stage.                   |
| `stageCount`         | `number`   | Total number of stages in the pipeline.               |
| `isFirstStage`       | `boolean`  | Whether this is the first stage (`stageIndex === 0`). |
| `isLastStage`        | `boolean`  | Whether this is the last stage.                       |
| `previousStageRoles` | `string[]` | Roles of all completed stages (empty on first).       |
| `skills`             | `string[]` | Skill folder names for this specific stage.           |

### Template example

```liquid
---
name: 'ralph-reviewer'
description: 'Reviews agent output quality'
---

{% section "stage-context" %}
{% if stageCount > 1 %}
You are stage {{ stageIndex | plus: 1 }} of {{ stageCount }} in a sequential pipeline.
Your role: {{ stageRole }}.
{% if previousStageRoles.size > 0 %}
Previous stages completed: {{ previousStageRoles | join: ", " }}.
{% endif %}
{% endif %}

{% if stageMode == "local" %}
You are running on the host machine, in a workspace of your own.
The target repository (where containerized agents work) is at: {{ targetRepoPath }}
{% endif %}
{% endsection %}

{% section "instructions" %}
...stage-specific instructions...
{% endsection %}
```

## Pipeline Execution Flow

`TaskRunner.executeAgent()` fetches the issue context and hands it to `AgentPipelineExecutor.run()`, which drives the stages:

```
1. Fetch comments + handoff context (once per task)
2. For each stage, in the workspace StageWorkspaceResolver gives it:
   a. Re-render agent & skill templates with stage-specific context (multi-stage pipelines and local stages)
   b. Create per-stage executor for the stage's CLI (container or local)
   c. Build and audit the prompt from work item + issue context
   d. Run CLI session (continuation retries when enabled and the stage requires a result block)
   e. Parse the result block from the decoded agent text and resolve the stage status
   f. For a container stage, check the audit log for each session's session_start (hookless sessions are listed in the summary)
   g. Multi-stage container stage: collect its logs under its role, then empty the single-file logs for the next stage
   h. Record StageResult
   i. If error → abort pipeline
3. Aggregate: last stage's result is final, duration = sum of all stages
```

### Stage result aggregation

Each stage produces a `StageResult`:

```typescript
interface StageResult {
  role: string; // e.g. "researcher"
  status: TaskStatus; // Completed | Partial | Blocked | Error
  durationMs: number;
  exitCode: number;
  collectedLogs: Record<string, string>;
}
```

For multi-stage pipelines, the final `RalphResult` includes `stageResults: StageResult[]` alongside the authoritative last-stage output. Single-stage pipelines omit `stageResults`.

### Abort behavior

The pipeline aborts immediately on the first `TaskStatus.Error`. All prior completed stages remain in `stageResults`. The error stage's result becomes the final result (with duration summed from all executed stages).

## Artifact Handoff

Container stages share the task's workspace at `/workspace`. Stage 1 can write files that stage 2 reads — no special configuration needed. `{{ artifactDir }}` (`.ralph/tasks/<key>/artifacts`) is git-excluded, so files there stay out of the agent's commits.

**Common patterns:**

| Pattern            | Stage 1 writes                                  | Stage 2 reads                           |
| ------------------ | ----------------------------------------------- | --------------------------------------- |
| Research notes     | `{{ artifactDir }}/ralph-researcher/output.md`  | Agent template references the file path |
| Task decomposition | `{{ artifactDir }}/ralph-planner/tasks.json`    | Agent template loads structured tasks   |
| Quality metrics    | `{{ artifactDir }}/ralph-validator/status.json` | Reviewer agent reads evaluation data    |

For container → local handoff, the bind mount is the bridge: the task's workspace at `{{ targetRepoPath }}` on the host is `/workspace` inside the container, and a variant's local stage gets the same artifact folder as its absolute `{{ artifactDir }}`.

## Profile Setup

Each agent in the pipeline needs a corresponding `.agent.md` template:

```
profiles/<id>/
  agents/
    ralph.ralph-researcher.agent.md   ← stage 1
    ralph.ralph.agent.md              ← stage 2
    ralph.ralph-reviewer.agent.md     ← stage 3
  profile.json
  Dockerfile
  docker-compose.yml
  setup.sh
```

Each stage renders the agents its root can reach, with that stage's context, so shared partials get fresh stage context.

### Skill deployment

Each stage can declare its own `skills` array. Skills are re-rendered per-stage with the stage's context. The skill renderer syncs `profiles/<id>/.build/skills/` in place, so existing bind mounts keep working. Claude Code mounts that directory whole, so a stage sees only its own skills, unless the variant also runs Copilot CLI in the container: Copilot mounts each skill directory one by one, and while such a variant runs the renders keep every skill directory in place.

There is no profile-level `skills` field. The variant's container mounts the union of all its stages' skills, but each stage renders only its own list: a stage that declares no skills (`"skills": []`) gets an empty skill set.

## Known Limitations

### Log collection spans stages

Log sources (audit trail, transcript, proxy log, sidecar log, CLI debug logs, session exports) are registered once per task, not per stage. In a multi-stage pipeline each container stage's logs are collected right after it, with its role in the file name (`<key>-<startTs>-<ts>-<role>-<sourceId>`), and the single-file logs are emptied before the next stage. The sidecar log, the Copilot debug log directory and the folder exports (artifacts, Claude Code sessions, Copilot session state) are never emptied, so each collection holds every stage so far. Local stages write their logs into their own workspace, not these files.

### Continuation prompts lack stage context

When the continuation loop retries a stage that didn't produce a result block, the continuation prompt includes the work item ID but not the current stage role or index. The agent retains stage context from its rendered template, so this is unlikely to cause confusion in practice.

### MCP config is task-scoped

The JIT MCP parameter writer (`gateway.json` macro resolution) runs once per task. All stages share the same resolved MCP environment variables. Per-stage MCP env overrides are not supported.

### Prompt is task-scoped

The CLI prompt (built from work item fields, comments, and handoff) is identical across all stages. Stage-specific instructions should go in the agent template, not the prompt.

## Design Patterns

### Writer + Reviewer

The most common pattern: a containerized writer creates a PR, then a local reviewer evaluates quality.

```json
"stages": [
  { "agent": "ralph.ralph", "role": "writer", "mode": "container", "skills": ["ralph-documentation-syntax"] },
  { "agent": "ralph.ralph-reviewer", "role": "reviewer", "mode": "local", "skills": ["agent-eval"] }
]
```

### Researcher + Writer

A research stage gathers context before the writer starts:

```json
"stages": [
  { "agent": "ralph.ralph-researcher", "role": "researcher", "mode": "container", "skills": ["ralph-research-guide"], "timeoutMs": 1800000 },
  { "agent": "ralph.ralph", "role": "writer", "mode": "container", "skills": ["ralph-documentation-syntax"], "timeoutMs": 3600000 }
]
```

### Analyzer + Gap Filler (self-improvement)

A local analyzer reviews the agent's run telemetry, then a gap filler creates or updates skills:

```json
"stages": [
  { "agent": "ralph.ralph", "role": "primary", "mode": "container", "skills": ["ralph-documentation-syntax"] },
  { "agent": "ralph.ralph-analyst", "role": "analyzer", "mode": "local", "skills": ["agent-eval", "run-telemetry-analysis"] },
  { "agent": "ralph.ralph-gap-filler", "role": "gap-filler", "mode": "local", "skills": ["skill-creator"] }
]
```

## Post-Task Hooks

Post-task hooks are local-only agent pipelines that run **after** the main pipeline completes and the container is torn down. They are intended for analysis, self-improvement, and observability workflows that operate on the collected log artifacts.

### Key behaviors

- **Local-only** — all hook stages must be `mode: "local"`. Container mode is rejected by schema validation. `PostTaskHookRunner` runs each stage in its own workspace, `<outputDir>/hooks/<hook>/<role>/`.
- **Failure-isolated** — hook failures are logged as warnings. They never affect the task result, JIRA transitions, or operation ledger status.
- **Sequential within, independent across** — stages within a hook run sequentially. If a stage returns any non-Completed status, remaining stages in that hook are skipped. The next hook still runs.
- **No continuations, no result contract by default** — a hook stage is never continued, and `requireResultBlock` defaults to `false` for it.
- **After teardown** — hooks run after container teardown and log collection, so they have access to all collected log artifacts. A task whose pipeline threw before its results were collected runs no hooks.
- **Replayable** — with the `skip_hooks` trigger param, the task writes `<outputDir>/hook-manifest.json` instead of running the hooks; `npx tsx scripts/run-hooks.ts <outputDir>` replays them.

### Configuration

Add `postTaskHooks` to a variant alongside `stages`:

```json
{
  "stages": [{ "agent": "ralph.ralph", "role": "primary", "mode": "container" }],
  "postTaskHooks": [
    {
      "name": "run-analysis",
      "stages": [
        { "agent": "ralph.run-analyzer", "role": "analyzer", "mode": "local", "model": "sonnet" },
        { "agent": "ralph.agent-improver", "role": "improver", "mode": "local" }
      ]
    }
  ]
}
```

### Hook fields

| Field    | Type             | Required | Description                                                                                |
| -------- | ---------------- | -------- | ------------------------------------------------------------------------------------------ |
| `name`   | `string`         | Yes      | Unique identifier. Lowercase alphanumeric with hyphens (`^[a-z0-9-]+$`).                   |
| `stages` | `IStageConfig[]` | Yes      | Sequential local-only stages. Same schema as variant stages, but `mode` must be `"local"`. |

### Validation rules

- Hook names must match `^[a-z0-9-]+$`
- All stages must be `mode: "local"`
- Stage roles must be unique within each hook
- Hook names must be unique within the variant
- At least one stage per hook

### Template context

Hook stages receive the `hook` object in addition to the standard stage context (empty values for main pipeline stages):

| Variable               | Type                     | Description                                                                                   |
| ---------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `hook.taskOutputDir`   | `string`                 | Absolute path to the task's log directory (`<output.logDir>/<taskId>`)                        |
| `hook.collectedLogs`   | `Record<string, string>` | Map of log source IDs to file paths from the main pipeline                                    |
| `hook.name`            | `string`                 | Name of the current hook (e.g. `"run-analysis"`)                                              |
| `hook.outputDir`       | `string`                 | `<taskOutputDir>/hooks/<hook-name>` — created before the hook runs                            |
| `hook.cli`             | `string`                 | CLI the task's first stage ran (`claude` or `copilot`): the run the hook analyses             |
| `hook.orchestratorDir` | `string`                 | Absolute path of the orchestrator checkout, whose `profiles/` and `shared/` the hook may read |

`artifactDir` is `<taskOutputDir>/hooks/<hook-name>/artifacts`, absolute and shared by all of the hook's stages.

### Output directory layout

```
output/logs/<taskId>/
  DF-100-...-transcript.md     ← main pipeline logs
  DF-100-...-summary.json
  DF-100-...-audit.jsonl
  stages/<role>/               ← a variant's local stage: work/ home/ logs/ claude-settings.json
  hooks/
    run-analysis/              ← hook.outputDir (created by PostTaskHookRunner)
      artifacts/               ← {{ artifactDir }}: subagent-mapper/ run-analyzer/<subagent>/
                                 agent-improver/<subagent>/proposals/ run-synthesizer/
      scientist/               ← the stage's workspace: work/ home/ logs/ claude-settings.json
```

### Execution flow

```
Main pipeline stages → collectResults → container teardown
                                              ↓
                            postTaskHooks (local, no container)
                                          ↓
                                  hook: "run-analysis"
                                    stage: analyzer  →  stage: improver
                                          ↓
                                  hook: "next-hook" (if any)
```

### Built-in hooks

Every variant in the bundled profiles (`ralph-docs`: `@Ralph`, `@Malph`, `@RalphDev`; `ralph-vscode`: `@RalphAutocomplete`, `@MalphAutocomplete`) declares a `run-analysis` hook with a single local stage, `ralph.scientist`, which mounts the runtime skills in `shared/skills/analysis/`: `agent-eval`, `run-telemetry-analysis`, `skill-creator` and `mcp-builder`. The scientist dispatches subagents:

1. **subagent-mapper** (`ralph-docs` only) — extracts per-subagent spans, tool calls and errors from the run telemetry (`*-claude-run-telemetry.json`), or from the collected Copilot CLI debug log when there is none.
2. **run-analyzer** — analyzes one subagent's execution per dispatch (`analyzed` or `skipped`); its list of critical egress domains follows `hook.cli`.
3. **agent-improver** — proposes targeted changes to agent templates, skills, shared includes and MCP server configs based on one analysis (`improved` or `no-action`). It never edits the live tree: each changed file is written whole to `{{ artifactDir }}/agent-improver/<subagent>/proposals/<path relative to the orchestrator checkout>`. Apply the proposals with `cp -r <proposals>/. <orchestrator checkout>/`, review `git diff`, and open a PR.
4. **run-synthesizer** (`ralph-docs` only) — writes a cross-subagent synthesis.
