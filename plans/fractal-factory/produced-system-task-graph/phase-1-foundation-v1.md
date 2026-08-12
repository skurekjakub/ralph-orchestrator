# Phase 1: Foundation — Produced Task Graph Schema

**Version**: v1
**Goal**: Define the task-graph.json schema that produced systems will use, and update the orchestrator skill's artifact contracts to include it.
**Dependencies**: None
**Outputs consumed by**: Phase 2, Phase 3, Phase 4

---

## Context

Produced systems currently have no standard task graph artifact. The migration fractal defines its own ad-hoc task-graph.json. This phase creates a canonical schema that the factory will use as the reference when generating planner specialists and execution coordinators.

The schema is informed by three sources:
1. The migration's `task-graph.json` (`.fractals/migration/migration-slice-planner.agent.md` — the slice structure)
2. The factory's own `production-graph.schema.md` (the dependency-gated execution pattern)
3. The orchestrator skill's `artifact-contracts.md` (the generic artifact reference)

---

## Tasks

### 1.1 — Create produced-task-graph.schema.md

**New file**: `.fractals/fractal-factory/schemas/produced-task-graph.schema.md`

The factory needs a schema document that defines the task graph artifact produced systems will use. This is what the prompt-writer references when generating planner specialists and execution coordinators.

**Changes**:

1. **Schema definition**: A domain-generic task graph schema. Key differences from the factory's production-graph.schema.md:
   - Uses `tasks` as the array name with `T-nnn` IDs
   - No `rosterAgentIds` — produced systems don't have a factory-style roster at runtime
   - No `verificationHooks` — verification is per-oracle, not per-hook-type
   - Adds `scope` block with `sourceFiles`, `targetPattern`, `boundaryNotes` — essential for the coder to understand boundaries
   - Adds `invariants` array — inline invariants from analysis, not cross-referenced by ID
   - Adds `verificationOracles` array — which oracle types apply (`journey`, `contract`, `data-parity`, etc.)
   - Adds `gapAnnotations` array — gap hunters write reports referencing task IDs; the planner reads reports and updates annotations here during re-dispatch

```json
{
  "version": 1,
  "lastUpdated": "<ISO-8601-UTC>",
  "summary": {
    "totalTasks": 0,
    "byStatus": {
      "planned": 0,
      "in-progress": 0,
      "implemented": 0,
      "verified": 0,
      "blocked": 0,
      "failed-parity": 0
    }
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "<descriptive task name>",
      "description": "<what this task produces and why>",
      "featureIds": ["<IDs from the domain inventory that this task covers>"],
      "dependsOn": ["<T-nnn IDs that must be verified before this task can start>"],
      "status": "planned | in-progress | implemented | verified | blocked | failed-parity",
      "priority": "<number, lower = higher priority>",
      "scope": {
        "sourceFiles": ["<paths to source files this task reads>"],
        "targetPattern": "<architecture description of the target output>",
        "boundaryNotes": "<what is explicitly NOT in scope>"
      },
      "acceptanceCriteria": [
        "<criterion 1 — specific, verifiable>",
        "<criterion 2>"
      ],
      "invariants": [
        "<behavioral invariant copied from analysis — inline, not by reference>"
      ],
      "verificationOracles": ["<oracle type: journey | contract | visual | data-parity | auth-parity | error-parity>"],
      "addedBy": "<agent name — planner for all tasks, including gap-driven additions>",
      "addedInCycle": 0,
      "gapAnnotations": [
        {
          "annotatedBy": "<planner agent name (applied from gap report)>",
          "cycle": 1,
          "description": "<what gap was found>",
          "severity": "critical | warning",
          "suggestedFix": "<how to address the gap>"
        }
      ]
    }
  ]
}
```

2. **Status lifecycle diagram**:

```
planned ──→ in-progress ──→ implemented ──→ verified
  │              │                │
  │              │                └──→ failed-parity ──→ in-progress (retry)
  │              │
  │              └──→ blocked (dependency unresolvable or max retries exhausted)
  │
  └──→ blocked (dependency slice is blocked)
```

3. **Dependency rules**: All `dependsOn` tasks must be `verified` before a task is eligible.

4. **Summary recomputation**: After every status transition, recompute `summary.byStatus` from the actual tasks array.

5. **Gap-hunting integration**: Gap hunters produce a side-channel gap report (e.g., `gap-report.json`) referencing task IDs and describing findings. The planner is re-dispatched to read the gap report and mutate the task graph: adding new tasks, annotating existing tasks with `gapAnnotations`, or resetting task status. The `addedBy` field is always the planner, and `addedInCycle` tracks which gap-hunting cycle triggered the addition.

**Acceptance Criteria**:
- [ ] Schema is self-contained (no references to factory-internal artifacts like roster.json)
- [ ] Status lifecycle matches the migration's established pattern
- [ ] `scope`, `invariants`, and `verificationOracles` fields are documented with clear purpose descriptions
- [ ] Schema includes examples for at least two task entries showing dependency edges
- [ ] `addedBy` and `addedInCycle` fields support gap-hunting-driven planner re-dispatch
- [ ] `gapAnnotations` field is documented with the gap-report → planner → graph mutation workflow

---

### 1.2 — Update artifact-contracts.md in orchestrator skill

**File**: `.github/skills/agent-fractal-orchestrator-architecture/references/artifact-contracts.md`

The orchestrator skill's artifact contracts reference lists `<task-graph>.json` as a domain-specific artifact. This needs to be promoted to a first-class artifact with a canonical schema — not left as a "design per domain" placeholder.

**Changes**:

1. **Add task-graph.json to the universal artifact table**: Move it from the "domain-specific" category to a required artifact alongside `context.json`, `progress.json`, `manifest.json`. It is no longer optional — every fractal system that has Pass 3 (Planning) + Pass 4 (Execution) produces a task graph.

2. **Add schema description**: Reference the canonical schema from `produced-task-graph.schema.md`. Include the slice node structure, status lifecycle, and dependency rules inline (or as a clear cross-reference).

3. **Update the directory structure example**: Add `task-graph.json` to the tree with a clear description.

4. **Update progress.json example**: Show that `counts.unitsPlanned`, `counts.unitsImplemented`, `counts.unitsVerified` map to `task-graph.json.summary.byStatus`.

**Acceptance Criteria**:
- [ ] `task-graph.json` appears in the universal artifact directory structure
- [ ] Schema is described or cross-referenced (not left as "design per domain")
- [ ] `progress.json` counts section references the task graph as its truth-of-record for unit counts
- [ ] Existing domain-specific artifacts section still works for true domain-specific artifacts (inventory, matrix, etc.)

---

### 1.3 — Update pipeline-design.md in orchestrator skill

**File**: `.github/skills/agent-fractal-orchestrator-architecture/references/pipeline-design.md`

The pipeline design guide's Pass 3 (Planning) section currently says "decompose into units of work" generically. It should now reference the canonical task graph and the planner specialist pattern.

**Changes**:

1. **Update Pass 3 description**: Reference the task graph as the output artifact. Name the planner specialist as a required agent for Pass 3.

2. **Update Pass 4 description**: Reference dependency-gated task selection from the task graph. The execution coordinator selects the next eligible slice (status=planned, all dependsOn=verified).

3. **Update the "Pass 4 Internal Loop" section**: Already describes the coder-reviewer loop per slice with a dependency gate — this is correct but should explicitly reference `task-graph.json` as the state artifact (not just "slices").

**Acceptance Criteria**:
- [ ] Pass 3 references task-graph.json as its output artifact
- [ ] Pass 4 references task-graph.json for dependency-gated slice selection
- [ ] The "Pass 4 Internal Loop" section names `task-graph.json` explicitly
