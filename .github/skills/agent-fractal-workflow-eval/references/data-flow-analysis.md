# Data Flow Analysis

How to trace data flow through a fractal multi-pass agent pipeline. Use this reference when auditing re-entry paths, artifact consumption chains, or directive propagation.

## The Producer-Consumer Matrix

Build this before making any claims about data flow correctness.

### Columns

List every agent in the pipeline (orchestrator, coordinators, specialists, direct-dispatch agents).

### Rows

List every artifact the pipeline produces:
- Status files (`agents/*-status.json`)
- Shared state (`progress.json`, `manifest.json`, `context.json`)
- Analysis outputs (`code-analysis.json`, `invariant-inventory.json`, `impact-matrix.json`, etc.)
- Planning outputs (`task-graph.json`, `risk-register.json`)
- Execution outputs (`tasks/*/writer-output.json`, `tasks/*/style-review.json`, etc.)
- Verification outputs (`gap-analysis.json`, `verification-summary.json`)
- Delivery outputs (`pipeline-summary.json`, `changelog.json`)
- Directive inputs (`directives.md`)

### Cells

Mark each cell:
- **W** — agent writes this artifact
- **R** — agent reads this artifact
- **R?** — agent reads if it exists (optional dependency)
- Empty — no interaction

### Validation Rules

1. Every **R** cell must have a **W** cell from an agent in an earlier pass
2. Every **W** cell should have at least one **R** cell (unused artifacts are suspicious)
3. No agent should have both **W** and **R** for the same artifact in the same pass (read-your-own-write is a smell in multi-agent systems)

## Re-Entry Flow Tracing

The most error-prone data flow in fractal workflows is the re-entry path. Trace it step by step:

### Step 1: Gap Discovery

```
gap-hunter reads: all pipeline artifacts, previous gap-analysis (cycle 2+)
gap-hunter writes: gap-analysis.json
  - gaps[].description, evidence, recommendation
  - gaps[].reEntryTarget (which pass to re-enter)
  - convergenceAssessment.reEntryTargets[]
```

### Step 2: Orchestrator Decision

```
orchestrator reads: verification-coordinator-status.json
  - result: "needs-reentry"
  - reEntryTargets: ["pass3", "pass4"]
orchestrator action:
  - pick earliest target
  - set gapHunting.reEntryTarget in progress.json
  - cascade reset: target pass + all downstream → "not-started"
  - re-dispatch via routing table (which now matches the reset pass)
```

### Step 3: Coordinator Re-Dispatch (THE CRITICAL HOP)

This is where context is most commonly lost. Verify:

```
coordinator reads: progress.json (sees pass status = "not-started")
coordinator reads: progress.json gapHunting.reEntryTarget (non-null = re-entry)
coordinator reads: gap-analysis.json (MUST filter for matching reEntryTarget)
coordinator action:
  - extracts gaps relevant to current pass
  - relays gap description/evidence/recommendation to specialists
  - tracks which gaps were relayed
```

**Red flag:** If the coordinator enters its normal flow (branch triggered by pass status = "not-started") without reading gap-analysis.json, the re-entry context is lost.

### Step 4: Specialist Execution

```
specialist receives: normal inputs + gap context from coordinator dispatch
specialist action:
  - addresses specific gaps alongside normal work
  - or: adjusts output to cover gap deficiencies
```

**Red flag:** If the specialist has no instructions for handling gap context in dispatch messages, it ignores the gap information even if the coordinator sends it.

## Directive Propagation Tracing

### Two models (pick one consistently)

**Model A: Orchestrator Relay**
```
user writes → directives.md
orchestrator reads → directives.md, parses sections
orchestrator relays → Global/Context/Pass-N to coordinator in dispatch
coordinator relays → relevant content to specialists in dispatch
```

**Model B: Coordinator Direct Read**
```
user writes → directives.md
orchestrator reads → directives.md, processes only Routing directives
coordinators read → directives.md directly, extract own applicable sections
coordinators relay → Global/Context/Pass-specific to specialists in dispatch
```

**Key difference:** In Model A, the orchestrator must include directive content in dispatch messages — its messages grow with directive complexity. In Model B, the orchestrator's dispatch messages stay lean, but coordinators bear the file-read burden.

**Validation:** Check which model the architecture doc describes, then verify every agent in the hierarchy follows the same model. Mixed models (orchestrator relays to some coordinators but not others) create inconsistency.

### Specialist level

Regardless of which model is used for orchestrator → coordinator, specialists should **not** read directives.md directly. They receive relevant directive content from their coordinator's dispatch message. This preserves the specialist's focused context window.

**Validation:** Grep all specialist agent files for `directives.md`. If any specialist reads it directly, that's a finding (unless documented as an intentional exception).

## Status Chain Tracing

For each pass, trace the status file chain:

```
specialist writes → specialist-status.json (per-specialist result)
coordinator reads → specialist-status.json (validates, aggregates)
coordinator writes → coordinator-status.json (pass-level result) + progress.json update
orchestrator reads → coordinator-status.json (routing decision) + progress.json (state)
```

Verify:
1. Coordinator reads every specialist status it dispatched
2. Coordinator's result codes map to orchestrator routing table entries
3. Progress.json updates include all expected fields for that pass
4. No chain link is skipped (e.g., orchestrator reading specialist status directly instead of coordinator status)

## Cascade Reset Verification

When auditing re-entry, verify the cascade reset's impact on every conditional branch in downstream agents.

### The Technique

For each coordinator/specialist with conditional branches (mode detection):

1. List all possible states the orchestrator can produce for that agent's guard conditions
2. Map each state to the branch it triggers
3. Verify each branch is reachable from at least one orchestrator action
4. If a branch requires a state the orchestrator never produces → flag as dead code

### Common Cascade Reset Pitfall

The orchestrator cascade-resets `target + all downstream through passN`. This means agents operating on passes within the cascade range will ALWAYS see their pass as `"not-started"` when re-invoked. Any branch guarded by `"both done"` or `"pass already complete"` is dead.

**Example:** A verification coordinator with 3 branches:
- Branch 1: `pass5 = "not-started"` → execute both Pass 5 + Pass 6
- Branch 2: `pass5 = "done", pass6 = "not-started"` → execute Pass 6 only
- Branch 3: `pass5 = "done", pass6 = "done"` → re-entry mode

If cascade reset always resets both pass5 and pass6, Branch 3 is unreachable on re-entry. Branch 2 is only reachable on first invocation when Pass 5 completes but Pass 6 hasn't started yet (unlikely in a coordinator that runs both). In practice, only Branch 1 fires.

### Re-Entry Handling Section Contradiction

Watch for Re-Entry Handling sections at the bottom of coordinator agents that contradict the mode detection at the top. These sections were often written for a design where re-entry was handled differently (e.g., partial resets or coordinator-managed re-entry) but the orchestrator now cascade-resets everything.

**Signature:** Mode detection says "if pass not started → run normally". Re-Entry Handling says "skip this step on re-entry". But cascade reset ensures the mode detection always triggers the "run normally" branch, making the Re-Entry Handling section dead.

**Fix pattern:** Remove the Re-Entry Handling section. Add a brief note to the mode detection explaining that cascade reset naturally handles re-entry.
