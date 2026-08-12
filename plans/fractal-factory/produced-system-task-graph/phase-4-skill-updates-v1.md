# Phase 4: Skill Reference Updates

**Version**: v1
**Goal**: Update the agent-fractal-orchestrator-architecture skill's reference files to reflect the task-graph-driven execution pattern as the standard.
**Dependencies**: Phase 1, Phase 2
**Outputs consumed by**: Phase 5

---

## Context

The `agent-fractal-orchestrator-architecture` skill is the primary reference material for designing new fractal agent systems. Its reference files define the patterns that the factory and human designers follow. Several references already describe the coder→reviewer loop and the "task graph" concept loosely, but they don't mandate `task-graph.json` as a canonical artifact or describe the planner specialist as a required agent.

---

## Tasks

### 4.1 — Update agent-prompt-template.md for planner and execution coordinator

**File**: `.github/skills/agent-fractal-orchestrator-architecture/references/agent-prompt-template.md`

The agent prompt template currently shows "Pure Router" and generic specialist variants. It needs the planner specialist and execution coordinator variants.

**Changes**:

1. **Add "Planner Specialist" variant**: After the generic specialist template, add a note that planner specialists use the standard progressive disclosure workflow skill with 5 phases:

```markdown
### Planner Specialist (Task Decomposition)

Planner specialists transform analysis outputs into a task graph. They use the 
standard progressive disclosure pattern — shared `{namingPrefix}-specialists-workflow` 
skill with per-specialist reference files under `references/{planner-name}/`.

5 workflow phases: enumerate → dependencies → invariants → criteria → validate.

On gap-hunting re-dispatch, the planner reads the gap report artifact and 
adds/annotates tasks in the existing task-graph.json.

Write Rules target `.<domain>/task-graph.json`.
```

2. **Add "Execution Coordinator (Graph-Driven)" variant**: After the Pure Router variant:

```markdown
### Execution Coordinator (Graph-Driven)

Execution coordinators add `## Task Selection` before the routing table. They read
`task-graph.json` to select slices by dependency readiness instead of dispatching
children in a fixed sequence.
```

**Acceptance Criteria**:
- [ ] Planner specialist variant is documented with required Process steps
- [ ] Execution coordinator variant is documented with Task Selection pattern
- [ ] Existing specialist and coordinator variants are unchanged

---

### 4.2 — Update agent-roster-template.md for planner specialist role

**File**: `.github/skills/agent-fractal-orchestrator-architecture/references/agent-roster-template.md`

The roster template's role mapping table needs the planner specialist.

**Changes**:

1. **Add planner to the Planning Specialists row**: Currently the table shows "1–3" planning specialists. Update to explicitly include "Slice/task-graph planner" as a required role:

```markdown
| Planning Specialists | 1–3 | Slice planner (decomposes items → task graph) + risk analyzer. Planner is required when Pass 3 is included. |
```

**Acceptance Criteria**:
- [ ] Planner specialist is listed as a required role when Pass 3 is included
- [ ] The description mentions task-graph.json as the output

---

### 4.3 — Update worked-example.md to reference task-graph pattern

**File**: `.github/skills/agent-fractal-orchestrator-architecture/references/worked-example.md`

The worked example should reference the task-graph-driven execution pattern so designers see a concrete example.

**Changes**:

1. **Update the execution pass section**: If the worked example shows Pass 4 (execution), update it to show the dependency-gated task selection from `task-graph.json`.

2. **Update the planning pass section**: If the worked example shows Pass 3 (planning), update it to show the planner specialist producing `task-graph.json`.

**Acceptance Criteria**:
- [ ] Worked example references task-graph.json in planning and execution passes
- [ ] Dependency-gated slice selection is shown (not just sequential dispatch)
