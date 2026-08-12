# Phase 2: Produced Agent Schema + Template

**Version**: v1
**Goal**: Update the produced-agent.schema.md and produced-agent-template.md so that factory-produced coordinators and orchestrators use task-graph-driven execution.
**Dependencies**: Phase 1 (the produced-task-graph.schema.md must exist to reference)
**Outputs consumed by**: Phase 3, Phase 4

---

## Context

The produced-agent.schema.md currently defines three agent types: specialist (progressive disclosure), coordinator (pure router with status-based routing table), and orchestrator (pipeline router). The execution coordinator pattern is implicit — it's just a coordinator with a specific routing table.

After this phase, the schema explicitly defines the **execution coordinator** as a coordinator subtype with graph-driven task selection, and the **orchestrator** recomputes progress from the task graph. A new **planner specialist** type is also defined.

---

## Tasks

### 2.1 — Add planner specialist type to produced-agent.schema.md

**File**: `.fractals/fractal-factory/schemas/produced-agent.schema.md`

Currently the schema defines specialists as leaf workers with progressive disclosure workflow phases. The planner specialist follows the same progressive disclosure pattern — it uses the shared `{namingPrefix}-specialists-workflow` skill with its own reference files, like any other specialist. Its workflow phases cover the task-graph creation pipeline.

**Changes**:

1. **Add "Planner Specialist" subsection** under "Type-Specific Sections", after the existing "Specialist (Leaf Worker)" section:

```markdown
### Planner Specialist

Planner specialists decompose analysis outputs into a task graph. They follow the standard specialist progressive disclosure pattern — shared workflow skill with per-specialist reference files under `references/{planner-name}/`.

Typical planner workflow phases:

| Phase | Summary |
|---|---|
| 1. Enumerate tasks | Read inventory + analysis, decompose items into dependency-ordered execution tasks |
| 2. Assign dependencies | Compute dependsOn edges, validate no forward references |
| 3. Inline invariants + scope | Copy invariants from analysis, define scope boundaries per task |
| 4. Acceptance criteria | Write verifiable criteria per task, assign verification oracles |
| 5. Validate + write | Feature ID validation, summary computation, write task-graph.json |

On gap-hunting re-dispatch, the planner reads the gap report artifact and adds/annotates
tasks in the existing task-graph.json rather than rewriting from scratch.

\```markdown
## Skills

| Skill | What it covers |
|---|---|
| `{namingPrefix}-specialists-workflow` | Family-level workflow router. Read SKILL.md, then this specialist's current phase reference. |

## Workflow

| Phase | Reference file | Summary |
|---|---|---|
| 1. Enumerate | references/{planner-name}/1-enumerate.md | Decompose inventory into execution tasks |
| 2. Dependencies | references/{planner-name}/2-dependencies.md | Compute dependency edges |
| 3. Invariants | references/{planner-name}/3-invariants.md | Inline invariants and scope boundaries |
| 4. Criteria | references/{planner-name}/4-criteria.md | Per-task acceptance criteria and oracles |
| 5. Validate | references/{planner-name}/5-validate.md | Feature ID validation, write task-graph.json |
\```

Must include:
- **Feature ID validation**: Before writing, validate that every featureId references an actual inventory item
- **Inline invariants**: Copy from analysis, don't cross-reference by ID
- **Scope boundaries**: Every task must have `scope.sourceFiles`, `scope.targetPattern`, `scope.boundaryNotes`
- **Acceptance criteria**: At least one verifiable criterion per task
- **Gap-hunting re-dispatch**: When re-dispatched after gap hunting, read the gap report and mutate existing task-graph.json
```

**Acceptance Criteria**:
- [ ] Planner specialist type is documented with progressive disclosure workflow phases
- [ ] Feature ID validation requirement is explicit
- [ ] Relationship to the produced-task-graph.schema.md is clear
- [ ] Uses the same `{namingPrefix}-specialists-workflow` skill pattern as other specialists
- [ ] Gap-hunting re-dispatch behavior is described (read gap report → mutate graph)

---

### 2.2 — Add execution coordinator graph-driven pattern to produced-agent.schema.md

**File**: `.fractals/fractal-factory/schemas/produced-agent.schema.md`

Currently the "Coordinator (Pure Router)" section shows a generic status-based routing table. The execution coordinator needs a specific pattern for graph-driven task selection.

**Changes**:

1. **Add "Execution Coordinator" subsection** under "Type-Specific Sections", after the "Coordinator (Pure Router)" section:

```markdown
### Execution Coordinator (Graph-Driven)

The execution coordinator is a coordinator subtype that selects work from `task-graph.json` rather than dispatching children in a fixed sequence. It runs the coder→reviewer loop per task.

\```markdown
## Task Selection

Read `.<domain>/task-graph.json`. Select the next task where:
1. `status` is `planned` OR `failed-parity`
2. ALL tasks in `dependsOn` have `status: verified`
3. If a dependency has `status: blocked`, cascade-block this task

Among eligible tasks, select the one with the lowest `priority` value.

## Routing Table

### Per-Task Loop

| Read | Condition | Action |
|---|---|---|
| `task-graph.json` | Eligible task exists | Set to `in-progress`, dispatch coder |
| `agents/<coder>/status.json` | `result: "implemented"` | Dispatch reviewer |
| `agents/<reviewer>/status.json` | `result: "approved"` | Set task `verified`, select next |
| `agents/<reviewer>/status.json` | `result: "rejected"` (retries < max) | Re-dispatch coder with feedback |
| `agents/<reviewer>/status.json` | `result: "rejected"` (retries >= max) | Set task `blocked`, select next |
| `task-graph.json` | No eligible tasks | Dispatch test-writer (if present), then complete |

### Task Lifecycle Per Iteration

1. Set `planned` → `in-progress`
2. Delete coder and reviewer status.json (fresh dispatch)
3. Dispatch coder with: task ID, description, scope, acceptanceCriteria, invariants
4. On coder completion, dispatch reviewer with: task ID, acceptanceCriteria, invariants
5. On approval: `in-progress` → `implemented` → `verified`, recompute summary
6. On rejection within limit: record attempt, re-dispatch coder with feedback
7. On rejection at limit: `blocked`, recompute summary, next task
\```

Must include:
- **Dependency gate**: Explicit check that all dependsOn are verified
- **Cascade blocking**: Auto-block tasks whose dependencies are blocked
- **Summary recomputation**: After every status change
- **Coder context passing**: Task's scope, criteria, and invariants must be passed
```

**Acceptance Criteria**:
- [ ] Execution coordinator is documented as a coordinator subtype (still follows Purity Rule)
- [ ] Task selection algorithm is explicit (dependency gate, priority ordering)
- [ ] Cascade blocking is specified
- [ ] Summary recomputation is required after each status transition
- [ ] Pattern matches the migration-execution-coordinator's structure

---

### 2.3 — Update orchestrator pattern for task-graph progress recomputation

**File**: `.fractals/fractal-factory/schemas/produced-agent.schema.md`

The orchestrator section needs to specify that progress.json counts come from task-graph.json.

**Changes**:

1. **Add "Progress Recomputation" requirement** to the Orchestrator section:

```markdown
## Progress Update

After each coordinator returns, recompute `progress.json` counts from actual artifacts:
- Read `.<domain>/task-graph.json.summary.byStatus` for execution unit counts
- Read `.<domain>/<inventory>.json` for discovery/analysis counts
- Update `progress.json.counts` to reflect current state
```

**Acceptance Criteria**:
- [ ] Orchestrator is instructed to derive progress from task-graph.json, not from coordinator summaries
- [ ] The progress recomputation references `byStatus` counts specifically

---

### 2.4 — Update produced-agent-template.md for new patterns

**File**: `.fractals/fractal-factory/templates/produced-agent-template.md`

The canonical template needs to reflect the planner specialist and execution coordinator variants.

**Changes**:

1. **Add planner specialist to Type Variants section**:

```markdown
- **Planner specialist**: Uses the standard `## Skills` and `## Workflow` progressive disclosure pattern with 5 phases (enumerate → dependencies → invariants → criteria → validate). Output is `task-graph.json`. On gap-hunting re-dispatch, reads gap report and mutates existing graph.
```

2. **Add execution coordinator to Type Variants section**:

```markdown
- **Execution coordinator**: Include `## Task Selection` before `## Routing Table`. The routing table references `task-graph.json` rather than a fixed child dispatch sequence.
```

3. **Update the orchestrator variant**: Add `## Progress Update` to the orchestrator template as a required section.

**Acceptance Criteria**:
- [ ] Type Variants section lists planner specialist and execution coordinator
- [ ] Planner specialist uses `## Skills`/`## Workflow` (progressive disclosure pattern)
- [ ] Execution coordinator has `## Task Selection` section
- [ ] Orchestrator variant includes `## Progress Update`
