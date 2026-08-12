# Phase 4: Verification & Consistency

**Goal**: Cross-reference all changes for internal consistency and verify no regressions in the factory's existing pipeline.
**Dependencies**: Phases 1–3 (all changes landed).
**Outputs consumed by**: None — this is the final phase.

---

## Tasks

### 4.1 — Verify pipeline-design.md domain examples all include Analysis

**File**: `.github/skills/agent-fractal-orchestrator-architecture/references/pipeline-design.md`

Read all four domain mapping example tables (Codebase Migration, Security Audit, Test Suite Generation, Documentation Overhaul) and confirm each has an Analysis row. Currently all four do — this is a regression check after Phase 1 edits.

**Acceptance Criteria**:
- [ ] All four domain mapping examples include an Analysis row
- [ ] The reinforcement note after the examples is present
- [ ] No domain example accidentally had its Analysis row removed

### 4.2 — Cross-reference artifact-designer mandatory artifacts with roster-planner mandatory agents

Verify that:
- Every mandatory analysis artifact (`analysis-matrix.json`, `dependency-graph.json`) has a corresponding mandatory agent in the roster-planner that writes to it
- The roster-planner's domain analysis specialist reads the inventory and writes to `analysis-matrix.json`
- The roster-planner's dependency analyzer reads `analysis-matrix.json` and writes to `dependency-graph.json`

**Acceptance Criteria**:
- [ ] artifact-designer's `analysis-matrix.json` → roster-planner's domain analysis specialist (writer alignment confirmed)
- [ ] artifact-designer's `dependency-graph.json` → roster-planner's dependency analyzer (writer alignment confirmed)
- [ ] No orphan artifacts (artifacts with no writer) or orphan agents (agents with no artifact output)

### 4.3 — Verify produced-agent schema analysis specialist phases match artifact-designer schema

Confirm that the 4-phase analysis specialist workflow (Phase 3, task 3.1) produces output compatible with the analysis-matrix.json schema requirements (Phase 2, task 2.1):
- Phase 2 (deep extraction) produces per-item entries with domain-specific categories + invariants
- Phase 4 (write & validate) writes to `analysis-matrix.json` with the required fields: `invariants`, `analysisNotes`, `analyzedBy`, `analyzedAt`

**Acceptance Criteria**:
- [ ] Workflow phase outputs align with artifact schema fields
- [ ] Invariant extraction appears in both the workflow and the schema
- [ ] No field in the schema lacks a producing phase
