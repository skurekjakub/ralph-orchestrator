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
- **Shared workspace** — all container stages share `/workspace`; local stages run in the orchestrator repo

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

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `agent` | `string` | Yes | — | CLI agent name (e.g. `ralph.ralph`). Must match a `.agent.md` file in `profiles/<id>/agents/`. |
| `role` | `string` | Yes | — | Unique identifier within the pipeline (e.g. `primary`, `reviewer`). Must be unique across stages in the same variant. |
| `mode` | `"container"` \| `"local"` | No | `"container"` | Where the agent runs. `container` = inside Docker; `local` = on the host. |
| `skills` | `string[]` | No | `[]` | Skill folder names for this stage. Overrides profile-level `skills`. |
| `model` | `string` | No | variant/profile default | LLM model override for this stage. |
| `timeoutMs` | `number` | No | profile-level `timeoutMs` | Execution timeout in milliseconds. |

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

The agent CLI runs directly on the host machine in the **orchestrator repo directory** (`process.cwd()`). This is intended for self-improvement workflows where the agent modifies orchestrator files — agent templates, skills, profile configs.

```
copilot --agent ralph.analyst -p <prompt>
```

The target repository path (where containerized stages work) is available in templates via `{{ targetRepoPath }}`. This lets local agents reference the target repo without running inside it.

**Local mode considerations:**

- The agent runs with the host user's permissions and environment
- No Docker isolation, no Squid proxy, no MCP sidecar
- The agent can read/write orchestrator files directly
- Only `copilot` CLI is currently supported for local mode (via `LocalCopilotExecutor`)

## Agent Templates

Each stage references an agent by name (e.g. `ralph.ralph-researcher`). The corresponding template file must exist at `profiles/<id>/agents/<agentName>.agent.md`.

### Per-stage rendering

Templates are re-rendered before each stage with stage-specific context. This ensures each agent sees correct metadata for its position in the pipeline. The rendered files in `.build/` are updated in-place — container stages see the changes immediately via bind mounts.

### Stage context variables

These template variables change per-stage:

| Variable | Type | Description |
|---|---|---|
| `stageRole` | `string` | Current stage's role (e.g. `researcher`, `writer`). |
| `stageMode` | `string` | `"container"` or `"local"`. |
| `stageIndex` | `number` | 0-based index of the current stage. |
| `stageCount` | `number` | Total number of stages in the pipeline. |
| `isFirstStage` | `boolean` | Whether this is the first stage (`stageIndex === 0`). |
| `isLastStage` | `boolean` | Whether this is the last stage. |
| `previousStageRoles` | `string[]` | Roles of all completed stages (empty on first). |
| `skills` | `string[]` | Skill folder names for this specific stage. |

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
You are running on the host machine in the orchestrator repository.
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
  role: string;        // e.g. "researcher"
  status: TaskStatus;  // Completed | Partial | Error
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

| Pattern | Stage 1 writes | Stage 2 reads |
|---|---|---|
| Research notes | `/workspace/research/findings.md` | Agent template references the file path |
| Task decomposition | `/workspace/tasks.jsonl` | Agent template loads structured tasks |
| Quality metrics | `/workspace/eval/metrics.json` | Reviewer agent reads evaluation data |

For cross-container/host handoff (container → local stages), bind-mounted directories provide the bridge. The target repo at `{{ targetRepoPath }}` on the host corresponds to `/workspace` inside the container.

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

All agent templates are rendered per-stage — even templates for inactive stages are re-rendered (the CLI only loads the active agent's file). This ensures all shared partials get fresh stage context.

### Skill deployment

Each stage can declare its own `skills` array. Skills are re-rendered per-stage with the stage's context. The skill renderer cleans `.build/` and reconstructs it, so only the current stage's skills are available.

If a stage declares no skills (`"skills": []`), the profile-level `skills` are **not** inherited — the stage gets an empty skill set. This is intentional: per-stage skills are explicit overrides, not merges.

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
