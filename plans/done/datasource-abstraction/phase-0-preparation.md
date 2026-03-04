# Phase 0: Preparation

> **Effort:** Small (1-2 days)
> **Prerequisite for:** Phase 1

## Goal

Prepare the codebase for the type migration by renaming JIRA-specific variable names to neutral ones in files that are generic consumers (Tier 3 — files that use `JiraIssue` as a data carrier, not for domain logic). This reduces noise in subsequent phases.

## Tasks

### 0.1 Rename variables in generic consumers

In Tier 3 files (listed below), rename variables and parameters from JIRA-specific names to neutral ones. **No type changes yet** — only variable/parameter names.

| Variable | Rename to |
|----------|-----------|
| `issue` (when used as a task data carrier) | `workItem` |
| `issueKey` (when used as a generic task ID) | `itemId` |

**Files to touch:**

| File | What to rename |
|------|---------------|
| `src/orchestrator.ts` | `issue` params → `workItem` in `executeOperation()`, `runTask()` etc. |
| `src/orchestrator-types.ts` | `ActiveTask.issue` → `ActiveTask.workItem` |
| `src/services/task-context.ts` | `TaskContext.issue` → `TaskContext.workItem`, `buildTaskContext()` params |
| `src/services/task-runner.ts` | Local `issue` references |
| `src/container/manager.ts` | `execute(issue: ...)` → `execute(workItem: ...)` |
| `src/container/continuation-runner.ts` | `issue` params |
| `src/container/setup/agent-includes.ts` | `buildTemplateContext()` field extraction |
| `src/container/setup/jit-mcp-params.ts` | `issue` params in macro resolvers |
| `src/prompt/prompt.ts` | `issue` params → `workItem` |
| `src/prompt/prompt-builder.ts` | `issue` params |

**Do not rename** variables in:
- `src/jira/` — these stay JIRA-specific
- `src/services/jira-issue-manager.ts` — will be rewritten in Phase 3
- `src/services/task-resource-manager.ts` — will be rewritten in Phase 3
- `src/services/trigger-scanner.ts` — will be rewritten in Phase 3

### 0.2 Create the `src/datasource/` directory

```
src/datasource/
src/datasource/connectors/
src/datasource/connectors/jira/
```

Empty directories — Phase 1 populates them.

## Validation

- `npm run lint` passes (no type errors from renames)
- `npm test` passes (all existing tests still work)
- No logic changes — only cosmetic renames
