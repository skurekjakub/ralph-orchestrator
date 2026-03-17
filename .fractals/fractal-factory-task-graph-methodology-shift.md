# Fractal Factory → Task-Graph Methodology Shift

## The Problem

Fractal Factory currently uses a **pass-state + roster-lifecycle** control plane. Planning produces `roster.json`, `architecture.json`, and `test-plan.json`. Execution advances batches of produced agents through a writer→reviewer loop governed by roster status (`designed` → `written` → `reviewed` → `verified` → `blocked`). Progress is tracked in `progress.json` as pass-level counters.

This works, but it distributes the operational contract across several artifacts with no single object that simultaneously answers: what can execute next, what is blocked, what done means, what must be verified, and where to re-enter.

Migration solved this with `task-graph.json` — an executable DAG where each node (slice) carries scope, dependencies, acceptance criteria, invariants, verification oracles, and status. The graph is not just documentation of planned work; it is the runtime work queue that every downstream agent reads, advances, and extends.

The goal is to give Fractal Factory the same property: **one first-class production graph** that becomes the central runtime object, while `roster.json`, `architecture.json`, and `test-plan.json` become supporting constraint artifacts that individual tasks reference rather than artifacts that drive execution themselves.

## What Changes

### Current: Roster-Driven Execution

```
roster.json (agent inventory + lifecycle status)
  ↓
execution-coordinator selects batch from roster (bottom-up ordering, max batch size)
  ↓
prompt-writer writes batch → prompt-reviewer reviews batch
  ↓
roster status advances: designed → written → reviewed
  ↓
infra-writer runs after all batches
  ↓
verification runs on whole package
```

The unit of work is a **batch of produced agents inferred from roster state**. Dependencies between produced agents are implicit in roster ordering conventions and pass sequencing. Verification is package-level. Re-entry resets pass state and targeted roster entries.

### Proposed: Production-Graph-Driven Execution

```
roster.json + architecture.json + test-plan.json (constraint artifacts)
  ↓
production-graph-planner produces production-graph.json
  ↓
execution-coordinator selects next eligible task from graph (dependency-gated)
  ↓
task-appropriate specialist executes (prompt-write, infra-write, skill-write, schema-write, doc-write)
  ↓
task-appropriate reviewer validates against per-task acceptance criteria
  ↓
task status advances in graph: planned → implemented → verified
  ↓
gap hunter can add new tasks to the graph
```

The unit of work is a **task node in the production graph**. Dependencies are explicit edges. Each task carries its own acceptance criteria, scope, and verification hooks. Re-entry mutates the graph, not pass counters.

## Production Graph Schema

```json
{
  "version": 1,
  "lastUpdated": "<ISO-8601-UTC>",
  "summary": {
    "totalTasks": 0,
    "byStatus": {},
    "byCategory": {}
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "Descriptive task name",
      "description": "What this task produces and why it is bounded this way",
      "category": "orchestrator-prompt | coordinator-prompt | specialist-prompt | skill | schema | bootstrap | documentation | test-fixture",
      "rosterAgentIds": ["A-001"],
      "dependsOn": [],
      "status": "planned",
      "priority": 1,
      "scope": {
        "outputFiles": ["produced-output/agents/{name}.agent.md"],
        "constraintRefs": {
          "rosterEntry": "A-001",
          "architecturePass": "all",
          "testScenarios": ["GS-001"],
          "invariants": ["INV-003", "INV-007"]
        },
        "boundaryNotes": "What is NOT in scope for this task"
      },
      "acceptanceCriteria": [
        "Specific testable condition 1",
        "Specific testable condition 2"
      ],
      "verificationHooks": ["structural-checklist", "routing-audit"],
      "retryHistory": [],
      "addedBy": "production-graph-planner",
      "addedInCycle": 1,
      "gapAnnotations": []
    }
  ]
}
```

### Key Design Decisions

**Tasks reference constraints, they don't copy them.** A migration slice inlines invariants because the coder needs them at hand while implementing unfamiliar legacy code. A factory task references roster entries, architecture passes, test scenarios, and invariants by ID because the prompt-writer reads those constraint artifacts directly. There is no benefit to copying the full roster entry into every task node.

**Categories replace implicit batch ordering.** Instead of inferring work order from roster sorting, each task declares a `category` and explicit `dependsOn` edges. The execution coordinator picks the first eligible task whose dependencies are all verified — same logic as migration's slice selection.

**Acceptance criteria are per-task.** Instead of a package-level verification pass that runs a single checklist against everything, each task carries the criteria that define "done" for that specific piece of work. The reviewer validates against those criteria, not against the global architecture intent.

**Verification hooks replace the monolithic verification pass.** Each task declares which verification approaches apply to it (`structural-checklist`, `routing-audit`, `contract-check`, `anti-laziness`, `test-coverage`). The verification coordinator runs only the relevant hooks per task, rather than running a single whole-package audit.

**Gap hunting extends the graph.** When gaps are found, the gap hunter adds new task nodes to `production-graph.json` with `addedBy: "gap-hunter"` and appropriate dependency edges. This is the same closed-loop property that makes migration work: the executable plan evolves as understanding improves, rather than passes being reset.

## What Roster, Architecture, and Test-Plan Become

They do not disappear. They change roles.

| Artifact | Current Role | New Role |
|---|---|---|
| `roster.json` | Runtime work queue + lifecycle tracker | **Design constraint.** Defines what agents the produced system must have — names, hierarchy, result codes, artifact responsibilities. Referenced by task nodes via `rosterAgentIds` and `scope.constraintRefs.rosterEntry`. No longer carries lifecycle `status` field. |
| `architecture.json` | Pass design + artifact flow | **Structural constraint.** Defines passes, artifact schemas, depth decisions. Referenced by task nodes via `scope.constraintRefs.architecturePass`. Still informs the production-graph-planner about ordering and required outputs. |
| `test-plan.json` | Standalone test scenario list | **Verification constraint.** Defines golden test scenarios. Referenced by task nodes via `scope.constraintRefs.testScenarios`. Test scenarios become acceptance criteria or verification hooks on specific tasks rather than a separate post-hoc concern. |
| `domain-model.json` | Discovery output consumed by planning | **Domain constraint.** Continues to serve as discovery output. Invariants are referenced by task nodes via `scope.constraintRefs.invariants`. |

The production graph is the only artifact that carries runtime state (task status, retry history, gap annotations). All other artifacts are stateless design constraints once written.

## Task Decomposition: What Becomes a Graph Node

The production-graph-planner reads `roster.json`, `architecture.json`, `test-plan.json`, and `domain-model.json` and decomposes them into discrete tasks:

| Category | Source | One Task Per | Example |
|---|---|---|---|
| `orchestrator-prompt` | roster entry where `level == "orchestrator"` | 1 orchestrator | Write session orchestrator prompt |
| `coordinator-prompt` | roster entries where `level == "coordinator"` | 1 coordinator | Write discovery-coordinator prompt |
| `specialist-prompt` | roster entries where `level == "specialist"` | 1 specialist | Write domain-scanner prompt |
| `guide-prompt` | roster entry where `level == "guide"` | 1 guide | Write guide prompt |
| `skill` | architecture skills + reusable reference needs | 1 per skill | Write workflow router skill |
| `schema` | architecture artifacts | 1 per schema | Write progress.schema.md |
| `bootstrap` | architecture infrastructure | 1 | Write bootstrap.sh |
| `documentation` | architecture docs | 1 per doc | Write README, agents-guide |
| `test-fixture` | test-plan scenarios | 1 per scenario group | Write golden test GS-001 |

### Dependency Rules

The planner generates explicit `dependsOn` edges:

1. **Coordinator prompt depends on its specialist prompts.** The coordinator's routing table references specialist result codes — you must know what a specialist can return before writing its coordinator's routing table.
2. **Orchestrator prompt depends on all coordinator prompts.** Same reasoning — orchestrator routing references coordinator results.
3. **Skill tasks depend on their consuming specialist prompts.** The skill's scope and trigger criteria come from seeing what the specialist actually needs.
4. **Schema tasks depend on the architecture being finalized** (no explicit task dependency — the architecture is a constraint artifact that exists before the graph is created).
5. **Documentation depends on all prompt tasks.** Docs describe what was produced.
6. **Bootstrap depends on all prompt + skill + schema tasks.** Bootstrap must create directories and seed artifacts for all agents.
7. **Test fixtures depend on the prompt tasks they exercise.** You can't write a golden test for an agent that doesn't have a prompt yet.

This is not a complex DAG. Most specialist prompts have zero dependencies on other specialist prompts (they are leaf nodes). The deepest chain is: specialist prompts → coordinator prompt → orchestrator prompt → documentation → bootstrap.

## Execution Model Change

### Current Execution Coordinator Behavior

1. Read roster, select batch of `designed` agents (max batch size, bottom-up order).
2. Dispatch prompt-writer for batch → dispatch prompt-reviewer for batch.
3. Retry loop up to max retries.
4. Mark exhausted agents `blocked`, advance to next batch.
5. After all batches: dispatch infra-writer.
6. Report complete.

### Proposed Execution Coordinator Behavior

1. Read `production-graph.json`. Find the first task where:
   - `status` is `planned` OR `failed-review` (re-execution after gap hunting)
   - ALL tasks in its `dependsOn` array have `status: verified`
2. Dispatch the category-appropriate writer for that task.
3. Dispatch the reviewer for that task with per-task `acceptanceCriteria`.
4. If rejected and retries remain: re-dispatch writer with feedback.
5. If approved: run task's `verificationHooks`. If all pass: set task `status: verified`.
6. If rejected and retries exhausted: set task `status: blocked`.
7. Move to next eligible task.
8. When no eligible tasks remain: report complete.

This is structurally identical to migration's execution coordinator. The unit of work changes from "batch of agents selected from roster" to "one task selected from graph by dependency eligibility."

## Verification Model Change

### Current

A monolithic two-specialist verification pass (checklist-validator + audit-oracle) runs against the entire produced system after all prompts are written. This gives a single all-or-nothing verdict.

### Proposed

Verification is **per-task and inline**. Each task's `verificationHooks` declare which validations apply. The reviewer runs those hooks as part of the approval step. This means:

- A specialist prompt task gets `structural-checklist` + `anti-laziness` hooks.
- A coordinator prompt task gets `routing-audit` + `structural-checklist` hooks.
- An orchestrator prompt task gets `routing-audit` + `purity-check` hooks.
- A skill task gets `content-check` + `trigger-accuracy` hooks.
- A schema task gets `format-validation` hooks.

The whole-package audit oracle can still run as a post-completion pass, but it's a final sanity check rather than the primary verification mechanism.

## Re-Entry Model Change

### Current

Gap hunting produces `gap-report.json` with `suggestedReEntryPass`. The orchestrator resets passes from that point forward by:
1. Setting pass status to `pending` in `progress.json`.
2. Deleting status.json files for all agents in reset passes.
3. On re-entry, coordinators re-dispatch specialists who read gap context.

This works but is coarse — resetting a pass re-runs everything in that pass, not just the specific work items that gaps affect.

### Proposed

Gap hunting adds new task nodes or marks existing tasks for re-work:

1. **New gap → new task.** If a gap identifies a missing agent, missing skill, or missing schema, the gap hunter creates a new task node in `production-graph.json` with `addedBy: "gap-hunter"`, `addedInCycle: N`, and appropriate `dependsOn` edges.
2. **Existing gap → task re-work.** If a gap targets an existing produced artifact, the gap hunter sets that task's status back to `planned` and adds a `gapAnnotation` describing what needs to change. The specialist re-reads the annotation on re-execution.
3. **No pass reset needed.** The orchestrator does not reset passes. It continues to pick the next eligible task from the graph. New or re-planned tasks become eligible naturally through the dependency gate.

This is the same closed-loop property as migration: the graph evolves rather than passes resetting.

## What This Unifies

In the current model, the operational contract is distributed:

| Concern | Current Artifact |
|---|---|
| What to produce | `roster.json` |
| Production order | Implicit roster ordering + pass sequence |
| Definition of done | Package-level checklist |
| Progress tracking | `progress.json` counters + roster status |
| Re-entry surface | `gap-report.json` + pass reset |
| Failure locality | Batch-level blocking |

In the proposed model, the production graph absorbs all runtime concerns:

| Concern | Proposed Artifact |
|---|---|
| What to produce | `production-graph.json` tasks |
| Production order | Explicit `dependsOn` edges |
| Definition of done | Per-task `acceptanceCriteria` |
| Progress tracking | Task status in graph |
| Re-entry surface | Add/revise tasks in graph |
| Failure locality | Single-task blocking |

`roster.json`, `architecture.json`, `test-plan.json`, and `domain-model.json` become the constraint layer that the graph references. They answer "what should the produced system look like?" The graph answers "what work must be done to get there, and what is the current state of that work?"

## Agent Impact Summary

| Agent | Change |
|---|---|
| **production-graph-planner** (new) | Replaces the implicit batch-ordering logic. Reads roster + architecture + test-plan + domain-model and emits `production-graph.json`. Runs during Pass 3 after roster-planner and routing-planner. |
| **roster-planner** | Drops the `status` lifecycle field from roster entries. Roster becomes a pure design artifact. |
| **execution-coordinator** | Rewrites from batch-loop to dependency-gated task selection from the production graph. Category-aware dispatch replaces the single prompt-writer→prompt-reviewer pattern. |
| **prompt-writer** | Receives a single task ID instead of a batch. Reads the task's `constraintRefs` to find the relevant roster entry, architecture pass, and invariants. Writes one prompt per invocation. |
| **prompt-reviewer** | Receives a task ID. Validates against per-task `acceptanceCriteria` instead of global checklist. Runs `verificationHooks` inline. |
| **infra-writer** | Becomes a task in the graph (category `bootstrap`) rather than a post-loop dispatch. Depends on all prompt tasks being verified. |
| **checklist-validator** | Shifts from package-level to task-level hooks. May still run a final whole-package pass as a gap-hunting input. |
| **audit-oracle** | Same shift. Reduced from primary verification to final cross-reference sanity check. |
| **gap-hunting coordinator** | Hunters now mutate the production graph (add tasks, annotate existing tasks) instead of producing a standalone gap-report that triggers pass resets. |
| **coverage-hunter, artifact-hunter, infrastructure-hunter** | Write new task nodes or gap annotations into `production-graph.json` instead of standalone gap-report entries. |
| **session orchestrator** | No longer manages pass status transitions. Reads the overall graph for completion (all tasks verified or blocked). Still manages gap-hunting cycle limits. |

## What Does Not Change

- **Pass structure.** Discovery, analysis, and planning still run as sequential passes producing their constraint artifacts before the graph is created. The graph governs execution, verification, gap hunting, and delivery — not discovery or analysis.
- **Agent hierarchy.** Orchestrator → coordinator → specialist remains. The graph does not replace the dispatch hierarchy; it replaces the work-selection mechanism within the execution pass.
- **Coordinator purity.** Coordinators are still pure routers. The execution coordinator reads the graph for next-task selection but does not do substantive work.
- **Synthesis pass.** Meta-knowledge extraction continues to run post-convergence, governed by the existing synthesis coordinator and the invariant-memory boundary already in place.
- **Artifact schemas.** `domain-model.json`, `architecture.json`, `roster.json` keep their current schemas. Only `roster.json` loses its `status` field.

## Migration vs Factory Graph: Key Differences

Even after this shift, the factory's graph will differ from migration's in important ways:

| Dimension | Migration Slice | Factory Production Task |
|---|---|---|
| What the task produces | Migrated code (source transformation) | Agent prompt, skill, schema, or doc (content generation) |
| Scope definition | Source files + target pattern | Constraint refs into design artifacts |
| Invariants | Inlined from behavior-matrix | Referenced by ID from domain-model |
| Verification | Oracle-based parity checking | Hook-based structural/content validation |
| Task granularity | One slice ≈ one coder session of code changes | One task ≈ one prompt file or one skill or one schema |
| Dependency depth | Can be arbitrarily deep (long migration chains) | Typically shallow (specialist → coordinator → orchestrator → docs → bootstrap) |

The structural pattern is the same. The domain semantics are different because the factory produces prompts and infrastructure, not migrated code.

## Implementation Phases

### Phase 1: Schema and Planner
- Define `production-graph.json` schema (based on the schema above).
- Create `fractal-factory-production-graph-planner.agent.md` — reads constraint artifacts, emits the graph.
- Update `fractal-factory-planning-coordinator.agent.md` — dispatch production-graph-planner after routing-planner.

### Phase 2: Execution Rewrite
- Rewrite `fractal-factory-execution-coordinator.agent.md` from batch-loop to dependency-gated task selection.
- Update `fractal-factory-prompt-writer.agent.md` — single-task mode with constraint-ref reading.
- Update `fractal-factory-prompt-reviewer.agent.md` — per-task acceptance criteria + verification hooks.

### Phase 3: Verification Shift
- Define verification hooks as a per-task concept.
- Demote checklist-validator and audit-oracle to final cross-reference checks.
- Update verification-coordinator to run task-level hooks inline during execution.

### Phase 4: Gap-Hunting Graph Mutation
- Rewrite gap hunters to add/annotate tasks in the production graph.
- Remove pass-reset logic from the session orchestrator.
- Update gap-hunting-coordinator to aggregate graph mutations.

### Phase 5: Roster Cleanup
- Remove `status` lifecycle field from `roster.json` schema and roster-planner output.
- Remove roster-status recomputation from session orchestrator.
- Update progress.json to track graph-level completion instead of roster lifecycle counts.

## Risk Assessment

**Increased planning complexity.** The production-graph-planner must generate correct dependency edges. If edges are wrong, execution deadlocks or produces agents in the wrong order. Mitigation: the dependency rules above are simple and mechanical (hierarchy-driven), not domain-inferential.

**Larger context per task.** Each task carries constraint refs that the writer must dereference. If the constraint artifacts are large, this could push context limits. Mitigation: refs are IDs, not copied content. The writer reads only the specific entries it needs.

**Loss of batch efficiency.** Writing one prompt per invocation instead of batches increases round trips. Mitigation: acceptable trade-off for better failure locality and per-task verification. Batch mode collapsed review accountability — per-task mode makes both the writer and reviewer accountable for one specific output.

**Migration away from proven code.** The current batch loop works. Replacing it risks introducing new bugs. Mitigation: implement incrementally — the graph can coexist with the current execution model during transition by having the execution coordinator fall back to batch mode if the graph is absent.
