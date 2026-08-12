# Fractal Factory — Task-Graph Methodology Shift

## Purpose

Migrate the Fractal Factory from a pass-state + roster-lifecycle execution model to a production-graph-driven execution model. In the new model, `production-graph.json` becomes the central runtime object — the work queue, dependency model, verification contract, and re-entry surface — while `roster.json`, `architecture.json`, and `test-plan.json` become stateless design constraints that tasks reference by ID.

Additionally, extract invariants from `domain-model.json` into a dedicated `invariants/` directory with per-classification files for cleaner navigation and separation of concerns.

## Invariant Storage Decision

**Chosen: separate files per classification under `.fractal-factory/invariants/`.**

Structure:

```
.fractal-factory/invariants/
├── behavioral.json
├── structural.json
├── quality.json
└── workflow.json
```

Each file contains only the entries for that classification, with a standard envelope:

```json
{
  "classification": "behavioral",
  "lastUpdated": "<ISO-8601-UTC>",
  "entries": [ { "id": "INV-001", ... } ]
}
```

**Trade-off analysis:**

| Dimension | Separate files per classification | Single invariants.json |
|---|---|---|
| Human navigation | Better — browse by type | Worse — one large list |
| Agent reads when needing all | 4 reads instead of 1 | One read |
| Agent reads when needing one type | One targeted read | Read + filter |
| Write coordination | Invariant-extractor writes all 4 | One write |
| Cross-referencing by subdomain | Scan multiple files | Filter one file |
| Diff clarity | Cleaner — changes scoped to type | All changes in one file |

Separate files win on navigation clarity and diff scoping. The 4-read cost is acceptable because the invariant-extractor writes all files atomically during discovery, and consumers that need all invariants (coverage-hunter, prompt-writer) do targeted reads anyway. The classification-first layout also aligns with how the coverage-hunter naturally works — it checks enforcement by classification category.

## Phases

### Phase 0: Invariant Storage Restructuring (implement now)

Extract invariants from `domain-model.json` into `.fractal-factory/invariants/` and update all agents that read or write invariants.

### Phase 1: Production Graph Schema & Planner

Define the `production-graph.json` schema and create the `fractal-factory-production-graph-planner` agent. Update the planning coordinator to dispatch it after the routing planner.

### Phase 2: Execution Rewrite

Rewrite the execution coordinator from batch-loop to dependency-gated single-task selection from the production graph. Update the prompt-writer and prompt-reviewer for single-task mode with per-task acceptance criteria.

### Phase 3: Verification Shift

Move verification from a monolithic package-level pass to per-task hooks declared in the production graph. Demote the checklist-validator and audit-oracle to final cross-reference checks.

### Phase 4: Gap-Hunting Graph Mutation

Rewrite gap hunters to add/annotate task nodes in the production graph instead of producing a standalone gap-report that triggers pass resets. Remove pass-reset logic from the session orchestrator.

### Phase 5: Roster Cleanup

Remove the `status` lifecycle field from `roster.json`. Update `progress.json` to track graph-level completion instead of roster lifecycle counts.

## Dependencies

```
Phase 0 (can start immediately — no dependencies on other phases)
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```

Phase 0 is independent and should be implemented first. Phases 1–5 are sequential because each builds on the previous phase's artifacts.

## Source Documents

- Analysis: `.fractals/fractal-factory-task-graph-methodology-shift.md`
- Comparison: `.fractals/migration-vs-fractal-factory-workflow-report.md`
