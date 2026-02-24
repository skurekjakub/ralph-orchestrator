# Phased Execution — Programmatic Agent Orchestration

## Status

**Prerequisite implemented**: `--continue` support added to both CLI executors (`CopilotExecutor.continueSession()`, `ClaudeCodeExecutor.continueSession()`). The continuation loop in `ContainerManager.execute()` proves the pattern works. Phased execution extends this by running *different* agent templates per phase instead of re-sending the same task.

## What This Is

Replace NLP-based orchestration (single prompt hoping the LLM follows a multi-step workflow) with deterministic, code-driven phase sequencing. Each phase is a separate CLI invocation with its own agent template and model, chained via `--continue`.

## Why

Current approach: a single agent template instructs the LLM to plan, execute, and review. The LLM might skip steps, reorder them, or go off-script. The orchestration is probabilistic — a brittle NLP process.

Phased execution makes the topology deterministic. `TaskRunner` controls *which* agent runs *when*. The LLM is a worker, not the control plane.

## Design

### Profile-Level Phase Config

```json
{
  "phases": [
    { "agent": "planner.agent.md", "model": "claude-opus-4-6" },
    { "agent": "executor.agent.md", "model": "claude-opus-4-6", "continue": true },
    { "agent": "reviewer.agent.md", "model": "claude-opus-4-6", "continue": true }
  ]
}
```

- Each phase references an agent template in the profile's `agents/` directory
- `"continue": true` uses `--continue` (Copilot CLI) to resume the previous session, preserving conversation context
- First phase starts fresh; subsequent phases inherit the session
- Model can vary per phase (e.g., cheaper model for planning, stronger for execution)

### Execution Flow

```
TaskRunner.executePhases(operation, phases):
  for each phase:
    1. Render phase.agent template with TemplateContext
    2. Build CLI command (with --continue if phase.continue)
    3. docker compose exec → CLI invocation
    4. Capture output, check exit code
    5. On failure: stop pipeline, mark operation as error
    6. On success: proceed to next phase
  All phases done → mark operation as completed
```

### Backward Compatibility

Profiles without `phases` behave exactly as today — single agent template, single CLI invocation. Phased execution is opt-in per profile.

## Cost Consideration

Each phase is a separate CLI invocation = separate billing event. A 3-phase pipeline costs ~3x a single invocation. `--continue` preserves context so the LLM doesn't re-read the codebase, but the API cost scales linearly with phases.

Tradeoff: reliability vs. cost. For high-value tasks (complex refactors, multi-repo changes), the deterministic workflow likely produces better results. For simple tasks, single-invocation remains optimal.

## Comparison to oh-my-opencode

oh-my-opencode bakes agent topology into harness code (Sisyphus/Hephaestus/Oracle are hardcoded roles). Their harness programmatically spawns sub-agents as separate processes within a single session via OpenCode's native background agent support.

Ralph's phased approach achieves the same determinism but at the CLI session boundary. Each phase = a CLI invocation rather than an in-process sub-agent spawn. This is a constraint of wrapping existing CLIs (Copilot, Claude Code) rather than being the harness itself.

## Codebase Impact

- `src/services/task-runner.ts` — Phase loop logic alongside existing single-invocation path
- `src/container/cli-executors/` — Support `--continue` flag in both executors
- `src/orchestrator-types.ts` — Phase type definitions
- Profile `profile.json` schema — Optional `phases` array on variants
- Agent templates — Smaller, focused templates per phase instead of one monolithic template

## Open Questions

- Should phase output be inspected between phases (e.g., planner outputs a structured plan that executor receives)?
- Can phases have conditional logic (skip reviewer if executor reports no changes)?
- How does log collection work per-phase vs per-operation?
- Should `--continue` session ID be tracked explicitly, or rely on Copilot's "continue last session" behavior?
