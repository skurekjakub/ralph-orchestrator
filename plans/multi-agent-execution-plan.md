# Multi-Agent Execution: Design Options

## Problem Statement

Currently, the orchestrator spawns **one CLI agent process per container session**. `ContainerManager.execute()` delegates to a single `ICliExecutor`, which runs one `copilot --agent <name> -p <prompt>` command, waits for it to finish, parses the result block, and returns. The continuation loop retries that same single agent if it doesn't produce a result block — it never spawns additional agents.

The goal is to support spawning **N agent CLI processes inside the same container**, concurrently or in defined sequences. Each agent has its own prompt and result contract. The orchestrator needs to:

1. Launch N agents in the same container
2. Capture each agent's stdout/stderr independently (separate log files)
3. Determine per-agent success/failure from each agent's result block
4. Aggregate per-agent results into a single task-level outcome
5. Handle partial failures (some agents succeed, some fail/timeout)
6. Kill all agents on teardown

## Current Architecture Constraints

### Single-executor binding
`ContainerManager` holds one `executor: ICliExecutor`. This executor owns one `activeProcess: ResultPromise | null` — there's no mechanism to track multiple processes.

### Single prompt path
`ContainerManager.execute()` calls `this.promptBuilder.build(workItem, context)` to produce **one** prompt, then passes it to the continuation runner. There's no concept of per-agent prompts.

### Result block parsing — single-stream
`parseResultBlock()` scans a single combined stdout string for `===RALPH_RESULT_START===`. Multiple agents writing to the same stdout would interleave their result blocks.

### Log source registration — single set
`LogSourceRegistry.registerAll()` registers one set of log sources (audit, transcript, tool-output, proxy, sidecar). These paths are fixed to the single CLI's config directory (`/workspace/.ralph/logs/`).

### Continuation runner — single executor
`ContinuationRunner` calls `executor.run()` then `executor.continueSession()` on the same executor. It assumes one session.

### Workspace state — shared
All agents in the same container share `/workspace`. File system writes from one agent are visible to all others. This is actually desirable for cooperative agents (e.g. researcher writes notes, reviewer reads them) but dangerous for independent agents.

## Option A: Sequential Multi-Agent Pipeline

**Concept:** Define an ordered list of agents per task. Each agent runs to completion before the next starts. Output from agent N can be passed as context to agent N+1.

### Config shape
```json
{
  "variants": [{
    "agents": [
      { "agent": "ralph.ralph-researcher", "role": "researcher" },
      { "agent": "ralph.ralph", "role": "primary" }
    ],
    "match": { ... }
  }]
}
```

### Architecture changes

| Component | Change |
|---|---|
| `IAgentProfile` | Add `agents: AgentSlot[]` (list of agent name + role pairs). Solo agents → single-element list for backward compat. |
| `CliExecutorFactory` | Returns N executors (or one executor reused N times with different `--agent` args). |
| `ContainerManager.execute()` | Loops over agent slots sequentially. Each gets its own `StreamCapture`. Per-agent stdout written to separate log files. |
| `ContinuationRunner` | Runs per-agent (each agent gets its own continuation loop). |
| `LogSourceRegistry` | Registers per-agent transcript/audit paths (namespaced by role or index). |
| `RalphResult` | Add `agentResults: AgentResult[]` — per-agent status, stdout, stderr, prUrl. |
| `TaskRunner` | Aggregation logic: task succeeds if all agents succeed, fails if any critical agent fails. |

### Log isolation
Each agent writes to its own config dir: `/workspace/.ralph/agents/<role>/`. The CLI's `--config-dir`, `--share`, `--log-dir` flags point there. Audit hooks are namespaced by role.

### Pros
- Simple mental model — agents run in known order
- Agent N+1 can read workspace artifacts from agent N (notes, analysis files)
- Continuation loop works per-agent without changes to the core logic
- Easy to reason about failures — pipelined, so first failure can abort the chain
- Minimal concurrency concerns — no parallel file system writes

### Cons
- Total execution time = sum of all agent durations (no parallelism)
- Agent N+1 is blocked until agent N finishes (even if they're independent)
- Shared workspace state is implicit — agents must coordinate via file conventions

### Complexity: **Low-Medium**

---

## Option B: Parallel Multi-Agent Execution

**Concept:** Launch N agent CLI processes concurrently inside the same container. Each gets its own isolated config directory, log set, and result block. The orchestrator waits for all to finish, then aggregates results.

### Config shape
```json
{
  "variants": [{
    "agents": [
      { "agent": "ralph.ralph-researcher", "role": "researcher", "critical": true },
      { "agent": "ralph.ralph-reviewer", "role": "reviewer", "critical": false }
    ],
    "match": { ... }
  }]
}
```

### Architecture changes

| Component | Change |
|---|---|
| `IAgentProfile` | Add `agents: AgentSlot[]` with `critical` flag per agent. |
| `ICliExecutor` | No change to interface. Multiple instances created, each configured for a different agent. |
| `ContainerManager` | Holds `executors: Map<string, ICliExecutor>`. `execute()` launches all via `Promise.allSettled()`. Each executor gets its own `--config-dir /workspace/.ralph/agents/<role>/`. |
| `StreamCapture` | One per executor — captures are independent. |
| `ContainerLogCollector` | Register per-agent log sources with role-prefixed IDs (e.g. `researcher-audit`, `reviewer-transcript`). |
| `ContinuationRunner` | One per agent — each has its own continuation loop. Runs in parallel. |
| `RalphResult` | Add `agentResults: AgentResult[]`. Task status = worst critical agent status. |
| `killActive()` | Iterates all executors, kills all active processes. |

### Log isolation
Same as Option A — per-role config dirs at `/workspace/.ralph/agents/<role>/`. Each CLI instance writes transcripts, audit logs, and tool output to its own directory. The log collector registers sources for each role separately.

### Workspace contention
The main risk: concurrent git operations, concurrent file edits, concurrent npm installs. Mitigation options:
- **Workspace partitioning**: each agent gets a separate working directory (if possible)
- **Role-based filesystem contracts**: researcher writes to `resources/research/`, reviewer reads from it
- **Custom git worktrees**: each agent operates on a separate worktree of the same repo

### Result aggregation
```
if (any critical agent errored) → TaskStatus.Error
else if (any critical agent partial) → TaskStatus.Partial  
else if (all critical agents completed) → TaskStatus.Completed
```

Non-critical agents contribute logs and artifacts but don't affect the task status.

### Pros
- Total execution time = max(agent durations) — full parallelism
- Independent agents don't block each other
- `critical` flag allows observer/auditor agents that don't affect task outcome

### Cons
- Workspace contention is a real problem — git, file I/O, npm
- Harder to reason about failures — interleaved execution
- Continuation loop runs in parallel — compound backoff interactions
- Process management complexity — tracking N active processes, clean shutdown
- Both Copilot and Claude Code CLIs may have internal state management assumptions (session-state dirs, lock files) that conflict when running concurrently

### Complexity: **High**

---

## Option C: Phased Multi-Agent (Sequential Phases, Parallel Within Phase)

**Concept:** Define phases, each containing one or more agents. Agents within a phase run concurrently. Phases execute sequentially. This is a hybrid of A and B.

### Config shape
```json
{
  "variants": [{
    "phases": [
      {
        "name": "research",
        "agents": [
          { "agent": "ralph.ralph-researcher", "role": "researcher" }
        ]
      },
      {
        "name": "execution",
        "agents": [
          { "agent": "ralph.ralph", "role": "writer", "critical": true },
          { "agent": "ralph.ralph-reviewer", "role": "reviewer" }
        ]
      }
    ],
    "match": { ... }
  }]
}
```

### Architecture changes
Superset of Option B, plus:

| Component | Change |
|---|---|
| `IAgentProfile` | `phases: Phase[]`, each containing `agents: AgentSlot[]`. |
| `ContainerManager.execute()` | Outer loop over phases (sequential). Inner loop over agents within a phase (parallel via `Promise.allSettled`). |
| `RalphResult` | `phaseResults: PhaseResult[]`, each containing `agentResults: AgentResult[]`. |
| Workspace cleanup | Optional per-phase cleanup between phases (clean working dirs, preserve shared artifacts). |

### Pros
- Maximum flexibility — sequential where needed, parallel where safe
- Research phase produces artifacts that execution phase consumes
- Phase gates — abort if research phase fails before wasting time on execution

### Cons
- Most complex config format
- Most complex orchestration logic
- May be over-engineered for initial use cases

### Complexity: **Very High**

---

## Cross-Cutting Concerns (All Options)

### Per-agent process tracking
Currently `ICliExecutor` holds `activeProcess: ResultPromise | null`. For multi-agent, each agent slot needs its own process tracker. The `ProcessTracker` interface in `shared-exec.ts` already abstracts this — it just needs to be one-per-slot instead of shared.

### Per-agent log files
Output naming convention: `<taskId>-<ts>-<role>-<source>.<ext>`
Example: `DF-100-1709876543-researcher-transcript.md`, `DF-100-1709876543-writer-audit.jsonl`

The `LogSourceRegistry` needs to accept a role prefix. The `ContainerLogCollector` already supports arbitrary source IDs, so this is a naming convention change.

### Per-agent CLI config isolation
Each agent needs its own `--config-dir` to avoid session-state conflicts:
```
/workspace/.ralph/agents/researcher/
/workspace/.ralph/agents/writer/
/workspace/.ralph/agents/reviewer/
```
CLI flags per agent: `--config-dir /workspace/.ralph/agents/<role>/ --share /workspace/.ralph/agents/<role>/transcript.md --log-dir /workspace/.ralph/agents/<role>/cli-debug/`

### Per-agent result blocks
Each agent produces its own `===RALPH_RESULT_START===` block. `parseResultBlock()` already works on a per-stdout basis — no change needed as long as each agent's stdout is captured separately (which all options guarantee via per-agent `StreamCapture`).

### Per-agent prompts
The `PromptBuilder` produces one prompt from the work item. For multi-agent, options:
1. **Same prompt, different agent instructions**: All agents get the same work item prompt. Agent behavior is defined by their `.agent.md` template. This is the simplest — the orchestrator doesn't need per-agent prompt logic.
2. **Role-based prompt augmentation**: Prepend a role header to the shared prompt (e.g. `"You are the RESEARCHER for this task. Your job is..."`). The `.agent.md` already handles this — it's just a matter of the `--agent` flag pointing to the right agent definition.
3. **Per-agent custom prompts**: Each agent slot has its own prompt override. Most flexible but most complex.

**Recommendation**: Option 1 is sufficient. The `--agent <name>` flag already selects a different `.agent.md` which contains all role-specific instructions. The work item prompt (issue description, comments, etc.) is the same for all agents.

### Backward compatibility
Solo agents (current behavior) should work unchanged. An empty or single-element `agents` list degrades to the current single-executor path. The `agent` field on variants becomes sugar for `agents: [{ agent: "...", role: "primary" }]`.

### Timeout handling
- **Per-agent timeout**: Each agent has its own timeout (from `profile.timeoutMs` or a per-agent override). If one agent times out, the others may continue or be killed depending on the `critical` flag.
- **Global timeout**: A task-level timeout caps the total wall-clock time across all agents/phases.

### Kill semantics
`container.stop()` must kill ALL active agent processes. The current `executor.killActive()` kills one. Multi-agent needs `executors.forEach(e => e.killActive())`.

---

## Direction (from refinement)

**All three execution models will be implemented** — sequential, parallel, and phased — to experiment with multi-agent patterns per 2026 agentic literature. The design should support all three behind a unified abstraction.

### Decisions

| Concern | Decision |
|---|---|
| Execution model | All three (sequential → parallel → phased), layered incrementally |
| Inter-agent comms | Filesystem-first (shared `BLACKBOARD.md`). Phase transitions need handoff piping for multi-phase. |
| Failure handling | Per-agent `critical` flag. Non-critical agents are best-effort. |
| Continuation loop | **Unresolved** — needs lifecycle modeling before deciding per-agent vs. global. |
| PR ownership | Single shared branch, one PR across all agents. |
| Config location | Variant-level `agents[]` in `profile.json`. |

### Implementation order

1. **Sequential pipeline** — lowest risk, validates per-agent config dir isolation, log namespacing, result aggregation, and `AgentSlot[]` config.
2. **Parallel execution** — swap sequential loop for `Promise.allSettled`, add workspace contention mitigation (git worktrees or role-based filesystem contracts, `BLACKBOARD.md` convention).
3. **Phased execution** — add phase grouping, phase gates (abort if critical phase fails), and inter-phase handoff (piping agent N's result into agent N+1's prompt context).

Each layer builds on the same per-agent primitives: isolated config dirs, per-agent log sources, per-agent `StreamCapture`, per-agent result parsing.

---

## Open Questions

1. **Workspace sharing semantics**: Should agents be explicitly documented as sharing `/workspace`, or should we consider git worktrees / subdirectory isolation?
2. **Continuation scope**: Per-agent retry budget, global retry of the whole pipeline, or phase-level retry? Needs lifecycle modeling.
3. **Per-agent timeouts**: Same timeout for all agents, or configurable per-agent?
4. **JIRA comments**: One completion comment per task (aggregated), or per-agent comments?
5. **Prompt contract**: Is `===RALPH_RESULT_START===` the universal contract, or should each agent role have its own result format?
6. **Blackboard protocol**: What conventions should agents follow for `BLACKBOARD.md` reads/writes? Append-only? Structured sections?
7. **Phase handoff format**: When piping results between phases, what data flows through? Full stdout, result block only, or a structured handoff artifact?
