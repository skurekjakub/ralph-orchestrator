# Parallelism — Concurrent Task Execution

## What This Is

Enable the orchestrator to process multiple operations concurrently, controlled by a global configuration setting. Currently hardcoded to one-at-a-time sequential execution.

## Current State

The orchestrator's main loop is strictly sequential. It awaits a `workSignal`, picks one pending operation from the ledger, transitions it to `active`, runs the full container lifecycle (setup → exec → collect → teardown), and only then checks for the next operation.

```
loop:
  await workSignal
  pick ONE pending operation
  executeOperation(...)  // blocks until done
  continue
```

This means if five JIRA issues are queued, they process serially. Each operation takes 5-30+ minutes (container build + agent runtime + teardown), so queue latency accumulates fast.

## Expected Behavior

A `maxConcurrency` setting in `config.json` (default: `1`, preserving current behavior):

```json
{
  "maxConcurrency": 3
}
```

When set to N > 1, the orchestrator picks up to N pending operations and runs them concurrently. Each operation gets its own container lifecycle. The loop only blocks when all N slots are occupied.

## Core Challenges

### Container Isolation

Each concurrent operation needs its own container instance. Currently, a profile's Docker Compose project uses a fixed project label (`composeProjectLabel`). Two operations using the same profile would clash on the same compose project.

**Resolution**: Append a unique suffix to the compose project label per operation (e.g., `ralph-sandbox-op-abc123`). This gives each operation its own container namespace. The `ComposeClient` already accepts projects via constructor — the suffix would be injected at task-runner level.

### Resource Contention

Multiple containers running simultaneously compete for:
- **CPU/Memory**: The security overlay sets resource limits per container (4 CPU, 8G RAM). N containers = N × resources. The host machine must be sized accordingly.
- **Docker network**: Each compose project creates its own network. Docker has limits on bridge networks (~30 by default).
- **Squid proxy**: Currently one proxy sidecar per profile. With parallel execution, either each operation gets its own proxy or operations from the same profile share one (but then proxy logs can't be attributed to a specific operation).
- **JIRA API rate limits**: Multiple operations polling/transitioning simultaneously could hit rate limits.

### Ledger Concurrency

The operation ledger uses file-based JSON storage. Concurrent reads/writes from multiple async operations could corrupt state. The ledger needs either:
- In-memory operation with periodic flush (simpler, risk of loss on crash)
- File-level locking via `proper-lockfile` or similar
- Transition to SQLite for atomic operations

### Log Collection

Each operation needs its own log directory (already the case — `output/logs/<key>-<startTs>/`). But the shared `activity-YYYY-MM-DD.log` needs synchronized writes. The logger already serializes writes, but concurrent orchestrator loops would need coordination.

### State Emission

The `OrchestratorObserver` currently tracks one `activeTask`. With parallelism, it needs to track N active tasks. The dashboard state schema (`OrchestratorState`) would need a `activeTasks: ActiveTask[]` field instead of a single `activeTask`.

## What Changes in the Codebase

1. **`config.json` schema + `AppConfig`**: Add `maxConcurrency: number` with Zod default of 1
2. **`orchestrator.ts`**: Replace single `executeOperation()` with a pool that runs up to N concurrent operations. Use a semaphore pattern or async queue.
3. **`ComposeClient`**: Accept per-operation project suffix
4. **`ContainerManager`**: Parameterize to support multiple simultaneous containers
5. **`operation-ledger.ts`**: Add concurrency-safe file I/O or migrate storage
6. **`orchestrator-observer.ts`**: Support multiple active tasks in state snapshot
7. **`OrchestratorState`**: Array of active tasks instead of single
8. **Dashboard components**: Render multiple active task panels
9. **Heartbeat payload**: Include all active tasks

## Incremental Approach

Phase 1: Allow N=2 with the constraint that concurrent operations must be from **different profiles** (avoids compose project collision, proxy sharing issues).

Phase 2: Allow same-profile concurrent operations with suffixed project labels and per-operation proxy instances.

Phase 3: Shared proxy with per-operation log attribution.

## Open Questions

- Should there be per-profile concurrency limits in addition to the global one? (e.g., only one ralph-docs operation at a time, but ralph-docs and ralph-vscode can overlap)
- How should the queue prioritize operations when slots open up? FIFO? Priority by issue type?
- Should the orchestrator auto-detect available host resources and cap concurrency accordingly?
- Does the operation ledger need to transition to a real database, or is file-based sufficient with locking?
