# Test Planning Output

## Summary

Created **21 golden test scenarios** for the romantic-fantasy-writer agent system.

### Scenario Distribution

| Priority | Count |
|----------|-------|
| P0 (must pass for function) | 7 |
| P1 (should pass for production) | 11 |
| P2 (nice to have) | 3 |

### Category Coverage

| Category | Scenarios |
|----------|-----------|
| happy-path | 2 |
| auditor-rejection | 2 |
| convergence-exhaustion | 2 |
| re-entry | 1 |
| per-chapter-iteration | 2 |
| cross-cutting-agents | 3 |
| edge-case | 3 |
| specialist-behavior | 2 |
| coordinator-routing | 2 |
| revision-beta-loop | 2 |

## Test Scenario Table

| ID | Name | Category | Priority |
|----|------|----------|----------|
| TEST-001 | Happy path full pipeline single chapter | happy-path | P0 |
| TEST-002 | Happy path multi-chapter book | happy-path | P0 |
| TEST-003 | Auditor rejection concept phase retry | auditor-rejection | P0 |
| TEST-004 | Auditor rejection drafting chapter retry | auditor-rejection | P1 |
| TEST-005 | Convergence exhaustion worldbuilding blocked | convergence-exhaustion | P0 |
| TEST-006 | Convergence exhaustion revision-beta loop | convergence-exhaustion | P1 |
| TEST-007 | Re-entry from gap hunting | re-entry | P1 |
| TEST-008 | Per-chapter iteration drafting 5 chapters | per-chapter-iteration | P1 |
| TEST-009 | Per-chapter iteration chapter 3 blocks | per-chapter-iteration | P1 |
| TEST-010 | Cross-cutting craft-tracker initialization | cross-cutting-agents | P1 |
| TEST-011 | Cross-cutting continuity-tracker verification | cross-cutting-agents | P1 |
| TEST-012 | Cross-cutting series-kb-manager updates | cross-cutting-agents | P1 |
| TEST-013 | Edge case empty story idea | edge-case | P1 |
| TEST-014 | Edge case no style references | edge-case | P2 |
| TEST-015 | Edge case missing chapter outline | edge-case | P1 |
| TEST-016 | Specialist geography-builder creates map | specialist-behavior | P2 |
| TEST-017 | Specialist romance-arc-designer dual arc | specialist-behavior | P2 |
| TEST-018 | Coordinator routing worldbuilding sub-coordinators | coordinator-routing | P1 |
| TEST-019 | Coordinator routing drafting creative-writing | coordinator-routing | P1 |
| TEST-020 | Revision-beta loop one cycle | revision-beta-loop | P0 |
| TEST-021 | Revision-beta loop no revision needed | revision-beta-loop | P0 |

## Coverage Analysis

### Coordinator Coverage

All 9 coordinators are covered across test scenarios:

1. **concept-coordinator** — TEST-001, TEST-002, TEST-003, TEST-013
2. **worldbuilding-coordinator** — TEST-001, TEST-002, TEST-005, TEST-018
3. **character-coordinator** — TEST-001, TEST-002, TEST-007
4. **plotting-coordinator** — TEST-001, TEST-002
5. **style-coordinator** — TEST-001, TEST-002, TEST-014
6. **drafting-coordinator** — TEST-001, TEST-002, TEST-004, TEST-008, TEST-009, TEST-015, TEST-019
7. **revision-coordinator** — TEST-001, TEST-002, TEST-009, TEST-020, TEST-021
8. **beta-reading-coordinator** — TEST-001, TEST-002, TEST-006, TEST-020, TEST-021
9. **polish-coordinator** — TEST-001, TEST-002

### Auditor Loop Coverage

- **Coordinator-level auditor gates**: TEST-003 (concept), TEST-004 (drafting), TEST-005 (worldbuilding)
- **Convergence bound testing**: TEST-005 (maxAuditorRetries=3), TEST-006 (maxRevisionBetaCycles=2)
- **Retry success**: TEST-003, TEST-004
- **Retry exhaustion**: TEST-005, TEST-009

### Per-Chapter Iteration Coverage

- **Drafting iteration**: TEST-002 (3 chapters), TEST-008 (5 chapters)
- **Revision iteration**: TEST-002, TEST-009 (blocking mid-iteration)
- **Beta-reading iteration**: TEST-002
- **Checkpoint behavior**: TEST-008 (maxChaptersBeforeCheckpoint=5)

### Cross-Cutting Agent Coverage

1. **craft-tracker** — TEST-010 (initialization after style phase)
2. **continuity-tracker** — TEST-011 (full verification after drafting)
3. **series-kb-manager** — TEST-012 (update after polish)

### Revision↔Beta Loop Coverage

- **No loop** (approved on first beta): TEST-021
- **One loop** (revision-required once): TEST-020
- **Two loops** (revision-required twice, hitting max): TEST-006

### Edge Case Coverage

- **Empty inputs**: TEST-013 (empty story idea blocks concept)
- **Missing inputs**: TEST-014 (no style references, uses fallback)
- **Missing artifacts**: TEST-015 (missing chapter outline blocks drafting)

### Specialist Behavior Spot Checks

- **geography-builder**: TEST-016
- **romance-arc-designer**: TEST-017

### Sub-Coordinator Routing

- **Worldbuilding hierarchy**: TEST-018 (physical-world + systems-world coordinators)
- **Drafting hierarchy**: TEST-019 (creative-writing + quality-integration coordinators)

## Invariant Coverage

The test scenarios reference these invariants:

- **INV-001** (Genre Promise: romantic fantasy) — TEST-001, TEST-003, TEST-013, TEST-017
- **INV-002** (Internal Consistency) — TEST-001, TEST-002, TEST-005, TEST-009, TEST-011, TEST-012, TEST-016, TEST-018
- **INV-003** (Character Voice Distinctness) — TEST-001, TEST-002, TEST-007, TEST-008, TEST-014, TEST-019
- **INV-004** (Earned Emotional Beats) — TEST-001, TEST-006, TEST-017, TEST-020, TEST-021
- **INV-005** (Show Don't Tell) — TEST-004, TEST-008, TEST-010, TEST-019
- **INV-006** (Continuity Across Chapters) — TEST-002, TEST-009
- **INV-007** (Artifact Dependencies) — TEST-015

## Notable Gaps

None identified. All coordinator types, auditor loops, convergence bounds, per-chapter iteration patterns, cross-cutting agents, and orchestrator-level loops are covered.

## Implementation Notes

### Per-Chapter Scenarios

Several scenarios (TEST-002, TEST-008, TEST-009, TEST-011) test per-chapter iteration behavior. The produced system must:

- Iterate drafting/revision/beta-reading independently for each chapter
- Handle chapter-level blocking (TEST-009: stops iteration when chapter blocks)
- Maintain state across chapters (currentChapter counter)
- Create checkpoints at maxChaptersBeforeCheckpoint boundary (TEST-008)

### Convergence Bound Enforcement

Two levels of convergence:

1. **Coordinator-level** (maxAuditorRetries=3): TEST-003, TEST-004, TEST-005, TEST-009
2. **Orchestrator-level** (maxRevisionBetaCycles=2): TEST-006, TEST-020, TEST-021

### Cross-Cutting Agent Timing

- **craft-tracker**: Runs after style phase, before drafting (TEST-010)
- **continuity-tracker**: Runs after drafting completes, before revision (TEST-011)
- **series-kb-manager**: Runs after polish, as final step (TEST-012)

### Error Propagation

TEST-015 tests error propagation: creative-writing-coordinator blocks → drafting-coordinator blocks → orchestrator fails drafting phase.

## Verification Checklist

For each scenario, verification should confirm:

1. ✓ Correct result code returned
2. ✓ Expected artifacts created
3. ✓ Retry/loop counters match expected values
4. ✓ Convergence bounds respected
5. ✓ Error messages are clear and actionable
6. ✓ No agents skipped in the pipeline
7. ✓ Status.json files reflect correct state

## Recommended Test Execution Order

1. **Phase 1: Happy paths** (TEST-001, TEST-002) — verify basic pipeline works
2. **Phase 2: Auditor loops** (TEST-003, TEST-004, TEST-005) — verify retry logic
3. **Phase 3: Per-chapter iteration** (TEST-008, TEST-009) — verify chapter handling
4. **Phase 4: Cross-cutting agents** (TEST-010, TEST-011, TEST-012) — verify integration
5. **Phase 5: Revision-beta loop** (TEST-020, TEST-021, TEST-006) — verify orchestrator loop
6. **Phase 6: Edge cases** (TEST-013, TEST-014, TEST-015) — verify error handling
7. **Phase 7: Spot checks** (TEST-007, TEST-016, TEST-017, TEST-018, TEST-019) — verify details

---

**Deliverable**: `.fractal-factory/test-plan.json` with 21 comprehensive test scenarios covering all agent types, convergence bounds, iteration patterns, and edge cases for the romantic-fantasy-writer system.
