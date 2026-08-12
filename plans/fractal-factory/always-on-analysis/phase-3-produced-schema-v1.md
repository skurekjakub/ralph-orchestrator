# Phase 3: Produced Agent Schema & Template

**Goal**: Update the produced-agent schema and template to provide concrete guidance for writing analysis specialists and their associated coordinator patterns.
**Dependencies**: Phase 1 (pipeline rules), Phase 2 (factory agents know what analysis infrastructure to plan).
**Outputs consumed by**: Phase 4 (verification checks reference these schema rules).

---

## Tasks

### 3.1 — Add analysis specialist type guidance to produced-agent.schema.md

**File**: `.fractals/fractal-factory/schemas/produced-agent.schema.md`

The schema currently has type-specific sections for: Specialist, Coordinator, Orchestrator. The Specialist section is generic — it doesn't distinguish between discovery, analysis, execution, or verification specialists.

Add a new subsection under "Type-Specific Sections → Specialist" specifically for analysis specialists:

```markdown
### Analysis Specialist (Specialist subtype)

Analysis specialists extract behavioral properties from discovered items. They read discovery output (inventory files) and produce structured analysis artifacts (analysis matrix, dependency graph). Every analysis specialist must:

1. **Extract invariants per item** — this is mandatory regardless of domain. Invariants are behavioral rules that must be preserved/implemented/verified downstream. Zero invariants for an item is suspicious and must be flagged.

2. **Extract domain-specific behavioral properties** — categories defined by the pipeline-architect (e.g., state transitions, validation rules, attack vectors, behavior specs). The categories vary; the structure (per-item property bag) is universal.

3. **Update inventory status** — after analyzing each item, update its status in the inventory artifact from `discovered` to `analyzed`.

4. **Include anti-laziness rules** — analysis specialists must document their analysis methodology per item. "No findings" requires explicit justification.

The workflow for analysis specialists follows the standard progressive disclosure pattern but with these mandatory phases:

| Phase | Purpose |
|---|---|
| 1. Read & orient | Read inventory, understand item scope |
| 2. Deep extraction | Extract domain-specific properties + invariants per item |
| 3. Cross-reference | Identify cross-cutting patterns, shared invariants, implicit dependencies |
| 4. Write & validate | Write analysis matrix entries, update inventory status, validate completeness |

The dependency analyzer is a special case — it reads the analysis matrix (output of other analysis specialists) plus source material, and produces the dependency graph. Its phases are:

| Phase | Purpose |
|---|---|
| 1. Read analysis matrix | Understand what was extracted per item |
| 2. Trace relationships | Follow imports, data flow, event coupling, shared state between items |
| 3. Build graph | Create nodes, typed edges, compute clusters |
| 4. Write & validate | Write dependency-graph.json, update inventory dependencies, validate acyclicity |
```

**Acceptance Criteria**:
- [ ] "Analysis Specialist" subsection exists under Specialist type
- [ ] Mandatory invariant extraction documented as universal
- [ ] Domain-specific extraction categories documented as variable
- [ ] Anti-laziness requirement stated
- [ ] Canonical 4-phase workflow for both analysis specialists and dependency analyzer
- [ ] Inventory status progression (`discovered` → `analyzed`) documented

### 3.2 — Add analysis specialist example to produced-agent-template.md

**File**: `.fractals/fractal-factory/templates/produced-agent-template.md`

The template currently has "Type Variants" at the bottom listing Specialist, Coordinator, Orchestrator, and Adversarial. Add an Analysis Specialist variant:

```markdown
- **Analysis specialist**: Like standard specialist (use `## Skills` and `## Workflow`), but the workflow phases must include invariant extraction as a mandatory output. Add `## Anti-Laziness Rules` requiring per-item analysis documentation. The Write Rules must include both `analysis-matrix.json` and inventory status updates.
```

**Acceptance Criteria**:
- [ ] Analysis specialist listed in Type Variants
- [ ] Distinguishing features noted: mandatory invariant output, anti-laziness, dual write target
- [ ] Not a separate template — just variant guidance within the existing template

### 3.3 — Add analysis coordinator pattern to produced-agent.schema.md

**File**: `.fractals/fractal-factory/schemas/produced-agent.schema.md`

The Coordinator section shows a generic routing table. Add a note about the analysis+planning dual-mode coordinator pattern under the "Mode detection" mention:

```markdown
#### Analysis + Planning Coordinator (common pattern)

When analysis and planning are grouped under one coordinator (the default per pipeline-design.md), the coordinator uses mode detection based on analysis artifact existence:

- **Analysis mode**: `analysis-matrix.json` does not exist → dispatch analysis specialists sequentially, then dependency analyzer
- **Planning mode**: `analysis-matrix.json` exists, `task-graph.json` does not → dispatch planning specialists
- **Already complete**: both exist → write own status and return

This is the canonical dual-mode coordinator. The mode boundary is the analysis artifacts — their existence is the handoff signal from analysis to planning.
```

**Acceptance Criteria**:
- [ ] Analysis+Planning coordinator pattern documented under Coordinator type
- [ ] Mode detection based on artifact existence, not pass numbers
- [ ] Sequential dispatch for analysis specialists documented
- [ ] Pattern framed as "common" not "mandatory" (systems with separate coordinators are still valid)
