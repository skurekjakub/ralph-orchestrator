# Phase 3: Hook Executor in TaskRunner

**Goal:** Add `executePostTaskHooks()` to TaskRunner, called after the main pipeline result is written, container is torn down, and JIRA transitions are complete.

*Depends on: Phase 1 (schema) + Phase 2 (`isRunning` guard).*

## Current Flow

```
TaskRunner.run()
  → prepareContainer()
  → executeAgent() — iterates stages[], collects logs per stage
  → resultWriter.collectResults() — final log collection, transcript attach, summary
── orchestrator finally ──
  → teardown() → container.stop()
```

## New Flow

```
TaskRunner.run()
  → prepareContainer()
  → executeAgent() — iterates stages[] (container only, no change)
  → resultWriter.collectResults() — final log collection, transcript attach, summary
  → teardown() — container.stop() (MOVED from orchestrator finally into run())
  → executePostTaskHooks() — iterates variant.postTaskHooks (local only, new)
── orchestrator finally ──
  → teardown() — isRunning check → no-op (already stopped, Phase 2)
```

The key insight: **nothing changes about the main stage loop**. `executeAgent()` stays exactly as-is. Hooks are a completely separate method that runs after the full container lifecycle is done.

## Changes

### `src/services/task-runner.ts` — `executePostTaskHooks()`

New private method:

```typescript
private async executePostTaskHooks(
  ctx: TaskContext,
  result: RalphResult,
  variant: IVariant,
): Promise<void> {
  if (!variant.postTaskHooks?.length) return;

  for (const hook of variant.postTaskHooks) {
    const hookOutputDir = join(ctx.outputDir, "hooks", hook.name);
    await mkdir(hookOutputDir, { recursive: true });

    this.logger.info(`[${hook.name}] Starting hook (${hook.stages.length} stages)`);

    for (const [stageIdx, stage] of hook.stages.entries()) {
      const stageContext = buildTemplateContext(ctx, {
        stageIndex: stageIdx,
        stageCount: hook.stages.length,
        stageRole: stage.role,
        stageMode: stage.mode,
        previousStageRoles: /* roles from earlier stages in this hook */,
        collectedLogs: result.collectedLogs,
        hookName: hook.name,
        hookOutputDir,
      });

      // Render templates, create local executor, execute
      const executor = createLocalExecutor(stage, stageContext);
      const stageResult = await executor.execute();

      if (!stageResult.success) {
        this.logger.warn(`[${hook.name}] Stage "${stage.role}" failed — skipping remaining stages`);
        break; // abort-on-fail within hook
      }
    }

    this.logger.info(`[${hook.name}] Hook completed`);
    // Continue to next hook regardless of this hook's outcome
  }
}
```

### `src/services/task-runner.ts` — `run()`

Add hook execution after results and teardown:

```typescript
async run(ctx: TaskContext, container: IContainerManager): Promise<RalphResult> {
  // ... existing: prepareContainer, executeAgent, collectResults ...

  // Teardown before hooks (container done, logs collected)
  await this.teardown(ctx.profile, container);

  // Run post-task hooks (local only, after full container lifecycle)
  await this.executePostTaskHooks(ctx, result, variant);

  return result;
}
```

### `src/orchestrator.ts` — `teardownContainer()`

The existing `finally` block still calls `teardownContainer()` as a safety net. Phase 2's `isRunning` guard makes this a no-op when `run()` already tore down. No changes needed here — the guard handles it.

### Error handling

- Hook failure: logged as warning, does NOT change `result.status` or affect JIRA transitions
- If `run()` throws before reaching hooks: hooks don't run (expected — main pipeline failed)
- If a hook throws unexpectedly: caught at the `executePostTaskHooks()` level, logged, continue to next hook

## Files

- `src/services/task-runner.ts` — `executePostTaskHooks()`, `run()` updated
- `tests/services/task-runner.test.ts` — hook execution tests

## Verification

1. **No hooks configured:** `postTaskHooks` is undefined/empty → `executePostTaskHooks()` returns immediately. No change to existing behavior.
2. **Single hook, two stages:** analyzer runs, improver runs. Both called with correct `hookOutputDir`.
3. **Hook stage failure:** analyzer fails → improver skipped. Warning logged.
4. **Multiple hooks:** hook A fails internally → hook B still runs.
5. **Main pipeline failure:** `run()` throws before reaching hooks → hooks don't run.
6. **Container already stopped:** orchestrator `finally` calls `teardown()` → `isRunning` is false → no-op.
7. **Hook output directory:** `outputDir/hooks/run-analysis/` created before hook stages run.
