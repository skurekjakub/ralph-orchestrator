# Phase 3: Factory Agent Updates

**Version**: v1
**Goal**: Update the factory's own agents that produce the output system — the production-graph-planner, routing-planner, prompt-writer, and prompt-reviewer — so they generate planner specialists and graph-driven execution coordinators.
**Dependencies**: Phase 2 (schema + template must be updated first)
**Outputs consumed by**: Phase 5

---

## Context

The factory agents need to "know about" the new produced patterns so they generate them correctly. The production-graph-planner creates tasks for the produced system's agents; the routing-planner designs routing tables; the prompt-writer materializes the `.agent.md` files; and the prompt-reviewer validates them.

---

## Tasks

### 3.1 — Update production-graph-planner to include planner specialist tasks

**File**: `.fractals/fractal-factory/agents/fractal-factory-production-graph-planner.agent.md`

The production-graph-planner's "Step 1: Enumerate All Deliverables" currently lists agent prompts, skills, schemas, bootstrap, docs, and test fixtures. It does not explicitly create a task for the planner specialist or the task graph schema in the produced system.

**Changes**:

1. **Add planner specialist to the enumeration**: Under "Agent prompts", add that the roster should include a planner specialist (e.g., `{namingPrefix}-slice-planner`) — the production-graph-planner should check if the roster contains a planner specialist and create a task for it with category `specialist-prompt`.

2. **Add produced task graph schema to "Schemas"**: Add a task for producing `produced-task-graph.schema.md` or a domain-specific task-graph schema doc as a `schema` category task. This ensures the produced system includes its own task-graph documentation.

3. **Update dependency edge rules**: Add that the planner specialist prompt task depends on all analysis specialist prompt tasks (the planner reads their outputs). Add that the execution coordinator task reference the planner's output.

```markdown
**Planner specialist prompts** depend on all analysis specialist prompt tasks (the planner reads analysis outputs that specialists produce)
**Execution coordinator prompts** depend on the planner specialist prompt task (the execution coordinator reads the task graph that the planner produces)
```

**Acceptance Criteria**:
- [ ] Planner specialist is enumerated as a deliverable when present in roster
- [ ] Task graph schema is enumerated as a schema deliverable
- [ ] Dependency edges correctly express planner → analysis specialists, execution coordinator → planner
- [ ] No change to the production graph's own schema (factory-internal stays as-is)

---

### 3.2 — Update routing-planner for graph-driven execution coordinator routing

**File**: `.fractals/fractal-factory/agents/fractal-factory-routing-planner.agent.md`

The routing-planner currently designs routing tables for all coordinators. The "Loop coordinators (coder→reviewer pattern)" section already references "select exactly one eligible task per iteration from the execution graph." This needs to be made more explicit for the task-graph.json pattern.

**Changes**:

1. **Update the loop coordinator section**: Replace the generic "select exactly one eligible task" language with explicit reference to the produced system's `task-graph.json`:

```markdown
**Graph-driven execution coordinators** (task-graph dependency-gated loop):
```
| Read | Condition | Action |
| task-graph.json | Eligible task (planned/failed-parity, deps verified) | Select by priority, set in-progress, dispatch coder |
| agents/{coder}/status.json | result: "implemented" | Dispatch reviewer with task ID |
| agents/{reviewer}/status.json | result: "approved" | Set task verified, recompute summary, delete child statuses, select next |
| agents/{reviewer}/status.json | result: "rejected" (retries < max) | Record retry, re-dispatch coder with feedback |
| agents/{reviewer}/status.json | result: "rejected" (retries >= max) | Set task blocked, select next |
| task-graph.json | No eligible tasks | Complete |
```

2. **Update the orchestrator routing table section**: Add that the orchestrator's routing table should include a Progress Recomputation step after each coordinator returns, referencing `task-graph.json.summary.byStatus`.

**Acceptance Criteria**:
- [ ] Graph-driven execution coordinator is a distinct pattern from sequential coordinators
- [ ] The routing table explicitly references `task-graph.json` as the state artifact
- [ ] Dependency gate, cascade blocking, and summary recomputation are specified
- [ ] Orchestrator progress recomputation references the task graph

---

### 3.3 — Update prompt-writer for planner specialist and execution coordinator generation

**File**: `.fractals/fractal-factory/agents/fractal-factory-prompt-writer.agent.md`

The prompt-writer needs to handle two new produced agent types: planner specialists and graph-driven execution coordinators.

**Changes**:

1. **Add planner specialist handling**: In the "Step 3: Apply the Universal Template" section, add guidance for when `category` is `specialist-prompt` and the roster entry is a planner:

```markdown
**For planner specialists** (identified by the roster entry having a planner role or the task's description referencing task-graph decomposition):
- Use the standard `## Skills` and `## Workflow` progressive disclosure pattern with the shared specialists-workflow skill
- Define 5 workflow phases: enumerate → dependencies → invariants → criteria → validate
- Write Rules must reference `.<domain>/task-graph.json` with the produced task graph schema
- Inputs must include the domain inventory, analysis matrix, and dependency graph
- Include gap-hunting re-dispatch behavior: when re-dispatched, read gap report and mutate existing graph
```

2. **Add execution coordinator handling**: Add guidance for when the coordinator is an execution coordinator:

```markdown
**For execution coordinators** (identified by the roster entry being assigned to Pass 4 / execution pass):
- Add a `## Task Selection` section before the routing table
- Task selection reads `.<domain>/task-graph.json`, selects slices by dependency readiness and priority
- Routing table uses the graph-driven pattern from produced-agent.schema.md
- Write Rules include task-graph.json (status transitions, summary recomputation)
```

3. **Update orchestrator handling**: Add the Progress Recomputation section to the orchestrator template in the prompt-writer.

**Acceptance Criteria**:
- [ ] Prompt-writer knows to use `## Process` for planner specialists
- [ ] Prompt-writer knows to add `## Task Selection` for execution coordinators
- [ ] Prompt-writer generates task-graph.json references in Write Rules for both types
- [ ] Orchestrator generation includes `## Progress Update` section

---

### 3.4 — Update prompt-reviewer for task-graph pattern validation

**File**: `.fractals/fractal-factory/agents/fractal-factory-prompt-reviewer.agent.md`

The prompt-reviewer validates produced agent prompts against the schema. It needs to check the new patterns.

**Changes**:

1. **Add planner specialist validation**: The reviewer should check that planner specialists have a `## Process` section (not `## Skills`/`## Workflow`), reference the task-graph.json in Write Rules, and include feature ID validation in their process.

2. **Add execution coordinator validation**: The reviewer should check that execution coordinators have a `## Task Selection` section, reference `task-graph.json` in their routing table, include dependency gate logic, and have cascade blocking.

3. **Add orchestrator progress validation**: Check that the orchestrator includes a `## Progress Update` section referencing `task-graph.json`.

**Acceptance Criteria**:
- [ ] Reviewer checks planner specialist structure (Process section, task-graph output)
- [ ] Reviewer checks execution coordinator structure (Task Selection, graph-driven routing)
- [ ] Reviewer checks orchestrator Progress Update section
- [ ] Existing validation rules for standard specialists and coordinators are unchanged

---

### 3.5 — Update roster-planner to require planner specialist for Pass 3

**File**: `.fractals/fractal-factory/agents/fractal-factory-roster-planner.agent.md`

The roster-planner's Step 4 ("Plan Specialists") lists planning specialists generically: "Decomposer, dependency analyzer, risk analyzer, test planner." It should explicitly require a task-graph planner specialist when Pass 3 is enabled.

**Changes**:

1. **Update Planning specialists section**: Make the task-graph planner a required role (not just one of many generic examples):

```markdown
**Planning specialists** (task decomposition and ordering):
- Task-graph planner (REQUIRED for Pass 3) — decomposes analysis outputs into task-graph.json via progressive disclosure workflow
- Risk analyzer — per-task risk assessment
- Name pattern: `{namingPrefix}-{role}`
```

2. **Update reads/writes**: The planner specialist's `reads` should include the domain inventory, analysis matrix, and dependency graph. Its `writes` should include `task-graph.json`. Add `gap-report.json` to reads for re-dispatch scenarios.

3. **Add gap-hunting re-dispatch note**: Mention that the planner may be re-dispatched after gap hunting to read the gap report and mutate the existing task graph.

**Acceptance Criteria**:
- [ ] Planning specialists section explicitly names a task-graph planner as required for Pass 3
- [ ] Planner reads/writes correctly list analysis artifacts as inputs and task-graph.json as output
- [ ] Gap-hunting re-dispatch is mentioned as a planner capability
