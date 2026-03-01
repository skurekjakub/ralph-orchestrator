## Plan: ContainerManager SRP Refactoring

Extract leaked implementation types, move log source registration to a dedicated registry, extract continuation loop into its own class, and deduplicate CLI executor error-handling via inheritance. Three incremental phases — each self-contained.

**Phases 3**

1. **Phase 1: Encapsulate log types behind LogSourceRegistry**
    - **Objective:** Remove `LogSourceDef`/`CollectedLog` imports from `manager.ts`. Move the 50+ line `registerLogSources()` body into a new `LogSourceRegistry` class. Simplify `IContainerLogs` to remove `addSource()` — all registration goes through the registry.
    - **Files/Functions to Modify/Create:**
        - Create `src/container/log-source-registry.ts` — `LogSourceRegistry` with `registerAll(logs, profile, callbacks)` that encapsulates all `addSource` calls
        - Modify `src/container/manager.ts` — delegate `registerLogSources()` to registry, remove `LogSourceDef`/`CaptureMode` imports, remove `addSource` from `IContainerLogs`
        - Modify `tests/helpers/mocks.ts` — update `createMockContainer` to match new `IContainerLogs` shape
    - **Tests to Write:**
        - `tests/container/log-source-registry.test.ts`: verify all standard sources registered, verify callback wiring
    - **Steps:**
        1. Write test for `LogSourceRegistry.registerAll()` — assert it calls `addSource` with correct source defs
        2. Run test — expect failure (class doesn't exist)
        3. Create `LogSourceRegistry` class
        4. Run test — expect pass
        5. Update `ContainerManager.registerLogSources()` to delegate to registry
        6. Remove `addSource` from `IContainerLogs` interface, keep it internal to `ContainerLogCollector`
        7. Remove `LogSourceDef`/`CaptureMode` imports from `manager.ts`
        8. Update test mocks
        9. Run full suite

2. **Phase 2: Extract continuation loop into ContinuationRunner**
    - **Objective:** Move the continuation retry loop, backoff logic, stdout aggregation, and logging out of `ContainerManager.execute()` into a dedicated `ContinuationRunner` class with DI and testability.
    - **Files/Functions to Modify/Create:**
        - Create `src/container/continuation-runner.ts` — `ContinuationRunner` class with `run(executor, prompt, issue, maxContinuations)` method, owns `sleep()` and `continuationBackoff()` statics, logging
        - Modify `src/container/manager.ts` — `execute()` delegates to `ContinuationRunner`, remove `sleep()`/`continuationBackoff()` statics
        - Move tests from `tests/container/continuation-loop.test.ts` to target `ContinuationRunner`
    - **Tests to Write:**
        - Adapt existing 14 continuation tests to target `ContinuationRunner.run()`
        - Keep backoff unit tests
    - **Steps:**
        1. Create `ContinuationRunner` class with the loop logic extracted from `execute()`
        2. Update `ContainerManager` constructor to create/accept a `ContinuationRunner`
        3. Delegate `execute()` continuation logic to `ContinuationRunner.run()`
        4. Move `sleep()` and `continuationBackoff()` to `ContinuationRunner`
        5. Update continuation-loop tests to use `ContinuationRunner` directly
        6. Remove stale statics from `ContainerManager`
        7. Run full suite

3. **Phase 3: DRY executors with BaseCliExecutor**
    - **Objective:** Extract shared execution/error-handling/process-tracking code into an abstract `BaseCliExecutor` base class. Subclasses only define how to build CLI args.
    - **Files/Functions to Modify/Create:**
        - Create `src/container/cli-executors/base-executor.ts` — abstract `BaseCliExecutor` with `exec()`, `killActive()`, `run()`, `continueSession()`. Subclasses implement `buildRunArgs(prompt)` and `buildContinueArgs(prompt)`
        - Modify `src/container/cli-executors/copilot-executor.ts` — extends `BaseCliExecutor`
        - Modify `src/container/cli-executors/claude-code-executor.ts` — extends `BaseCliExecutor`
    - **Tests to Write:**
        - No new tests needed — existing behavioral tests cover both executors
    - **Steps:**
        1. Create `BaseCliExecutor` with shared `exec()`, `killActive()`, `run()`, `continueSession()`
        2. Refactor `CopilotExecutor` to extend `BaseCliExecutor`, implement `buildRunArgs`/`buildContinueArgs`
        3. Run copilot executor tests — expect pass
        4. Refactor `ClaudeCodeExecutor` the same way
        5. Run claude executor tests — expect pass
        6. Run full suite

**Open Questions — Resolved**
1. Registry-only — no ad-hoc `addSource` on `IContainerLogs`
2. ContinuationRunner as injectable class (DI + testable)
3. Inheritance for executors (BaseCliExecutor)
