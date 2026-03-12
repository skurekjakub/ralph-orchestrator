# Verification Pass Pattern

The two-pass planner verification loop ensures that what was implemented actually satisfies the original spec. This is the key differentiator of the planner loop — without it, task decomposition can introduce integration gaps that no individual task's reviewer would catch.

## Why Verification Matters

When work is split into tasks, each task's coder→reviewer loop validates that specific task in isolation. But cross-task integration issues can slip through:

- A definition was added (Task 1) but never registered in the init file (Task 2 missed it)
- Types were defined (Task 1) but the consumer uses the wrong import path (Task 3)
- A test file was created (Task 4) but doesn't cover an edge case the analyst flagged
- Build passes after each task individually, but the combined result has a regression

The planner verification pass catches these by re-reading the original analyst spec and comparing it against the actual codebase state after all tasks are done.

## How It Works

```
Pass 1 (Initial Planning)
  planner → planned
  ↓
  TASK-01: coder → reviewer (max N rounds)
  TASK-02: coder → reviewer (max N rounds)
  TASK-03: coder → reviewer (max N rounds)
  ↓ all tasks complete
  
Pass 2 (Verification)
  planner → verified   → Package (done)
          → gaps_found → execute new tasks → Package
          → blocked    → stop
```

### Pass 1: Initial Planning

The planner reads the analyst's output, decomposes it into ordered tasks, and returns `planned`.

The orchestrator executes each task through the coder→reviewer loop. After all tasks complete (or hit their iteration caps), the orchestrator dispatches the planner again.

### Pass 2: Verification

The planner's behavior changes on the second dispatch. The orchestrator tells it this is a verification pass. The planner:

1. Re-reads the analyst's original spec (`ralph-analyst/output.md`)
2. Reads its own previous `tasks.json` and task files
3. Reads the coder's and reviewer's latest artifacts
4. Inspects the actual codebase — reads the files that were supposed to change
5. Compares the implemented state against every spec requirement

**If everything checks out:** Returns `verified`. The orchestrator proceeds to Package.

**If gaps remain:** Creates new task files for only the remaining work (does not re-plan completed tasks), updates `tasks.json` with only the new tasks, and returns `gaps_found`. The orchestrator executes these new tasks through the same coder→reviewer loop, then proceeds to Package. There is no third planner pass.

**If blocked:** Returns `blocked` — something is fundamentally wrong that can't be fixed with more tasks.

## Orchestrator Dispatch Logic

The orchestrator tells the planner which pass it's on. This is done in the dispatch context, not in the planner's own state. Example orchestrator routing:

```
After all tasks in current pass complete:
  If planner_pass == 1:
    Dispatch ralph-planner with context: "This is a verification pass"
    planner_pass = 2
  If planner_pass == 2:
    Proceed to Package
```

The planner decides its behavior (planning vs. verification) based on whether previous task artifacts exist and the orchestrator's dispatch context.

## Max Passes = 2

The verification loop is always capped at 2 planner passes:
- Pass 1: Initial plan → execute all tasks
- Pass 2: Verification → optionally execute gap-fill tasks → Package

There is intentionally no pass 3. If gaps remain after the verification round's tasks execute, the orchestrator accepts the result as-is and proceeds to Package with whatever was accomplished. This prevents infinite loops.

## Interaction with Per-Task Iteration

The verification pass sits *above* the per-task iteration:

```
Planner pass 1 or 2
  └─ Task progression (TASK-01, TASK-02, ...)
       └─ Per-task coder→reviewer loop (max N rounds)
```

Each level has its own cap:
- Planner passes: 2
- Task progression: all tasks from `tasks.json`
- Per-task rounds: configurable (default 3)

If a task hits its round cap, it's accepted as-is and the next task begins. The planner's verification pass will catch anything the round-capped task missed.
