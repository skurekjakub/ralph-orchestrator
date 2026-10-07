# Multistage Pipelines

Sequential agent pipelines that run multiple CLI agents over a single container lifecycle.

## Overview

A multistage pipeline defines an ordered list of agents within a single variant. Each agent (stage) runs to completion before the next starts. All stages share the same Docker container, workspace, and MCP configuration — enabling stage-to-stage artifact handoff through the shared filesystem.

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
│   artifacts/       workspace/       orchestrator/            │
│   research.md      PR created       skills updated           │
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
          "skills": ["web-research"],
          "timeoutMs": 1800000
        },
        {
          "agent": "ralph.ralph",
          "role": "writer",
          "mode": "container",
          "skills": ["kentico-docs", "code-samples"],
          "timeoutMs": 3600000
        },
        {
          "agent": "ralph.ralph-reviewer",
          "role": "reviewer",
          "mode": "local",
          "skills": ["agent-eval"],
          "model": "claude-sonnet-4-20250514",
          "timeoutMs": 600000
        }
      ]
    }
  ]
}
```

### Stage fields

| Field       | Type                       | Required | Default                   | Description                                                                                                           |
| ----------- | -------------------------- | -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `agent`     | `string`                   | Yes      | —                         | CLI agent name (e.g. `ralph.ralph`). Must match a `.agent.md` file in `profiles/<id>/agents/`.                        |
| `role`      | `string`                   | Yes      | —                         | Unique identifier within the pipeline (e.g. `primary`, `reviewer`). Must be unique across stages in the same variant. |
| `mode`      | `"container"` \| `"local"` | No       | `"container"`             | Where the agent runs. `container` = inside Docker; `local` = on the host.                                             |
| `skills`    | `string[]`                 | No       | `[]`                      | Skill folder names for this stage. Overrides profile-level `skills`.                                                  |
| `model`     | `string`                   | No       | variant/profile default   | LLM model override for this stage.                                                                                    |
| `timeoutMs` | `number`                   | No       | profile-level `timeoutMs` | Execution timeout in milliseconds.                                                                                    |

### Validation rules

- `stages` must contain at least one element
- Each `role` must be unique within the variant (enforced by Zod schema)
- The first stage's `agent` determines the variant's `agentName` and `displayName`

### Single-stage backward compatibility

A single-element `stages` array is functionally equivalent to the legacy single-agent config. The pipeline loop runs once and all stage context variables default to first-stage values.

## Execution Modes

### Container mode (`"container"`)

The default. The agent CLI runs inside the Docker container via `docker compose exec`. The agent has access to the target repository at `/workspace`, MCP tools via the sidecar, and the Squid proxy for network access.

```
docker compose exec --user vscode app copilot --agent ralph.ralph -p <prompt>
```

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
node_modules/.bin/claude -p --output-format stream-json --verbose --agent <name> --setting-sources user \
  --settings <stageDir>/claude-settings.json --strict-mcp-config --permission-mode dontAsk \
  --tools Read,Write,Edit,Bash,Skill,TaskCreate,TaskGet,TaskList,TaskUpdate[,Agent] \
  --add-dir <outputDir> --add-dir <repo>/profiles --add-dir <repo>/shared --session-id <uuid> --debug-file <stageDir>/logs/claude.log
```

The host path of the task's workspace, its clone of the target repository where containerized stages work, is available in templates via `{{ targetRepoPath }}`; a variant's local stage may read it, and its `artifactDir` is the container stages' `.ralph/tasks/<key>/artifacts` in that workspace. The workspace is deleted after a successful task, once the post-task hooks have run.

**Local mode considerations:**

- No Docker isolation, no Squid proxy, no MCP sidecar. The CLI runs with the host user's permissions, so it is fenced in otherwise:
- Its environment holds only `PATH`, `HOME`, `LANG` and its own credential (`extendEnv: false`); no other orchestrator secret (`ADO_PAT`, `JIRA_*`, another CLI's token) reaches it.
- Its private home keeps the developer's own CLI settings, hooks, plugins, agents, skills, memory, login and MCP servers out.
- Claude Code loads no `CLAUDE.md` (`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`; the output directory sits inside the orchestrator checkout), runs no MCP server and has no web tools. It runs in `dontAsk` mode under generated allow rules (`src/cli/claude/claude-host-settings.ts`): read the working directory, the task's output directory and the orchestrator's `profiles/` and `shared/`; write only in its working and artifact directories; run only `jq`, `grep`, `ls`, `wc`, `cat`, `head`, `tail` and `date` with Bash; load skills; spawn the stage's subagents. Reading the orchestrator's `.env` is denied. Ralph's audit hooks run from `shared/hooks/` and write to `<stageDir>/logs/`.
- Copilot CLI keeps `--allow-all-tools --allow-all-paths`.
- No local stage edits `profiles/` or `shared/`: improvers write proposals into their artifact directory instead.

## Agent Templates

Each stage references an agent by name (e.g. `ralph.ralph-researcher`). The corresponding template file must exist at `profiles/<id>/agents/<agentName>.agent.md`.

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

The `TaskRunner.executeAgent()` method drives the pipeline:

```
1. Fetch comments + handoff context (once per task)
2. For each stage:
   a. Re-render agent & skill templates with stage-specific context
   b. Create per-stage executor (container or local)
   c. Build prompt from work item + issue context
   d. Run CLI session (with continuation retries)
   e. Parse result block from stdout
   f. Record StageResult
   g. If error → abort pipeline
3. Aggregate: last stage's result is final, duration = sum of all stages
```

### Stage result aggregation

Each stage produces a `StageResult`:

```typescript
interface StageResult {
  role: string; // e.g. "researcher"
  status: TaskStatus; // Completed | Partial | Error
  durationMs: number;
  exitCode: number;
  collectedLogs: Record<string, string>;
}
```

For multi-stage pipelines, the final `RalphResult` includes `stageResults: StageResult[]` alongside the authoritative last-stage output. Single-stage pipelines omit `stageResults` for backward compatibility.

### Abort behavior

The pipeline aborts immediately on the first `TaskStatus.Error`. All prior completed stages remain in `stageResults`. The error stage's result becomes the final result (with duration summed from all executed stages).

## Artifact Handoff

Stages share the container workspace at `/workspace`. Stage 1 can write files that stage 2 reads — no special configuration needed.

**Common patterns:**

| Pattern            | Stage 1 writes                    | Stage 2 reads                           |
| ------------------ | --------------------------------- | --------------------------------------- |
| Research notes     | `/workspace/research/findings.md` | Agent template references the file path |
| Task decomposition | `/workspace/tasks.jsonl`          | Agent template loads structured tasks   |
| Quality metrics    | `/workspace/eval/metrics.json`    | Reviewer agent reads evaluation data    |

For cross-container/host handoff (container → local stages), bind-mounted directories provide the bridge. The task's workspace at `{{ targetRepoPath }}` on the host corresponds to `/workspace` inside the container.

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

### Log collection is task-scoped

Log sources (audit trail, transcript, proxy log, sidecar log) are registered once per task, not per stage. In a multi-stage pipeline, all stages write to the same log files. The collected output is a concatenation with no stage boundary markers. Use `stageResults` metadata to correlate timing.

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
  { "agent": "ralph.ralph", "role": "writer", "mode": "container", "skills": ["kentico-docs"] },
  { "agent": "ralph.ralph-reviewer", "role": "reviewer", "mode": "local", "skills": ["agent-eval"] }
]
```

### Researcher + Writer

A research stage gathers context before the writer starts:

```json
"stages": [
  { "agent": "ralph.ralph-researcher", "role": "researcher", "mode": "container", "skills": ["web-research"], "timeoutMs": 1800000 },
  { "agent": "ralph.ralph", "role": "writer", "mode": "container", "skills": ["kentico-docs"], "timeoutMs": 3600000 }
]
```

### Analyzer + Gap Filler (self-improvement)

A local analyzer reviews the agent's run telemetry, then a gap filler creates or updates skills:

```json
"stages": [
  { "agent": "ralph.ralph", "role": "primary", "mode": "container", "skills": ["kentico-docs"] },
  { "agent": "ralph.ralph-analyst", "role": "analyzer", "mode": "local", "skills": ["agent-eval"] },
  { "agent": "ralph.ralph-gap-filler", "role": "gap-filler", "mode": "local", "skills": ["skill-creator"] }
]
```

## Post-Task Hooks

Post-task hooks are local-only agent pipelines that run **after** the main pipeline completes and the container is torn down. They are intended for analysis, self-improvement, and observability workflows that operate on the collected log artifacts.

### Key behaviors

- **Local-only** — all hook stages must be `mode: "local"`. Container mode is rejected by schema validation.
- **Failure-isolated** — hook failures are logged as warnings. They never affect the task result, JIRA transitions, or operation ledger status.
- **Sequential within, independent across** — stages within a hook run sequentially. If a stage returns any non-Completed status, remaining stages in that hook are skipped. The next hook still runs.
- **After teardown** — hooks run after container teardown and log collection, so they have access to all collected log artifacts.

### Configuration

Add `postTaskHooks` to a variant alongside `stages`:

```json
{
  "stages": [{ "agent": "ralph.ralph", "role": "primary", "mode": "container" }],
  "postTaskHooks": [
    {
      "name": "run-analysis",
      "stages": [
        { "agent": "ralph.run-analyzer", "role": "analyzer", "mode": "local", "model": "claude-sonnet-4-20250514" },
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
