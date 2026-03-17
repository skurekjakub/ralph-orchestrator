# Phase 2: Factory Agent Updates

**Goal**: Update the factory agents that plan produced systems — artifact-designer, roster-planner, and routing-planner — to enforce analysis pass infrastructure whenever Pass 2 is included.
**Dependencies**: Phase 1 (pipeline-architect now treats Pass 2 as default-on).
**Outputs consumed by**: Phase 3 (produced-agent schema references the analysis specialist patterns these agents will instantiate).

---

## Tasks

### 2.1 — Update artifact-designer: mandatory analysis artifacts

**File**: `.fractals/fractal-factory/agents/fractal-factory-artifact-designer.agent.md`

The artifact-designer currently lists analysis outputs as one bullet among many:

```
- **Analysis outputs**: behavior matrices, dependency graphs, invariant maps
```

Add a new step between Step 1 (Identify Required Artifacts) and Step 2 (Design Each Artifact Schema):

```markdown
### Step 1.5: Ensure Analysis Artifacts (when Pass 2 is included)

If `architecture.json.pipeline.passes` includes a pass with `name: "analysis"`, the following domain-specific artifacts are MANDATORY:

| Artifact | Purpose | Written By | Read By |
|---|---|---|---|
| `analysis-matrix.json` | Per-item behavioral property extraction with domain-specific categories + invariants | Analysis specialist(s) | Planning specialists, execution specialists, verification specialists |
| `dependency-graph.json` | Directed dependency graph between discovered items with typed edges and clusters | Dependency analyzer | Planning specialists (for task ordering), gap hunter (for coverage checking) |

The analysis-matrix schema must include:
- A per-item entry keyed by the inventory's item ID scheme
- Domain-specific extraction categories (defined from the pipeline pass purpose — e.g., state transitions for migration, attack vectors for security)
- An `invariants` array per item (mandatory regardless of domain)
- An `analysisNotes` free-text field per item
- `analyzedBy` and `analyzedAt` provenance fields per item

The dependency-graph schema must include:
- Nodes referencing inventory item IDs
- Typed directed edges (edge types are domain-specific — e.g., `depends-on`, `uses`, `shares-data` for migration; `enables-exploit`, `mitigates` for security)
- Clusters grouping tightly-coupled items
```

**Acceptance Criteria**:
- [ ] Step 1.5 exists, conditioned on Pass 2 being in the pipeline
- [ ] `analysis-matrix.json` schema requirements documented with mandatory `invariants` array
- [ ] `dependency-graph.json` schema requirements documented with typed edges and clusters
- [ ] Existing steps renumbered (old Step 2 → Step 2, etc. — no functional change)

### 2.2 — Update roster-planner: mandatory analysis agents

**File**: `.fractals/fractal-factory/agents/fractal-factory-roster-planner.agent.md`

The roster-planner's Step 4 currently has a generic "Analysis specialists" section:

```
**Analysis specialists** (based on invariant types and complexity):
- Behavioral analyzer, dependency mapper, risk assessor
- Name pattern: `{namingPrefix}-{analysis-type}-analyzer`
```

Replace with a two-part structure:

```markdown
**Analysis specialists** (mandatory when Pass 2 is included):

When `architecture.json.pipeline.passes` includes analysis, plan at minimum:

1. **Domain analysis specialist(s)** — at least one specialist that extracts behavioral properties from discovered items into `analysis-matrix.json`. For complex domains with multiple subdomains, plan one analysis specialist per subdomain cluster. Name pattern: `{namingPrefix}-{domain-qualifier}-analyzer` (e.g., `migration-semantics-analyzer`, `security-threat-modeler`, `test-gen-behavior-extractor`).

2. **Dependency analyzer** — exactly one specialist that builds the dependency graph from the analysis matrix and source material into `dependency-graph.json`. Name pattern: `{namingPrefix}-dependency-analyzer`.

Both must have `antiLaziness: true` for the invariant extraction component — zero invariants for a discovered item is suspicious.

**Analysis specialists** (optional enrichment):
- Risk assessor, complexity scorer, cross-cutting concern detector
- Include when the domain model has high invariant counts (>15) or many cross-cutting subdomains
- Name pattern: `{namingPrefix}-{analysis-type}-analyzer`
```

**Acceptance Criteria**:
- [ ] Mandatory minimum: 1 domain analysis specialist + 1 dependency analyzer when Pass 2 present
- [ ] `antiLaziness: true` required for analysis specialists
- [ ] Optional enrichment analysts listed separately
- [ ] Name pattern examples tied to real domains from pipeline-design.md

### 2.3 — Update routing-planner: analysis coordinator mode detection

**File**: `.fractals/fractal-factory/agents/fractal-factory-routing-planner.agent.md`

The routing-planner already supports dual-mode coordinators with mode detection. No structural change needed, but add a concrete example for the analysis/planning dual-mode pattern in the "Dual-mode coordinators" section or its guidance:

After the existing dual-mode coordinator template, add:

```markdown
**Analysis + Planning coordinator (canonical pattern)**:
When the planning coordinator owns both Pass 2 (Analysis) and Pass 3 (Planning), use this mode detection:
```
| Condition | Mode | Dispatch Chain |
| analysis-matrix.json missing | analysis mode | dispatch domain-analyzer(s) sequentially → dispatch dependency-analyzer |
| analysis-matrix.json exists, task-graph.json missing | planning mode | dispatch task-planner → dispatch risk-analyzer |
| both exist | already-complete | return |
```

The analysis artifacts (`analysis-matrix.json`, `dependency-graph.json`) are the mode boundary: their existence signals that analysis is complete and planning can begin.
```

**Acceptance Criteria**:
- [ ] Canonical analysis+planning mode detection example added
- [ ] Mode boundary defined by analysis artifact existence
- [ ] Example uses actual artifact names from artifact-designer's mandatory list
- [ ] Existing routing patterns unchanged
