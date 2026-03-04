---
name: stage-pipeline
description: "Guide for understanding and modifying the sequential stage pipeline in Ralph Orchestrator — how variants define multi-stage agent pipelines, how executors are created per stage (container vs local mode), how the TaskRunner loops and aggregates results, and how template context carries stage metadata. Use this skill when working on stage configuration, adding execution modes, modifying the pipeline loop, changing executor creation, extending StageMode, updating deriveStageProfile(), or touching any file related to multi-stage execution. Also use when the user mentions stages, pipeline, local mode, container mode, StageMode, stage results, or executor factory."
---

# Stage Pipeline

The orchestrator runs agents through a sequential **stage pipeline**. Each variant in a profile declares a `stages` array — an ordered list of agent invocations that execute one after another inside a shared Docker environment. Stages can run inside the container (`mode: "container"`) or directly on the host (`mode: "local"`).

## Configuration

Stages are defined in `profiles/<id>/profile.json` inside each variant:

```json
{
  "variants": [{
    "stages": [
      { "agent": "ralph.researcher", "role": "researcher", "mode": "container" },
      { "agent": "ralph.reviewer", "role": "reviewer", "mode": "local", "model": "claude-sonnet-4-20250514" }
    ],
    "projects": ["DOC"],
    "statuses": ["Ready for Ralph"]
  }]
}
```

### Stage Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `agent` | string | required | CLI agent name (e.g. `ralph.ralph`) |
| `role` | string | required | Unique identifier within the variant (e.g. `primary`, `researcher`, `reviewer`) |
| `mode` | `"container"` \| `"local"` | `"container"` | Where the CLI runs — Docker container or host machine |
| `skills` | string[] | `[]` | Skill folders to mount for this stage |
| `model` | string | profile default | Override the LLM model for this stage |
| `timeoutMs` | number | profile default | Override timeout for this stage |

### Validation Rules

- `stages` must have **at least one entry** (`z.array(stageSchema).min(1)`)
- Roles must be **unique within a variant** (enforced by `.refine()` in `variantSchema`)
- The first stage's `agent` field determines the variant's `agentName`
- `displayName` strips the `ralph.` prefix from `agentName`

Schema: [src/config/schemas.ts](src/config/schemas.ts) — `stageSchema` and `variantSchema`
Types: [src/config/types.ts](src/config/types.ts) — `StageMode` enum, `IStageConfig`, `IAgentProfile.stages`

## Execution Flow

### TaskRunner Stage Loop

`TaskRunner.executeAgent()` in [src/services/task-runner.ts](src/services/task-runner.ts) iterates stages sequentially:

```
for each stage in ctx.profile.stages:
  1. deriveStageProfile(profile, stage) → stage-specific profile
  2. container.createExecutorForStage(stage) → executor (container or local)
  3. executor.execute(prompt) → result
  4. if error → abort pipeline immediately
  5. collect StageResult (role, status, durationMs, exitCode)
```

**Abort-on-fail**: The first stage that returns `TaskStatus.Error` stops the pipeline. No configurable failure strategy.

**Duration**: Always the sum of all stage durations, even if the pipeline aborts mid-way.

**Result attachment**: `stageResults` is only populated in `RalphResult` when there are multiple stages. Single-stage pipelines omit it for backward compatibility.

### Executor Creation

`ContainerManager.createExecutorForStage()` in [src/container/manager.ts](src/container/manager.ts) uses an **exhaustive switch** on `StageMode`:

```typescript
switch (stage.mode) {
  case StageMode.Container:
    return this.executorFactory.create(stageProfile, ...);
  case StageMode.Local:
    return this.executorFactory.createLocal(stageProfile, ...);
  default: {
    const _exhaustive: never = stage.mode;
    throw new Error(`Unknown stage mode: ${_exhaustive}`);
  }
}
```

Adding a new mode requires handling it in this switch — the `never` check ensures a compile error if a case is missing.

Factory: [src/container/cli-executors/cli-executor-factory.ts](src/container/cli-executors/cli-executor-factory.ts) — `create()` (container) and `createLocal()` (host)

### Container vs Local Mode

| Aspect | Container (`StageMode.Container`) | Local (`StageMode.Local`) |
|---|---|---|
| Executor | `CopilotExecutor` or `ClaudeCodeExecutor` | `LocalCopilotExecutor` |
| Runs in | Docker container via `docker compose exec` | Host machine via `execa()` |
| Working dir | `/workspace` (mounted repo) | Profile's `repoPath` on host |
| MCP config | `--additional-mcp-config` with sidecar URLs | None |
| CLI flags | `--config-dir`, `--share`, `--allow-all-tools` | `--allow-all-tools`, `--allow-all-paths` |
| Network | Isolated (`ralph-internal` via Squid proxy) | Full host network access |
| Use case | Primary agent work (git, code, PR) | Post-processing, review, lightweight tasks |

Local executor: [src/container/cli-executors/local-copilot-executor.ts](src/container/cli-executors/local-copilot-executor.ts)

### deriveStageProfile

`deriveStageProfile()` in [src/container/types.ts](src/container/types.ts) is a **pure function** that creates a stage-specific `IAgentProfile` by overriding 5 fields from the stage config while keeping all infrastructure fields (repo, auth, Docker, MCP) intact:

- `agentName` ← `stage.agent`
- `displayName` ← agent name without `ralph.` prefix
- `model` ← `stage.model` (if set)
- `timeoutMs` ← `stage.timeoutMs` (if set)
- `skills` ← `stage.skills`

## Template Context

Agent templates receive stage metadata through `TemplateContext` (defined in [src/container/setup/agent-includes.ts](src/container/setup/agent-includes.ts)):

| Field | Type | Description |
|---|---|---|
| `stageRole` | string | Current stage's role (e.g. `"researcher"`) |
| `stageMode` | string | `"container"` or `"local"` |
| `stageIndex` | number | 0-based position in the pipeline |
| `stageCount` | number | Total number of stages |
| `isFirstStage` | boolean | Whether this is the first stage |
| `isLastStage` | boolean | Whether this is the final stage |
| `previousStageRoles` | string[] | Roles of all preceding stages |
| `stageSkills` | string[] | Skills mounted for this stage |

Templates can use these for conditional logic:

```liquid
{% if isLastStage %}
  Finalize the PR and post results.
{% else %}
  Prepare findings for the next stage.
{% endif %}
```

**Current limitation**: Templates are rendered once before the stage loop starts. The `buildTemplateContext()` function accepts `stageOverrides` but they are not currently passed per-stage — all stages see first-stage template values.

## Key Types

```typescript
// src/config/types.ts
enum StageMode { Container = "container", Local = "local" }

interface IStageConfig {
  readonly agent: string;
  readonly role: string;
  readonly mode: StageMode;
  readonly skills: readonly string[];
  readonly model?: string;
  readonly timeoutMs?: number;
}

// src/container/types.ts
interface StageResult {
  readonly role: string;
  readonly status: TaskStatus;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly collectedLogs: CollectedLogEntry[];
}
```

## Common Modifications

### Adding a new StageMode

1. Add the value to `StageMode` enum in [src/config/types.ts](src/config/types.ts)
2. Add the case to the exhaustive switch in `ContainerManager.createExecutorForStage()` in [src/container/manager.ts](src/container/manager.ts)
3. Create the executor class (implement `ICliExecutor`)
4. Add a factory method to `CliExecutorFactory` in [src/container/cli-executors/cli-executor-factory.ts](src/container/cli-executors/cli-executor-factory.ts)
5. Update schema in [src/config/schemas.ts](src/config/schemas.ts) — add to `stageSchema.mode` enum
6. Add tests for the new mode in `tests/container/manager.test.ts` and `tests/services/task-runner.test.ts`

### Changing pipeline behavior

The abort-on-fail logic is in `TaskRunner.executeAgent()` in [src/services/task-runner.ts](src/services/task-runner.ts). To add configurable failure strategies:

1. Add a `failureStrategy` field to `IStageConfig` or variant config
2. Modify the error check in the stage loop (currently breaks on first `TaskStatus.Error`)
3. Update `StageResult` aggregation logic if needed

### Per-stage template rendering

`buildTemplateContext()` in [src/container/setup/agent-includes.ts](src/container/setup/agent-includes.ts) already supports a `stageOverrides` parameter. To enable per-stage rendering, pass stage-specific overrides from the stage loop in `TaskRunner.executeAgent()`.

## File Map

| File | Stage-related content |
|---|---|
| [src/config/types.ts](src/config/types.ts) | `StageMode`, `IStageConfig`, `IAgentProfile.stages` |
| [src/config/schemas.ts](src/config/schemas.ts) | `stageSchema`, `variantSchema.stages` validation |
| [src/container/types.ts](src/container/types.ts) | `StageResult`, `deriveStageProfile()` |
| [src/services/task-runner.ts](src/services/task-runner.ts) | `executeAgent()` stage loop, result aggregation |
| [src/container/manager.ts](src/container/manager.ts) | `createExecutorForStage()` exhaustive switch |
| [src/container/cli-executors/cli-executor-factory.ts](src/container/cli-executors/cli-executor-factory.ts) | `create()` / `createLocal()` factory methods |
| [src/container/cli-executors/local-copilot-executor.ts](src/container/cli-executors/local-copilot-executor.ts) | Host-side Copilot CLI executor |
| [src/container/setup/agent-includes.ts](src/container/setup/agent-includes.ts) | `TemplateContext` stage fields, `buildTemplateContext()` |
| [tests/services/task-runner.test.ts](tests/services/task-runner.test.ts) | Stage loop tests |
| [tests/container/manager.test.ts](tests/container/manager.test.ts) | Executor creation tests |
