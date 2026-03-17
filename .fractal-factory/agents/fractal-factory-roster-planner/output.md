# Roster Planner Output — romantic-fantasy-writer

## Re-Entry Update — Gap Hunting Cycle 1

**Iteration**: 2 (re-entry from gap-hunting cycle 1)
**Gaps Addressed**: 8 of 22 total gaps (AC-001, AC-002, AC-003, CR-001, BC-W01, IE-001, RC-001, RC-002)
**Roster Changes**: No new agents. 67 agents confirmed complete.
**Architecture Changes**: 18 writer/reader field corrections across architecture.json.

### Changes Made

#### 1. Ghost Agent Reference Cleanup (AC-003, CR-001)

Fixed 6 pre-depth-analysis collapsed role names that persisted in architecture.json writer/reader fields after the depth analyzer split them into specialized agents:

| Ghost Name | Replaced With | Affected Artifacts |
|---|---|---|
| `romantic-fantasy-writer-orchestrator` | `romantic-fantasy-writer` | progress.json, manifest.json |
| `romantic-fantasy-writer-worldbuilder` | geography-builder, magic-system-designer, political-structure-builder, culture-builder, history-builder | world-bible/*.json (5 artifacts) |
| `romantic-fantasy-writer-character-developer` | protagonist-profiler, supporting-cast-developer, character-voice-designer, romance-arc-designer | characters/index.json, characters/{CHAR-NNN}.json, romance-arc-design.json |
| `romantic-fantasy-writer-plot-architect` | structure-selector, dual-arc-builder, tension-mapper, chapter-outliner, scene-beat-designer | plot-structure.json, dual-arc-timeline.json, chapter-outlines/{N}.json, tension-map.json |
| `romantic-fantasy-writer-style-calibrator` | `romantic-fantasy-writer-style-guide-writer` | style-guide.json |
| `romantic-fantasy-writer-adversarial-auditor` | 8 phase-specific auditors (concept-, worldbuilding-, character-, plotting-, style-, drafting-, revision-, beta-reading-auditor) | audit-reports/{phase}/{gate-id}.json |

#### 2. Chapter Summaries Writer Fix (AC-001)

- **Before**: architecture.json listed `romantic-fantasy-writer-polisher` as writer of `chapter-summaries/{N}.json`
- **After**: Corrected to `romantic-fantasy-writer-summary-generator` (A-063), matching roster.json
- The polisher (A-062) writes `chapters/{N}/final.md`, not summaries.

#### 3. Craft Profile Multi-Writer Fix (AC-002)

- **Before**: architecture.json specified read-modify-write with two writers: concept-developer + plot-architect
- **After**: Single writer `romantic-fantasy-writer-craft-profile-selector` (A-023), writeProtocol changed to `create-once`
- **Rationale**: plot-architect was split into 5 agents during depth analysis; none write craft-profile.json. INV-079 enforcement is done by the plotting-auditor reading craft-profile.json, not by writing to it.

#### 4. Series KB Path Note (BC-W01)

- Added `pathNote` to `series-kb/index.json` artifact clarifying the mapping: artifact key is `series-kb/index.json` (per-book relative), bootstrap creates at `{root}/series/{series-id}/index.json`.

#### 5. Universal Invariant INV-030 (IE-001)

- Added `universalInvariants` array to roster.json with INV-030 "No Silent Failures"
- Scope: all 67 agents must report failures explicitly via status.json
- This avoids needing to add INV-030 to each individual agent's record

#### 6. Result Code Verification (RC-001, RC-002)

- Verified `romantic-fantasy-writer-craft-tracker` (A-067) has `blocked` in resultCodes ✓
- Verified `romantic-fantasy-writer-continuity-tracker` (A-065) has `blocked` in resultCodes ✓
- Both already had the correct codes. The gap was about unhandled routing in the orchestrator, not missing roster codes.

#### 7. Cross-Cutting Agents Cleanup

- Fixed 3 ghost shared specialist names in architecture.json depth section:
  - `foreshadowing-architect` → `craft-tracker` (merged during roster planning)
  - `emotional-throughline-tracker` → `craft-tracker`
  - `symbolic-motif-tracker` → `craft-tracker`
- Deduplicated to 3 shared specialists: continuity-tracker, series-kb-manager, craft-tracker
- Updated estimatedSharedAgents from 5 to 3

---

## Original Summary (Iteration 1)

Planned **67 agents** for the romantic-fantasy-writer system — a complete autonomous pipeline for producing publication-quality romantic fantasy fiction. The roster operates within the 80-agent budget with 13 slots of headroom for gap-hunting additions.

## Full Agent Roster

| ID | Name | Level | Parent | Pass | Result Codes | Anti-Laziness |
|----|------|-------|--------|------|-------------|---------------|
| A-001 | romantic-fantasy-writer-guide | guide | user | — | — | ✗ |
| A-002 | romantic-fantasy-writer | orchestrator | guide | all | delivered, delivered-with-gaps, failed | ✗ |
| A-003 | romantic-fantasy-writer-concept-coordinator | coordinator | orchestrator | concept | complete, blocked, revision-loop | ✗ |
| A-004 | romantic-fantasy-writer-worldbuilding-coordinator | coordinator | orchestrator | worldbuilding | complete, blocked, revision-loop | ✗ |
| A-005 | romantic-fantasy-writer-character-coordinator | coordinator | orchestrator | character | complete, blocked, revision-loop | ✗ |
| A-006 | romantic-fantasy-writer-plotting-coordinator | coordinator | orchestrator | plotting | complete, blocked, revision-loop | ✗ |
| A-007 | romantic-fantasy-writer-style-coordinator | coordinator | orchestrator | style | complete, blocked, revision-loop | ✗ |
| A-008 | romantic-fantasy-writer-drafting-coordinator | coordinator | orchestrator | drafting | complete, blocked, revision-loop | ✗ |
| A-009 | romantic-fantasy-writer-revision-coordinator | coordinator | orchestrator | revision | complete, blocked, revision-loop | ✗ |
| A-010 | romantic-fantasy-writer-beta-reading-coordinator | coordinator | orchestrator | beta-reading | complete, blocked, revision-loop | ✗ |
| A-011 | romantic-fantasy-writer-polish-coordinator | coordinator | orchestrator | polish | complete, blocked | ✗ |
| A-012 | romantic-fantasy-writer-physical-world-coordinator | sub-coordinator | worldbuilding-coordinator | worldbuilding | complete, blocked | ✗ |
| A-013 | romantic-fantasy-writer-systems-world-coordinator | sub-coordinator | worldbuilding-coordinator | worldbuilding | complete, blocked | ✗ |
| A-014 | romantic-fantasy-writer-core-characters-coordinator | sub-coordinator | character-coordinator | character | complete, blocked | ✗ |
| A-015 | romantic-fantasy-writer-ensemble-coordinator | sub-coordinator | character-coordinator | character | complete, blocked | ✗ |
| A-016 | romantic-fantasy-writer-structural-design-coordinator | sub-coordinator | plotting-coordinator | plotting | complete, blocked | ✗ |
| A-017 | romantic-fantasy-writer-chapter-design-coordinator | sub-coordinator | plotting-coordinator | plotting | complete, blocked | ✗ |
| A-018 | romantic-fantasy-writer-creative-writing-coordinator | sub-coordinator | drafting-coordinator | drafting | complete, blocked | ✗ |
| A-019 | romantic-fantasy-writer-quality-integration-coordinator | sub-coordinator | drafting-coordinator | drafting | complete, blocked | ✗ |
| A-020 | romantic-fantasy-writer-genre-lens-coordinator | sub-coordinator | beta-reading-coordinator | beta-reading | complete, blocked | ✗ |
| A-021 | romantic-fantasy-writer-craft-lens-coordinator | sub-coordinator | beta-reading-coordinator | beta-reading | complete, blocked | ✗ |
| A-022 | romantic-fantasy-writer-concept-developer | specialist | concept-coordinator | concept | completed, blocked | ✗ |
| A-023 | romantic-fantasy-writer-craft-profile-selector | specialist | concept-coordinator | concept | completed, blocked | ✗ |
| A-024 | romantic-fantasy-writer-concept-auditor | specialist | concept-coordinator | concept | passed, failed, blocked | ✓ |
| A-025 | romantic-fantasy-writer-geography-builder | specialist | physical-world-coordinator | worldbuilding | completed, blocked | ✗ |
| A-026 | romantic-fantasy-writer-culture-builder | specialist | physical-world-coordinator | worldbuilding | completed, blocked | ✗ |
| A-027 | romantic-fantasy-writer-history-builder | specialist | physical-world-coordinator | worldbuilding | completed, blocked | ✗ |
| A-028 | romantic-fantasy-writer-magic-system-designer | specialist | systems-world-coordinator | worldbuilding | completed, blocked | ✗ |
| A-029 | romantic-fantasy-writer-political-structure-builder | specialist | systems-world-coordinator | worldbuilding | completed, blocked | ✗ |
| A-030 | romantic-fantasy-writer-worldbuilding-auditor | specialist | worldbuilding-coordinator | worldbuilding | passed, failed, blocked | ✓ |
| A-031 | romantic-fantasy-writer-protagonist-profiler | specialist | core-characters-coordinator | character | completed, blocked | ✗ |
| A-032 | romantic-fantasy-writer-romance-arc-designer | specialist | core-characters-coordinator | character | completed, blocked | ✗ |
| A-033 | romantic-fantasy-writer-supporting-cast-developer | specialist | ensemble-coordinator | character | completed, blocked | ✗ |
| A-034 | romantic-fantasy-writer-character-voice-designer | specialist | ensemble-coordinator | character | completed, blocked | ✗ |
| A-035 | romantic-fantasy-writer-character-auditor | specialist | character-coordinator | character | passed, failed, blocked | ✓ |
| A-036 | romantic-fantasy-writer-structure-selector | specialist | structural-design-coordinator | plotting | completed, blocked | ✗ |
| A-037 | romantic-fantasy-writer-dual-arc-builder | specialist | structural-design-coordinator | plotting | completed, blocked | ✗ |
| A-038 | romantic-fantasy-writer-tension-mapper | specialist | structural-design-coordinator | plotting | completed, blocked | ✗ |
| A-039 | romantic-fantasy-writer-chapter-outliner | specialist | chapter-design-coordinator | plotting | completed, blocked | ✗ |
| A-040 | romantic-fantasy-writer-scene-beat-designer | specialist | chapter-design-coordinator | plotting | completed, blocked | ✗ |
| A-041 | romantic-fantasy-writer-plotting-auditor | specialist | plotting-coordinator | plotting | passed, failed, blocked | ✓ |
| A-042 | romantic-fantasy-writer-style-analyzer | specialist | style-coordinator | style | completed, blocked | ✗ |
| A-043 | romantic-fantasy-writer-style-guide-writer | specialist | style-coordinator | style | completed, blocked | ✗ |
| A-044 | romantic-fantasy-writer-style-auditor | specialist | style-coordinator | style | passed, failed, blocked | ✓ |
| A-045 | romantic-fantasy-writer-chapter-drafter | specialist | creative-writing-coordinator | drafting | completed, blocked | ✗ |
| A-046 | romantic-fantasy-writer-pov-voice-maintainer | specialist | creative-writing-coordinator | drafting | completed, blocked | ✗ |
| A-047 | romantic-fantasy-writer-continuity-integrator | specialist | quality-integration-coordinator | drafting | completed, blocked | ✗ |
| A-048 | romantic-fantasy-writer-craft-enforcer | specialist | quality-integration-coordinator | drafting | completed, blocked | ✓ |
| A-049 | romantic-fantasy-writer-drafting-auditor | specialist | drafting-coordinator | drafting | passed, failed, blocked | ✓ |
| A-050 | romantic-fantasy-writer-developmental-editor | specialist | revision-coordinator | revision | completed, blocked | ✗ |
| A-051 | romantic-fantasy-writer-line-editor | specialist | revision-coordinator | revision | completed, blocked | ✗ |
| A-052 | romantic-fantasy-writer-copy-editor | specialist | revision-coordinator | revision | completed, blocked | ✗ |
| A-053 | romantic-fantasy-writer-chapter-reviser | specialist | revision-coordinator | revision | completed, blocked | ✗ |
| A-054 | romantic-fantasy-writer-revision-auditor | specialist | revision-coordinator | revision | passed, failed, blocked | ✓ |
| A-055 | romantic-fantasy-writer-romance-beta-reader | specialist | genre-lens-coordinator | beta-reading | completed, blocked | ✗ |
| A-056 | romantic-fantasy-writer-fantasy-beta-reader | specialist | genre-lens-coordinator | beta-reading | completed, blocked | ✗ |
| A-057 | romantic-fantasy-writer-craft-beta-reader | specialist | craft-lens-coordinator | beta-reading | completed, blocked | ✗ |
| A-058 | romantic-fantasy-writer-sensitivity-beta-reader | specialist | craft-lens-coordinator | beta-reading | completed, blocked | ✗ |
| A-059 | romantic-fantasy-writer-originality-beta-reader | specialist | craft-lens-coordinator | beta-reading | completed, blocked | ✗ |
| A-060 | romantic-fantasy-writer-beta-synthesizer | specialist | beta-reading-coordinator | beta-reading | completed, blocked | ✗ |
| A-061 | romantic-fantasy-writer-beta-reading-auditor | specialist | beta-reading-coordinator | beta-reading | passed, failed, blocked | ✓ |
| A-062 | romantic-fantasy-writer-polisher | specialist | polish-coordinator | polish | completed, blocked | ✗ |
| A-063 | romantic-fantasy-writer-summary-generator | specialist | polish-coordinator | polish | completed, blocked | ✗ |
| A-064 | romantic-fantasy-writer-delivery-assembler | specialist | polish-coordinator | polish | completed, blocked | ✗ |
| A-065 | romantic-fantasy-writer-continuity-tracker | specialist | orchestrator | cross-cutting | completed, blocked | ✗ |
| A-066 | romantic-fantasy-writer-series-kb-manager | specialist | orchestrator | cross-cutting | completed, blocked | ✗ |
| A-067 | romantic-fantasy-writer-craft-tracker | specialist | orchestrator | cross-cutting | completed, blocked | ✓ |

## Agent Count by Level

| Level | Count |
|-------|-------|
| Guide | 1 |
| Orchestrator | 1 |
| Coordinator | 9 |
| Sub-coordinator | 10 |
| Specialist | 46 |
| **Total** | **67** |

## Specialist Count by Phase

| Phase | Specialists | Auditor? |
|-------|------------|----------|
| Concept | 3 (concept-developer, craft-profile-selector, concept-auditor) | ✓ |
| Worldbuilding | 6 (geography-builder, culture-builder, history-builder, magic-system-designer, political-structure-builder, worldbuilding-auditor) | ✓ |
| Character | 5 (protagonist-profiler, romance-arc-designer, supporting-cast-developer, character-voice-designer, character-auditor) | ✓ |
| Plotting | 6 (structure-selector, dual-arc-builder, tension-mapper, chapter-outliner, scene-beat-designer, plotting-auditor) | ✓ |
| Style | 3 (style-analyzer, style-guide-writer, style-auditor) | ✓ |
| Drafting | 5 (chapter-drafter, pov-voice-maintainer, continuity-integrator, craft-enforcer, drafting-auditor) | ✓ |
| Revision | 5 (developmental-editor, line-editor, copy-editor, chapter-reviser, revision-auditor) | ✓ |
| Beta Reading | 7 (romance-beta-reader, fantasy-beta-reader, craft-beta-reader, sensitivity-beta-reader, originality-beta-reader, beta-synthesizer, beta-reading-auditor) | ✓ |
| Polish | 3 (polisher, summary-generator, delivery-assembler) | ✗ |
| Cross-cutting (shared) | 3 (continuity-tracker, series-kb-manager, craft-tracker) | — |

## Budget Analysis

- **Budget**: 67 of 80 agents (84%)
- **Headroom**: 13 slots available for gap-hunting additions
- **Architecture estimate was**: 68 agents
- **Delta**: -1 (slightly under estimate due to craft-knowledge consolidation, offset by chapter-reviser addition)

## Merges Performed

### 1. Craft Knowledge Consolidation (saved 2 agents)

The architecture's cross-cutting section specified 5 shared specialists:
1. `continuity-tracker` (continuity-tracking subdomain)
2. `series-kb-manager` (series-knowledge-management subdomain)
3. `foreshadowing-architect` (craft-knowledge-systems subdomain)
4. `emotional-throughline-tracker` (craft-knowledge-systems subdomain)
5. `symbolic-motif-tracker` (craft-knowledge-systems subdomain)

The artifact designer's schemas already consolidated items 3-5 into a single `craft-tracker` writer that produces `foreshadowing-ledger.json`, `mystery-box-inventory.json`, `emotional-throughline.json`, and `symbolic-motif-registry.json`. The roster follows this consolidation because:
- All three agents operate on the same craft-profile inputs
- They share the same invocation pattern (called by drafting and revision coordinators)
- The artifacts are structurally similar (ledger/registry tracking patterns)
- Consolidation saves 2 agent slots while maintaining full artifact coverage

### 2. Chapter Reviser Addition (+1 agent)

The architecture estimated 4 specialists for revision (developmental-editor, line-editor, copy-editor, revision-auditor). However, the artifact schemas define a `chapters/{N}/revised.md` artifact written by `romantic-fantasy-writer-chapter-reviser` — a dedicated agent that reads all three editing reports and beta-synthesis feedback to produce the revised chapter. This agent was added as a 5th revision specialist because:
- The three editors produce diagnostic reports, not revised text
- A dedicated reviser that synthesizes all three reports produces higher-quality output
- The reviser also handles post-beta-reading revision (reads beta-synthesis)
- This matches the artifact designer's explicit data flow

Net effect: -2 (craft consolidation) + 1 (chapter-reviser) = **-1 from estimate**.

## Hierarchy Depth Map

### Depth-2 Coordinators (4)

```
orchestrator → concept-coordinator → [concept-developer, craft-profile-selector, concept-auditor]
orchestrator → style-coordinator → [style-analyzer, style-guide-writer, style-auditor]
orchestrator → revision-coordinator → [developmental-editor, line-editor, copy-editor, chapter-reviser, revision-auditor]
orchestrator → polish-coordinator → [polisher, summary-generator, delivery-assembler]
```

### Depth-3 Coordinators (5)

```
orchestrator → worldbuilding-coordinator
  ├→ physical-world-coordinator → [geography-builder, culture-builder, history-builder]
  ├→ systems-world-coordinator → [magic-system-designer, political-structure-builder]
  └→ worldbuilding-auditor

orchestrator → character-coordinator
  ├→ core-characters-coordinator → [protagonist-profiler, romance-arc-designer]
  ├→ ensemble-coordinator → [supporting-cast-developer, character-voice-designer]
  └→ character-auditor

orchestrator → plotting-coordinator
  ├→ structural-design-coordinator → [structure-selector, dual-arc-builder, tension-mapper]
  ├→ chapter-design-coordinator → [chapter-outliner, scene-beat-designer]
  └→ plotting-auditor

orchestrator → drafting-coordinator
  ├→ creative-writing-coordinator → [chapter-drafter, pov-voice-maintainer]
  ├→ quality-integration-coordinator → [continuity-integrator, craft-enforcer]
  └→ drafting-auditor

orchestrator → beta-reading-coordinator
  ├→ genre-lens-coordinator → [romance-beta-reader, fantasy-beta-reader]
  ├→ craft-lens-coordinator → [craft-beta-reader, sensitivity-beta-reader, originality-beta-reader]
  ├→ beta-synthesizer
  └→ beta-reading-auditor
```

### Shared Cross-Cutting Specialists

```
orchestrator → continuity-tracker   (invoked by: drafting, revision, beta-reading)
orchestrator → series-kb-manager    (invoked by: concept, worldbuilding, character, polish)
orchestrator → craft-tracker        (invoked by: plotting, drafting, revision)
```

## Phase Dependency Map (Specialist Execution Order)

```
story-config.json (from guide)
  │
  ▼
concept-developer → craft-profile-selector → concept-auditor
  │                   │
  ▼                   ▼
  ├─── worldbuilding (physical-world ∥ systems-world) → worldbuilding-auditor
  │       │
  │       ▼
  ├─── character (core-characters → ensemble) → character-auditor
  │       │
  │       ▼
  ├─── plotting (structural-design → chapter-design) → plotting-auditor
  │       │
  │       ▼
  ├─── style (style-analyzer → style-guide-writer) → style-auditor
  │       │
  │       ▼
  ├─── drafting (creative-writing ↔ quality-integration) → drafting-auditor
  │       │
  │       ▼
  ├─── revision (dev-editor ∥ line-editor ∥ copy-editor → chapter-reviser) → revision-auditor
  │       │
  │       ▼
  ├─── beta-reading (genre-lens ∥ craft-lens → beta-synthesizer) → beta-reading-auditor
  │       │                                          │
  │       │                    ┌──── revision loop ──┘
  │       │                    │     (beta-synthesis → chapter-reviser)
  │       ▼                    ▼
  └─── polish (polisher → summary-generator → delivery-assembler)
          │
          ▼
      delivery-report.json (to guide → user)

Cross-cutting (invoked as needed at any point):
  continuity-tracker ←→ drafting, revision, beta-reading
  series-kb-manager  ←→ concept, worldbuilding, character, polish
  craft-tracker      ←→ plotting, drafting, revision
```

## Anti-Laziness Enforcement

10 agents have `antiLaziness: true`, ensuring they cannot take shortcuts:
- **8 adversarial auditors**: concept-auditor, worldbuilding-auditor, character-auditor, plotting-auditor, style-auditor, drafting-auditor, revision-auditor, beta-reading-auditor
- **1 quality enforcer**: craft-enforcer (validates craft-tool invariants in prose)
- **1 cross-cutting tracker**: craft-tracker (must diligently track foreshadowing callbacks, motifs, emotional beats, and mystery boxes)

## Notes for Routing Planner

1. **Revision ↔ Beta-Reading loop**: The orchestrator must support a revision→beta-reading→revision cycle. After beta-synthesis, the orchestrator routes back to revision-coordinator's chapter-reviser with the beta-synthesis feedback. The revision-auditor then re-gates.

2. **Auditor placement**: In depth-3 coordinators, the auditor is a direct child of the coordinator (peer to sub-coordinators), not nested under any sub-coordinator. This gives auditors full visibility across all sub-coordinator outputs.

3. **Shared specialist invocation**: The 3 cross-cutting specialists (continuity-tracker, series-kb-manager, craft-tracker) are owned by the orchestrator but invoked by multiple coordinators. The routing planner must define invocation protocols for these agents.

4. **Polish has no auditor**: The polish phase is the lightest coordinator with only 1 cross-cutting concern. No adversarial gate is needed — the polisher performs final cleanup, not creative work that needs adversarial validation.

5. **craft-profile.json dual writers**: Both concept-developer (initial selection) and plot-architect (refined via structure-selector) write to craft-profile.json. The routing planner should define the multi-writer protocol (concept writes initial, plotting refines).
