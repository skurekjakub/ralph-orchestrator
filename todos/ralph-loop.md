# Ralph Loop — Persistent Task Completion via Session Hooks

## Status

**Orchestrator-level continuation loop is implemented** (see `ContainerManager.execute()` and `maxContinuations` in `profile.json`). The `ralph-docs` profile uses `maxContinuations: 2`. Exponential backoff (5s base, 30s cap), both CLI executors support `--continue`.

What remains is the **hook-based ralph loop** for more advanced scenarios — explained below.

## What This Is

A self-restarting loop mechanism that re-invokes the CLI agent when a session ends without the task being complete. Uses Copilot CLI's `sessionEnd` hook and `--continue` flag to resume work automatically until a completion condition is met or an iteration cap is reached.

## Inspiration

oh-my-opencode's "Ralph Loop" / `/ulw-loop` — a self-referential loop that doesn't stop until 100% done. The agent keeps working across session boundaries.

## How It Works

See [copilot-session-end-hook.sh](../copilot-session-end-hook.sh) for a prototype implementation.

### State File

```json
// .sisyphus/ralph-loop.json
{
  "active": true,
  "iteration": 1,
  "max_iterations": 5,
  "prompt": "Original task description",
  "completion_promise": "RALPH_LOOP_COMPLETE_abc123"
}
```

### Flow

1. Orchestrator starts a CLI session with a prompt that includes a **completion promise** — a unique string the agent must output when the task is truly done
2. `sessionEnd` hook fires when the CLI session ends (token limit, natural completion, or error)
3. Hook reads the state file; if loop is active:
   - Scans the session transcript for the completion promise
   - If found → task done, deactivate loop
   - If not found and under iteration cap → `copilot --continue --prompt "<continuation>"` to resume
   - If at iteration cap → stop, mark as incomplete
4. User abort (`reason: "abort"` or `"user_exit"`) immediately deactivates the loop

### Continuation Prompt

```
[RALPH LOOP 2/5]

Your previous attempt did not output the completion promise.
Continue working on the task. When fully complete, output: RALPH_LOOP_COMPLETE_abc123

Original task:
<original prompt>
```

## Integration with Ralph Orchestrator

Currently `copilot-session-end-hook.sh` is a standalone prototype. To integrate with Ralph:

### Option A: Hook-Based (Current Prototype)

- Deploy the hook into the container via `shared/hooks/`
- `ContainerManager` writes the state file before CLI invocation
- `ContainerManager` reads the state file after all iterations complete
- Log collection captures all iterations

### Option B: Orchestrator-Driven Loop

- `TaskRunner` runs the CLI, checks output for completion promise
- If not found, re-invokes with `--continue` and continuation prompt
- Loop logic lives in TypeScript, not in a bash hook
- More control, easier testing, better log collection per iteration

Option B aligns better with the phased execution direction (see [phased-execution.md](./phased-execution.md)) — the orchestrator controls the loop rather than delegating to a shell hook.

## Cost Consideration

Each loop iteration is a CLI invocation. A 5-iteration cap = up to 5x the cost of a single invocation. The completion promise mechanism avoids unnecessary iterations — if the agent finishes in iteration 1, the loop stops.

## Codebase Impact

- `src/services/task-runner.ts` — Loop logic (Option B)
- `src/container/cli-executors/` — `--continue` support
- `src/container/log-collector.ts` — Multi-iteration log collection
- Agent templates — Include completion promise instructions
- Profile config — Optional loop settings (max iterations, completion promise pattern)

## Open Questions

- Should the completion promise be a fixed string or dynamically generated per task?
- How does this interact with token/cost budgets? Should the orchestrator track cumulative cost across iterations?
- Can the transcript be parsed for progress indicators (e.g., "80% done") to decide whether to continue?
- Should failed iterations (errors, crashes) count toward the iteration cap?
