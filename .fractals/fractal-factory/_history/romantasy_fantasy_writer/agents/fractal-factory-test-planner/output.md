# Test Planner Output — Re-Entry Cycle 1 (Iteration 2)

**Agent**: fractal-factory-test-planner  
**Task**: pass3/test-planning  
**Iteration**: 2 (gap-hunting re-entry cycle 1)  
**Date**: 2026-03-16  

## Summary

Added **5 new test scenarios** (TEST-022 through TEST-026) to address 5 test-coverage gaps identified by gap hunting. Total test plan now contains **26 scenarios** across 10 categories.

## Gaps Addressed

| Gap ID | Severity | Description | Scenario Added |
|--------|----------|-------------|----------------|
| TC-001 | warning | Missing `delivered-with-gaps` test | TEST-022 |
| TC-003 | warning | Missing plotting-auditor rejection test | TEST-023 |
| TC-004 | warning | Missing character-auditor rejection test | TEST-024 |
| TC-005 | warning | Missing series/sequel production test | TEST-025 |
| TC-006 | warning | Missing parallel dispatch test | TEST-026 |
| TC-002 | warning | Missing test fixture directories (TEST-014, TEST-016, TEST-017) | Noted — execution-pass concern, not addressable in test plan |

## Scenario Count by Category

| Category | Before | After | Delta |
|----------|--------|-------|-------|
| happy-path | 2 | 2 | — |
| auditor-rejection | 2 | **4** | +2 |
| convergence-exhaustion | 2 | 2 | — |
| re-entry | 1 | 1 | — |
| per-chapter-iteration | 2 | 2 | — |
| cross-cutting-agents | 3 | **4** | +1 |
| edge-case | 3 | 3 | — |
| specialist-behavior | 2 | 2 | — |
| coordinator-routing | 2 | **4** | +2 |
| revision-beta-loop | 2 | 2 | — |
| **Total** | **21** | **26** | **+5** |

## Scenario Count by Priority

| Priority | Before | After | Delta |
|----------|--------|-------|-------|
| P0 | 6 | **7** | +1 |
| P1 | 12 | **16** | +4 |
| P2 | 3 | 3 | — |
| **Total** | **21** | **26** | **+5** |

## All Scenarios (Complete Table)

| ID | Name | Category | Priority | Gap |
|----|------|----------|----------|-----|
| TEST-001 | Happy path full pipeline single chapter | happy-path | P0 | — |
| TEST-002 | Happy path multi-chapter book | happy-path | P0 | — |
| TEST-003 | Auditor rejection concept phase retry | auditor-rejection | P0 | — |
| TEST-004 | Auditor rejection drafting chapter retry | auditor-rejection | P1 | — |
| TEST-005 | Convergence exhaustion worldbuilding blocked | convergence-exhaustion | P0 | — |
| TEST-006 | Convergence exhaustion revision-beta loop | convergence-exhaustion | P1 | — |
| TEST-007 | Re-entry from gap hunting | re-entry | P1 | — |
| TEST-008 | Per-chapter iteration drafting 5 chapters | per-chapter-iteration | P1 | — |
| TEST-009 | Per-chapter iteration chapter 3 blocks | per-chapter-iteration | P1 | — |
| TEST-010 | Cross-cutting craft-tracker initialization | cross-cutting-agents | P1 | — |
| TEST-011 | Cross-cutting continuity-tracker verification | cross-cutting-agents | P1 | — |
| TEST-012 | Cross-cutting series-kb-manager updates | cross-cutting-agents | P1 | — |
| TEST-013 | Edge case empty story idea | edge-case | P1 | — |
| TEST-014 | Edge case no style references | edge-case | P2 | — |
| TEST-015 | Edge case missing chapter outline | edge-case | P1 | — |
| TEST-016 | Specialist geography-builder creates map | specialist-behavior | P2 | — |
| TEST-017 | Specialist romance-arc-designer dual arc | specialist-behavior | P2 | — |
| TEST-018 | Coordinator routing worldbuilding sub-coordinators | coordinator-routing | P1 | — |
| TEST-019 | Coordinator routing drafting creative-writing | coordinator-routing | P1 | — |
| TEST-020 | Revision-beta loop one cycle | revision-beta-loop | P0 | — |
| TEST-021 | Revision-beta loop no revision needed | revision-beta-loop | P0 | — |
| **TEST-022** | **Delivered-with-gaps polish-coordinator blocked** | **coordinator-routing** | **P0** | **TC-001** |
| **TEST-023** | **Plotting-auditor rejection retry with sub-coordinator cascade** | **auditor-rejection** | **P1** | **TC-003** |
| **TEST-024** | **Character-auditor rejection with depth-3 cascade reset** | **auditor-rejection** | **P1** | **TC-004** |
| **TEST-025** | **Series sequel production with series-kb influence** | **cross-cutting-agents** | **P1** | **TC-005** |
| **TEST-026** | **Parallel beta-reader fan-out with partial failure** | **coordinator-routing** | **P1** | **TC-006** |

## Invariant Coverage Matrix (New Scenarios)

| Invariant | Description (short) | Scenarios |
|-----------|---------------------|-----------|
| INV-002 | Internal consistency | TEST-025 |
| INV-003 | Character voice distinctness | TEST-024 |
| INV-008 | Character agency | TEST-024 |
| INV-010 | Outline before draft | TEST-023 |
| INV-013 | Multi-pass review | TEST-022, TEST-026 |
| INV-021 | Romance arc pacing | TEST-023, TEST-024 |
| INV-025 | Originality self-audit | TEST-026 |
| INV-027 | Adversarial phase gates | TEST-022, TEST-023, TEST-024 |
| INV-032 | Series artifact isolation | TEST-025 |
| INV-034 | POV voice distinctiveness | TEST-024 |
| INV-050 | Dual-arc interleave | TEST-023 |
| INV-051 | Tension mapping | TEST-023 |
| INV-055 | POV voice fingerprint verification | TEST-024 |
| INV-066 | Series-ready architecture | TEST-025 |
| INV-068 | Five independent beta reader lenses | TEST-026 |
| INV-070 | Series KB append-mostly | TEST-025 |
| INV-071 | Sequel must address unresolved threads | TEST-025 |
| INV-076 | Severity-gated acceptance | TEST-026 |

**18 unique invariants** covered by new scenarios. Combined with existing scenario invariant references, **23+ unique invariants** are now referenced across the full 26-scenario test plan.

## New Scenario Details

### TEST-022: Delivered-with-gaps polish-coordinator blocked (P0, TC-001)

**Why P0**: The `delivered-with-gaps` result code is one of only 3 terminal states for the orchestrator (`delivered`, `delivered-with-gaps`, `failed`). It was completely untested. Two routing paths produce it — this scenario covers the primary path (polish-coordinator blocked) and documents the secondary path (series-kb-manager blocked) as an additional variant.

**Key verification**: Orchestrator writes `delivered-with-gaps` (not `failed`), series-kb-manager is NOT dispatched, all prior phases remain `complete`.

### TEST-023: Plotting-auditor rejection (P1, TC-003)

**Why distinct from TEST-003/TEST-004**: The plotting phase has the most complex sub-coordinator tree in the system — structural-design-coordinator (3 specialists) + chapter-design-coordinator (2 specialists). On auditor rejection, 8 status files must be deleted (vs. 2 for concept, ~4 for drafting). This tests the largest `resetOnRetry` surface area.

**Key verification**: All 8 `resetOnRetry` statuses are deleted; feedback artifact from `audit-reports/plotting/gate.json` reaches downstream agents on retry.

### TEST-024: Character-auditor rejection (P1, TC-004)

**Why distinct**: The character phase has depth-3 hierarchy with voice parameter verification. The auditor gates character profiles, romance-arc design, AND voice parameters — a broader surface than any other auditor. The retry path tests that voice distinctness improves (INV-003, INV-034, INV-055).

**Key verification**: 7 statuses deleted on reset; voice parameters in retry are measurably more distinct; romance arc has proper emotional spine stages.

### TEST-025: Series sequel production (P1, TC-005)

**Why needed**: The system includes series-kb-manager, story-config.json has `sequelOf`/`seriesId` fields, and multiple invariants (INV-066, INV-070, INV-071) govern series behavior — but no scenario tested this path. This is critical for production readiness since series production is a core use case.

**Key verification**: Series KB is read by concept/worldbuilding/character/plotting coordinators; world facts are extended not contradicted; unresolved threads are addressed; series KB is appended.

### TEST-026: Parallel beta-reader fan-out (P1, TC-006)

**Why needed**: The beta-reading phase is the only phase with explicit parallel dispatch (`parallelGroups` in routing). 5 independent beta readers across 2 lens coordinators — the fan-out/fan-in pattern is architecturally unique. Partial failure (1 of 5 readers blocks) tests that blocked propagation doesn't corrupt the 4 successful outputs.

**Key verification**: 2-level parallel dispatch occurred; 4 of 5 readers completed; craft-lens blocked propagated to beta-reading-coordinator; beta-synthesizer NOT dispatched; no cross-contamination between parallel reader outputs.

## Edge Cases Covered by New Scenarios

1. **Cascade reset depth** (TEST-023, TEST-024): Tests that deeply nested sub-coordinator status files are all properly cleaned up on retry — the largest `resetOnRetry` sets in the system (7–8 files).
2. **Terminal state branching** (TEST-022): Tests the orchestrator's alternative terminal state that is only reachable when late-pipeline agents fail.
3. **Cross-book data inheritance** (TEST-025): Tests that artifacts from a previous book are correctly read and not mutated, while new artifacts extend them.
4. **Parallel dispatch with mixed results** (TEST-026): Tests that parallel fan-out correctly handles partial failure without data loss.
5. **Additional variant paths**: TEST-022 and TEST-026 include documented variant scenarios for the alternative branch (series-kb-manager blocked, all-succeed fan-out).

## Notable Gaps (Not Addressable)

- **TC-002**: Missing golden test fixture directories for TEST-014, TEST-016, TEST-017. This is an execution-pass concern — fixtures need to be created during the execution pass, not the planning pass. Noted in `gapHistory`.
- **Plotting convergence exhaustion**: No scenario tests plotting-auditor failing maxAuditorRetries (3) times and escalating to blocked. This is partially covered by TEST-005 (worldbuilding convergence exhaustion) since the pattern is identical. Could be added as P2 in a future cycle.
- **Character convergence exhaustion**: Same as above for character phase. Lower priority since TEST-024 already covers the retry path and TEST-005 covers the exhaustion pattern.
