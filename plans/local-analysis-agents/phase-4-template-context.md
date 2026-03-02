# Phase 4: TaskContext + Template Context Enrichment

**Goal:** Give hook stages the task log directory path, collected container log file map, and hook-specific output directory so they can locate and analyze execution artifacts and write their own output.

*Depends on: Phase 3 (hooks run after full log collection).*

## Changes

### `src/services/task-context.ts` — `TaskContext`

Add `outputDir`:

```typescript
export interface TaskContext {
  // ... existing fields ...
  /** Absolute path to this task's log directory (`output/logs/<taskId>/`). */
  readonly outputDir: string;
}
```

### `src/services/task-context.ts` — `buildTaskContext()`

Add `logsDir: string` parameter. Compute `outputDir: join(logsDir, taskId)`.

### `src/orchestrator.ts` — caller

Pass `this.outputConfig.logsDir` (or equivalent) to `buildTaskContext()`.

### `src/container/setup/agent-includes.ts` — `buildTemplateContext()`

Add to template context:

```typescript
outputDir: ctx.outputDir,
collectedLogs: stageOverrides?.collectedLogs ?? {},
hookName: stageOverrides?.hookName ?? "",
hookOutputDir: stageOverrides?.hookOutputDir ?? "",
```

### `src/container/setup/agent-includes.ts` — `TemplateContext`

Add:

```typescript
/** Absolute path to the task's log directory. */
outputDir: string;
/** Map of collected log file IDs to paths from the main pipeline (e.g. `primary-transcript` → path). */
collectedLogs: Record<string, string>;
/** Name of the current hook (empty string for main pipeline stages). */
hookName: string;
/** Hook-specific output directory (`outputDir/hooks/<name>/`). Empty for main pipeline stages. */
hookOutputDir: string;
```

### `src/container/setup/agent-includes.ts` — `StageOverrides`

Extend the overrides type:

```typescript
interface StageOverrides {
  // ... existing ...
  collectedLogs?: Record<string, string>;
  hookName?: string;
  hookOutputDir?: string;
}
```

### `src/services/task-runner.ts` — hook stage rendering (Phase 3)

In `executePostTaskHooks()`, pass hook-specific overrides:

```typescript
const stageContext = buildTemplateContext(ctx, {
  stageIndex: stageIdx,
  stageCount: hook.stages.length,
  stageRole: stage.role,
  stageMode: stage.mode,
  previousStageRoles: completedRoles,
  collectedLogs: result.collectedLogs,
  hookName: hook.name,
  hookOutputDir,
});
```

### Liquid template access

Hook agent templates can reference:
- `{{ outputDir }}` — main log directory
- `{{ hookOutputDir }}` — hook-specific output directory for writing analysis/improvement files
- `{{ hookName }}` — the hook's name
- `{{ collectedLogs.primary-transcript }}` — path to a specific collected log
- `{{ collectedLogs.primary-audit }}`, etc.

Main pipeline templates see `collectedLogs: {}`, `hookName: ""`, `hookOutputDir: ""` — unchanged behavior.

## Files

- `src/services/task-context.ts` — `TaskContext` + `buildTaskContext()`
- `src/orchestrator.ts` — `buildTaskContext()` call
- `src/container/setup/agent-includes.ts` — `buildTemplateContext()` + `TemplateContext` + `StageOverrides`
- `tests/services/task-context.test.ts` — `buildTaskContext()` produces `outputDir`
- `tests/container/template-context-lint.test.ts` — add `outputDir`, `collectedLogs`, `hookName`, `hookOutputDir` to `KNOWN_KEYS`

## Verification

1. Template context lint test passes with new keys.
2. Unit test: `buildTaskContext()` with `logsDir="/out/logs"`, `taskId="DOC-100-123"` → `outputDir="/out/logs/DOC-100-123"`.
3. Unit test: hook stage template context includes `collectedLogs` from main pipeline, `hookName`, `hookOutputDir`.
4. Unit test: main pipeline stage template context has `collectedLogs: {}`, `hookName: ""`, `hookOutputDir: ""`.
