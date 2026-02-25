# Refactoring Analysis: ComposeClient & TaskRunner

## 1. ComposeClient — `src/container/compose-client.ts`

### Metrics

| Metric | Value |
|---|---|
| Total lines | 130 |
| Constructor deps | 2 (`composeFilePaths`, `envConfig: ComposeEnvConfig`) |
| Public methods | 6 |
| Private fields | 2 (`env`, `fileArgs`) |

### Identified Responsibilities

#### R1: Compose Command Spawning (core)

**Methods:** `compose()`, `exec()`, `execWithTimeout()`, `logs()`  
**Fields:** `env`, `fileArgs`

All four methods follow the same pattern: `execa("docker", ["compose", ...this.fileArgs, ...specificArgs], { env: this.env })`. Highly cohesive — this is the class's reason to exist.

#### R2: Docker Daemon Health Check

**Method:** `checkDocker()`

Runs `docker info` — not a compose command. Operates at the Docker-engine level, not the compose-project level. Currently used only during startup validation.

#### R3: Container Discovery

**Method:** `getContainerName()`

Runs `docker ps --filter` — a Docker CLI query, not a compose operation. Decoupled from the compose file args and env vars that define R1.

### Coupling Between Responsibilities

- **R1 ↔ R2:** Zero coupling. `checkDocker()` doesn't use `env` or `fileArgs`.
- **R1 ↔ R3:** Zero coupling. `getContainerName()` doesn't use `env` or `fileArgs`.
- **R2 ↔ R3:** Zero coupling.

### Refactoring Assessment

| Suggestion | Effort | Impact | Verdict |
|---|---|---|---|
| Extract `checkDocker()` to a standalone utility or validation service | Low | Low | **Skip.** 6 lines, used once. Not worth the indirection. |
| Extract `getContainerName()` to a Docker query utility | Low | Low | **Skip.** Single call site. Would add a file for one function. |
| Unify `exec()` and `execWithTimeout()` into one method with optional timeout | Trivial | Low | **Consider.** Reduces surface area; `execWithTimeout` just adds `timeout` to the options. |

**Overall verdict: ComposeClient is well-factored.** 130 lines, single responsibility, two irrelevant-but-tiny outliers. No meaningful extraction targets.

---

## 2. TaskRunner — `src/services/task-runner.ts`

### Metrics

| Metric | Value |
|---|---|
| Total lines | 220 |
| Constructor deps | 8 (`logCollector`, `logger`, `containerFactory`, `resources`, `issueManager`, `templateRenderer`, `jitMcpConfig`, `preExecuteHooks`) |
| Public methods/fields | 4 (`run`, `teardown`, `onToolOutput`, `onPreToolUse`) |
| Private methods | 4 (`prepareProfile`, `prepareContainer`, `executeAgent`, `collectResults`) |

### Identified Responsibilities

#### R1: Profile Preparation

**Method:** `prepareProfile()`  
**Deps used:** `templateRenderer`, `jitMcpConfig`

Renders Liquid agent templates and writes JIT MCP config. Pure pre-execution setup — no container or JIRA interaction.

#### R2: JIRA Issue Lifecycle

**Location:** Within `prepareContainer()` — lines 153–154  
**Deps used:** `issueManager`

Transitions JIRA issue status and posts start comment. Interleaved inside `prepareContainer()` alongside container setup — main coupling smell.

#### R3: Container Lifecycle Orchestration

**Methods:** `prepareContainer()` (bulk), `teardown()`  
**Deps used:** `containerFactory`, `preExecuteHooks`, `logger`

Starts containers, checks prerequisites, prepares config dirs, cleans paths, registers log sources, runs setup, executes lifecycle hooks. Also cleans the host `.ralph` directory (lines 157–161 — `rmSync`/`mkdirSync` on host filesystem).

#### R4: Agent Execution with Context Assembly

**Method:** `executeAgent()`  
**Deps used:** `resources`, `logger`

Fetches JIRA comments and handoff content, assembles `IssueContext`, then delegates to `container.execute()`. Mixes data fetching (JIRA API calls) with execution delegation.

#### R5: Result Collection & Reporting

**Method:** `collectResults()`  
**Deps used:** `logCollector`, `resources`

Collects container logs, attaches transcript to JIRA, saves execution summary. Also duplicated in the `catch` block of `run()` (lines 131–134).

#### R6: Error Handling / Result Wrapping

**Location:** `run()` catch block (lines 122–139)

Constructs an error `RalphResult`, partially duplicates log collection from R5.

### Coupling Between Responsibilities

| | R1 | R2 | R3 | R4 | R5 | R6 |
|---|---|---|---|---|---|---|
| **R1** | — | None | None | None | None | None |
| **R2** | | — | **High** (interleaved in `prepareContainer`) | None | None | None |
| **R3** | | | — | Medium (container passed to R4) | Medium (container passed to R5) | Medium (container ref for error logs) |
| **R4** | | | | — | None | None |
| **R5** | | | | | — | **High** (duplicated log collection) |

### Refactoring Suggestions

#### 1. Decouple JIRA transitions from container preparation

**Problem:** `prepareContainer()` calls `issueManager.transitionIssue()` and `issueManager.postStartComment()` at lines 153–154, then immediately does container `start()`, `checkPrerequisites()`, `setup()`, etc.

**Suggestion:** Lift the two `issueManager` calls out of `prepareContainer()` into `run()` as a distinct step before container prep:

```typescript
// In run():
await this.issueManager.transitionIssue(...);
await this.issueManager.postStartComment(...);
await this.prepareContainer(ctx, container);  // now purely container-focused
```

| Effort | Impact |
|---|---|
| Trivial (move 2 lines) | Medium — cleans up the method's contract; `prepareContainer` becomes testable without mocking `issueManager` |

**Priority: High**

#### 2. Deduplicate error-path log collection

**Problem:** The `catch` block in `run()` (lines 131–134) duplicates the `container.logs.collectAll()` pattern from `collectResults()`.

**Suggestion:** Extract a small private `collectLogs(container, result)` helper used by both `collectResults()` and the error path.

| Effort | Impact |
|---|---|
| Trivial (extract 4 lines) | Low-Medium — reduces duplication, prevents future drift |

**Priority: Medium**

#### 3. Separate issue context assembly from agent execution

**Problem:** `executeAgent()` does two things: (a) fetches JIRA comments + handoff via `resources`, (b) calls `container.execute()`.

**Suggestion:** Extract `assembleIssueContext(ctx): Promise<IssueContext>` as a separate private method. `executeAgent()` becomes a thin caller of `assembleIssueContext()` → `container.execute()`.

| Effort | Impact |
|---|---|
| Low (extract ~15 lines) | Low — improves readability and testability |

**Priority: Low**

#### 4. Move host filesystem cleanup out of `prepareContainer`

**Problem:** Lines 157–161 do `rmSync`/`mkdirSync` on the host `.ralph` directory. This is host-side prep, not container lifecycle.

**Suggestion:** Move to `prepareProfile()` or extract as a dedicated step in `run()`.

| Effort | Impact |
|---|---|
| Trivial (move 4 lines) | Low — `prepareContainer` becomes purely Docker-focused |

**Priority: Low**

#### 5. Remove mutable `onToolOutput`/`onPreToolUse` callback fields

**Problem:** These mutable public fields on a "stateless service" break the stateless contract. Wired up at the start of `run()` by copying onto the container.

**Suggestion:** Pass callbacks via `TaskContext` or a dedicated `TaskCallbacks` parameter on `run()`. Eliminates mutable state on the service instance.

| Effort | Impact |
|---|---|
| Low (add to TaskContext or new param type) | Medium — removes mutable state; makes the class genuinely stateless as documented |

**Priority: Medium**

---

## Summary

| # | Class | Suggestion | Effort | Impact | Priority |
|---|---|---|---|---|---|
| 1 | TaskRunner | Lift JIRA transitions out of `prepareContainer` | Trivial | Medium | **High** |
| 2 | TaskRunner | Deduplicate error-path log collection | Trivial | Low-Medium | **Medium** |
| 5 | TaskRunner | Pass callbacks via `TaskContext` instead of mutable fields | Low | Medium | **Medium** |
| 3 | TaskRunner | Separate context assembly from execution | Low | Low | Low |
| 4 | TaskRunner | Move host fs cleanup to `prepareProfile` | Trivial | Low | Low |
| — | ComposeClient | No action needed | — | — | — |

**ComposeClient** is already clean — no action needed. **TaskRunner** has actionable improvements, mostly trivial-effort reshuffling within the class. None require new files or classes — they're internal restructuring.
