# Phase 2: Container Lifecycle — `isRunning` Guard

**Goal:** Make `ContainerManager.stop()` idempotent so the orchestrator's `finally` block can safely call teardown even when the task runner already stopped the container at the mode boundary.

## Problem

Currently `stop()` always runs `docker compose down --volumes --remove-orphans`. Calling it twice produces noisy errors (compose tries to stop already-removed containers). With Phase 3 moving teardown into `run()` (before hooks), the orchestrator's `finally` block must be a safe no-op when the container is already down.

## Changes

### `src/container/manager.ts` — `IContainerManager`

Add `readonly isRunning: boolean` to the interface:

```typescript
export interface IContainerManager {
  // ... existing members ...
  /** Whether the container stack is currently up. */
  readonly isRunning: boolean;
}
```

### `src/container/manager.ts` — `ContainerManager`

Add a private `_running` flag:

```typescript
private _running = false;

get isRunning(): boolean {
  return this._running;
}
```

Set it in `start()` and `stop()`:

- `start()`: set `this._running = true` after successful `compose up`
- `stop()`: early return if `!this._running`. Set `this._running = false` at the start (before compose down), so even if teardown fails the flag prevents retry loops.

### `src/services/task-runner.ts` — `teardown()`

Guard the `container.stop()` call:

```typescript
if (container?.isRunning) {
  await container.stop();
  return;
}
```

## Files

- `src/container/manager.ts` — `IContainerManager` interface + `ContainerManager` class
- `src/services/task-runner.ts` — `teardown()` method
- `tests/helpers/mocks.ts` — add `isRunning: true` to mock container
- `tests/container/manager.test.ts` — idempotent stop tests

## Verification

1. Existing `ContainerManager` tests pass (start/stop lifecycle unchanged for single calls).
2. New test: calling `stop()` twice does not throw and only calls `compose down` once.
3. New test: `isRunning` is `false` before `start()`, `true` after `start()`, `false` after `stop()`.
4. Mock container `isRunning` defaults to `true` (tests that create a container expect it to be running).
