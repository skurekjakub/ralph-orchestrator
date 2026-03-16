# Fractal Orchestrator Architecture — Romantic Fantasy Writer

## Purpose

The romantic-fantasy-writer orchestrator is a **pure router** that sequences 9 creative phases plus 3 cross-cutting agents. It never writes creative content. It reads coordinator statuses and dispatches the next phase.

## Phase Sequence

```
concept → worldbuilding → character → plotting → style
  → craft-tracker
  → drafting (per chapter) → continuity-tracker
  → revision (per chapter) ↔ beta-reading (per chapter)
  → polish
  → series-kb-manager
```

### Phase Dispatch Order

| Step | Agent | Condition to Dispatch |
|------|-------|--------------------|
| 1 | concept-coordinator | Always first (after story-config.json confirmed) |
| 2 | worldbuilding-coordinator | concept-coordinator complete |
| 3 | character-coordinator | worldbuilding-coordinator complete |
| 4 | plotting-coordinator | character-coordinator complete |
| 5 | style-coordinator | plotting-coordinator complete |
| 6 | craft-tracker | style-coordinator complete |
| 7 | drafting-coordinator | craft-tracker completed (per chapter N) |
| 8 | continuity-tracker | drafting-coordinator complete (per chapter N) |
| 9 | revision-coordinator | All chapters drafted, continuity tracked |
| 10 | beta-reading-coordinator | revision-coordinator complete |
| 11 | polish-coordinator | beta-reading-coordinator complete OR revision-beta converged |
| 12 | series-kb-manager | polish-coordinator complete |

### The Revision ↔ Beta Loop

This is the most complex routing decision. After beta-reading completes:

1. Beta-reading-coordinator returns `complete` → check beta-synthesizer output
2. If beta-synthesizer verdict is `revision-required` AND `revisionBetaCycles < maxRevisionBetaCycles`:
   - Increment `progress.json.revisionBetaCycles`
   - Delete revision-coordinator and all child statuses
   - Delete beta-reading-coordinator and all child statuses
   - Re-dispatch revision-coordinator
3. If verdict is `approved` OR `revisionBetaCycles >= maxRevisionBetaCycles`:
   - Proceed to polish

### Result Codes

The orchestrator writes one of these as its final result:

| Result | When |
|--------|------|
| `delivered` | All 9 phases + series-kb completed successfully |
| `delivered-with-gaps` | Polish or series-kb blocked, but chapters exist |
| `blocked` | A critical phase (concept through revision) blocked |

### Progress Management

The orchestrator owns `progress.json`. It updates:
- `currentPhase` — set when dispatching a coordinator
- `phaseStatuses.{phase}.status` — updated after coordinator completes
- `phaseStatuses.{phase}.gateResult` — pass/fail from the auditor
- `currentChapter` — incremented for per-chapter phases
- `chapterProgress[]` — per-chapter completion tracking
- `revisionBetaCycles` — loop counter

### Cross-Cutting Agent Dispatch

Cross-cutting agents are dispatched at specific points:
- **craft-tracker**: After style phase completes (initializes tracking from craft-profile)
- **continuity-tracker**: After each chapter is drafted (updates running continuity)
- **series-kb-manager**: After polish completes (promotes knowledge to series KB)

These agents are dispatched by the orchestrator directly, not by any coordinator.

### Handling Blocked States

If any coordinator returns `blocked`:
- For phases concept through drafting: The orchestrator writes its own status as `blocked`. The pipeline cannot continue.
- For revision: If revision blocks on a specific chapter, the orchestrator may still proceed with remaining chapters (depends on which chapter blocked).
- For polish: If polish blocks, the orchestrator writes `delivered-with-gaps`.
- For series-kb-manager: If it blocks, the orchestrator still writes `delivered-with-gaps` (chapters are delivered, series KB just not updated).

### Sequel Handling

For sequels (`story-config.json.sequelOf` is not null):
1. The orchestrator verifies the series KB exists for the referenced series
2. All phases receive the series KB path for continuity checking
3. The series-kb-manager extends (not replaces) the existing series knowledge
