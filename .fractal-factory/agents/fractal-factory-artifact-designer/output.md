# Artifact Designer Output — Romantic Fantasy Writer

**Agent**: fractal-factory-artifact-designer  
**Task**: pass2/artifact-design  
**Iteration**: 1  
**Date**: 2026-03-16T00:35:00Z

---

## Summary

Designed **42 artifacts** (4 universal + 38 domain-specific) for the produced romantic-fantasy-writer agent system. These schemas define the complete data contract between ~80 agents across the novel-writing pipeline. 8 artifacts use read-modify-write protocols with explicit multi-writer ownership rules. 27 data flow connections map how artifacts flow through 12 creative phases.

---

## Artifact Table

### Universal Artifacts (4)

| # | Artifact | Purpose | Writers | Readers | Protocol |
|---|---------|---------|---------|---------|----------|
| 1 | `story-config.json` | User-provided story parameters | guide | all agents | create-once |
| 2 | `progress.json` | Pipeline execution state | orchestrator | orchestrator, coordinators | read-modify-write |
| 3 | `manifest.json` | Audit trail (newest first) | all agents | orchestrator, delivery | prepend-entry |
| 4 | `agents/*/status.json` | Per-agent routing signal | each agent | parent coordinator | create-once-per-iteration |

### Domain-Specific Artifacts (38)

#### Phase 1: Concept Development (SD-002) — 2 artifacts

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 5 | `story-concept.json` | Crystallized concept: premise, themes, genre balance, comp titles, tone contract | concept-developer | create-once | INV-001, INV-043/T5, INV-063/T25 |
| 6 | `craft-profile.json` | Story Craft Profile: selected tools T1–T26 (min 5-8), binding once finalized | concept-developer, plot-architect | **R-M-W** | INV-069, INV-078, INV-079 |

#### Phase 2: Worldbuilding (SD-003) — 5 artifacts

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 7 | `world-bible/geography.json` | Locations, climate, travel rules | worldbuilder | create-once | INV-002, INV-074 |
| 8 | `world-bible/magic-system.json` | Magic rules, costs, limitations (Sanderson's Laws) | worldbuilder | create-once | INV-009, INV-048/T10 |
| 9 | `world-bible/politics.json` | Factions, governance, power dynamics | worldbuilder | create-once | INV-002 |
| 10 | `world-bible/culture.json` | Customs, religions, social norms, taboos | worldbuilder | create-once | INV-018 |
| 11 | `world-bible/history.json` | Timeline, eras, legends, historical figures | worldbuilder | create-once | INV-002 |

#### Phase 3: Character Development (SD-004) — 3 artifacts

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 12 | `characters/index.json` | Character roster with roles and relationship web | character-developer | create-once | INV-008 |
| 13 | `characters/{CHAR-NNN}.json` | Per-character profile: wound, desire, arc, voice fingerprint, sensory signature | character-developer | create-once | INV-003, INV-034/T17, INV-055/T17, INV-064/T26 |
| 14 | `romance-arc-design.json` | Romance arc: stages, internal resistance, vulnerability ladder, black moment, HFN/HEA | character-developer | create-once | INV-001, INV-021, INV-045/T7, INV-046/T8, INV-059/T21 |

#### Phase 4: Plotting & Outlining (SD-005) — 4 artifacts

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 15 | `plot-structure.json` | Story structure: framework, acts, beats, subplots, try-fail cycles, stakes escalation | plot-architect | create-once | INV-042/T4, INV-044/T6 |
| 16 | `dual-arc-timeline.json` | Fantasy + romance arcs in parallel with reinforcement/counterpoint mapping | plot-architect | create-once | INV-050/T12 |
| 17 | `chapter-outlines/{N}.json` | Per-chapter outline: POV, scenes (goal/conflict/disaster/value-shift), hooks, beats | plot-architect | create-once | INV-010, INV-039/T1, INV-040/T2, INV-041/T3, INV-060/T22 |
| 18 | `tension-map.json` | Tension rise-and-fall chart across all chapters | plot-architect | create-once | INV-020, INV-051/T13 |

#### Phase 5: Prose Style Calibration (SD-006) — 1 artifact

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 19 | `style-guide.json` | Voice calibration per POV, scene-type palettes, prose quality floor, tone contract | style-calibrator | create-once | INV-015, INV-017, INV-024, INV-028, INV-043/T5, INV-055/T17 |

#### Phase 6: Chapter Drafting (SD-007) — 2 artifacts per chapter

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 20 | `chapters/{N}/draft.md` | Chapter prose draft (sequential per INV-012) | chapter-drafter | create-once | INV-012 |
| 21 | `chapters/{N}/metadata.json` | Per-chapter structured metadata: scene breakdown, craft compliance, emotional state | chapter-drafter | create-once | INV-039/T1, INV-040/T2, INV-058/T20 |

#### Phase 7: Revision & Editing (SD-008) — 4 artifacts per chapter

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 22 | `revision-reports/{N}/developmental.json` | Dev edit: plot holes, pacing, motivation, arc satisfaction, darlings | developmental-editor | create-once | INV-013, INV-049/T11, INV-081 |
| 23 | `revision-reports/{N}/line-edit.json` | Line edit: prose quality, voice, clichés, show-vs-tell, dialogue | line-editor | create-once | INV-005, INV-013, INV-017, INV-019 |
| 24 | `revision-reports/{N}/copy-edit.json` | Copy edit: grammar, naming, timeline, factual accuracy | copy-editor | create-once | INV-013, INV-016, INV-018 |
| 25 | `chapters/{N}/revised.md` | Revised chapter (every change cites its finding per INV-014) | chapter-reviser | create-once | INV-014 |

#### Phase 8: Beta Reading Simulation (SD-009) — 6 artifacts per chapter

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 26 | `beta-feedback/{N}/romance-lens.json` | Romance reader: chemistry, emotional satisfaction, arc pacing, HFN delivery | romance-beta-reader | create-once | INV-001, INV-021 |
| 27 | `beta-feedback/{N}/fantasy-lens.json` | Fantasy reader: immersion, magic consistency, world rules, plot logic | fantasy-beta-reader | create-once | INV-002, INV-009 |
| 28 | `beta-feedback/{N}/craft-lens.json` | Craft reader: per-tool compliance, scene structure, pacing, foreshadowing | craft-beta-reader | create-once | INV-079 |
| 29 | `beta-feedback/{N}/sensitivity-lens.json` | Sensitivity reader: representation, stereotypes, consent, power dynamics | sensitivity-beta-reader | create-once | — |
| 30 | `beta-feedback/{N}/originality-lens.json` | Originality reader: plagiarism check, style sample transformative-only check | originality-beta-reader | create-once | INV-023, INV-024, INV-025 |
| 31 | `beta-synthesis/{N}.json` | Aggregated findings: de-duplicated, severity-prioritized, verdict (accept/revise) | beta-synthesizer | create-once | INV-076 |

#### Phase 9: Polish & Delivery (SD-010) — 3 artifacts

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 32 | `chapters/{N}/final.md` | Final polished chapter, publication-ready | polisher | create-once | INV-073 |
| 33 | `chapter-summaries/{N}.json` | Per-chapter summary for series KB promotion | polisher | create-once | INV-066 |
| 34 | `delivery-report.json` | Final delivery: word counts, quality metrics, outstanding items | delivery-assembler | create-once | — |

#### Cross-Cutting: Adversarial Consistency (SD-011) — 1 artifact template

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 35 | `audit-reports/{phase}/{gate-id}.json` | Phase gate findings: consistency, craft compliance, darlings, verdicts | adversarial-auditor | create-once-per-gate | INV-027, INV-081 |

#### Cross-Cutting: Continuity & Craft Tracking (SD-013, SD-014) — 6 artifacts

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 36 | `continuity-tracker.json` | Running continuity: timeline, positions, knowledge, promises, naming | continuity-tracker, chapter-drafter | **R-M-W** | INV-006, INV-011, INV-016 |
| 37 | `foreshadowing-ledger.json` | Plant→payoff register with status tracking | chapter-drafter, craft-tracker | **R-M-W** | INV-033, INV-053/T15 |
| 38 | `information-asymmetry-map.json` | Character knowledge vs. reader knowledge with dramatic irony points | continuity-tracker, chapter-drafter | **R-M-W** | INV-056/T18 |
| 39 | `mystery-box-inventory.json` | Active unresolved reader questions (target 3-7 active) | craft-tracker, chapter-drafter | **R-M-W** | INV-061/T23 |
| 40 | `emotional-throughline.json` | Per-character emotional state per chapter boundary with variety enforcement | chapter-drafter, craft-tracker | **R-M-W** | INV-037, INV-058/T20 |
| 41 | `symbolic-motif-registry.json` | Symbol/motif assignments to themes with per-chapter appearance tracking | craft-tracker | **R-M-W** | INV-054/T16 |

#### Cross-Cutting: Series Knowledge Management (SD-012) — 1 artifact

| # | Artifact | Purpose | Writers | Protocol | Invariants |
|---|---------|---------|---------|----------|------------|
| 42 | `series-kb/index.json` | Series-level KB: cross-book facts, unresolved threads, naming conventions | series-kb-manager | **R-M-W** | INV-066, INV-070, INV-071 |

---

## Data Flow Diagram

```
                    ┌─────────────────────────────────────────────────────────────────────┐
                    │                        SERIES KB (cross-book)                        │
                    │  series-kb/index.json ←── chapter-summaries ←── polish               │
                    │         │ (sequel only)                                               │
                    │         ▼                                                             │
  ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌────────────┐    ┌──────────────┐  │
  │  INPUT   │───▶│ CONCEPT  │───▶│ WORLDBUILDING│───▶│ CHARACTER  │───▶│  PLOTTING    │  │
  │          │    │          │    │              │    │            │    │              │  │
  │ story-   │    │ story-   │    │ world-bible/ │    │ characters/│    │ plot-struct.  │  │
  │ config   │    │ concept  │    │ geography    │    │ index      │    │ dual-arc      │  │
  │          │    │ craft-   │    │ magic-system │    │ {CHAR}.json│    │ ch-outlines/  │  │
  │          │    │ profile  │    │ politics     │    │ romance-arc│    │ tension-map   │  │
  │          │    │          │    │ culture      │    │            │    │              │  │
  │          │    │          │    │ history      │    │            │    │              │  │
  └──────────┘    └──────────┘    └──────────────┘    └────────────┘    └──────┬───────┘  │
                         │                                                     │          │
                         │                                                     ▼          │
                         │              ┌───────────┐                  ┌──────────────┐   │
                         │              │   STYLE   │─────────────────▶│  DRAFTING    │   │
                         │              │           │                  │  (sequential) │   │
                         │              │ style-    │                  │              │   │
                         │              │ guide     │                  │ chapters/N/  │   │
                         │              └───────────┘                  │  draft.md    │   │
                         │                                             │  metadata    │   │
                         │                                             │              │   │
                         │    ┌─────────────────────────┐              │ ◄──┐ R-M-W   │   │
                         │    │  CROSS-CUTTING TRACKERS  │◄────────────│    │ trackers │   │
                         │    │  continuity-tracker      │─────────────▶    │          │   │
                         │    │  foreshadowing-ledger    │              │    │          │   │
                         │    │  info-asymmetry-map      │              └────┼──────────┘   │
                         │    │  mystery-box-inventory   │                   │              │
                         │    │  emotional-throughline   │                   ▼              │
                         │    │  symbolic-motif-registry │         ┌──────────────┐         │
                         │    └─────────────────────────┘         │  REVISION    │         │
                         │                                         │  (3 passes)  │         │
                         │                                         │              │         │
                         │    ┌─────────────────────────┐         │ dev-edit     │         │
                         ├───▶│  ADVERSARIAL GATES      │◄────────│ line-edit    │         │
                         │    │  audit-reports/{phase}/  │─────────▶ copy-edit    │         │
                         │    │  (every creative phase)  │         │ revised.md   │         │
                         │    └─────────────────────────┘         └──────┬───────┘         │
                         │                                                │ ▲               │
                         │                                                ▼ │ (INV-076)     │
                         │                                         ┌──────────────┐         │
                         │                                         │ BETA READING │         │
                         │                                         │  (5 lenses)  │         │
                         │                                         │              │         │
                         │                                         │ romance-lens │         │
                         │                                         │ fantasy-lens │         │
                         │                                         │ craft-lens   │         │
                         │                                         │ sensitivity  │         │
                         │                                         │ originality  │         │
                         │                                         │ synthesis    │         │
                         │                                         └──────┬───────┘         │
                         │                                                │                 │
                         │                                                ▼                 │
                         │                                         ┌──────────────┐         │
                         │                                         │   POLISH     │         │
                         │                                         │              │         │
                         │                                         │ final.md     │         │
                         │                                         │ summaries    │─────────┘
                         │                                         └──────┬───────┘
                         │                                                │
                         │                                                ▼
                         │                                         ┌──────────────┐
                         │                                         │  DELIVERY    │
                         │                                         │              │
                         │                                         │ delivery-    │
                         │                                         │ report.json  │
                         │                                         └──────────────┘
```

### Primary Phase Chain (acyclic)
```
input → concept → worldbuilding → character → plotting → drafting → revision → beta-reading → polish → delivery
                                                            ↑                       ↑    │
                                                     style ─┘                       └────┘ (severity-gated loop)
```

### Cross-Cutting Flows
- **Adversarial gates**: concept → audit-reports → {every creative phase}
- **Continuity trackers**: drafting ↔ tracker artifacts (R-M-W per chapter, sequential)
- **Series KB**: polish → series-kb → concept (sequel only, cross-book boundary)

---

## Multi-Writer Artifacts & Ownership Rules

### 1. `craft-profile.json` — 2 writers
- **concept-developer**: Creates initial selection (5-8 tools)
- **plot-architect**: May append tools during plotting
- **Lock rule**: Once `bindingFrom` = `'plotting'`, no further modifications (INV-079)
- **Merge**: Append-only; existing selections preserved

### 2. `continuity-tracker.json` — 2 writers
- **chapter-drafter**: Updates positions, timeline, promises after each chapter
- **continuity-tracker**: Full consistency verification, may add corrections
- **Merge**: Entries are append-only; existing entries may only have `status` updated (open→resolved)

### 3. `foreshadowing-ledger.json` — 2 writers
- **chapter-drafter**: Adds new plant entries
- **craft-tracker**: Updates payoff fields when payoffs land
- **Merge**: Entries never deleted; status transitions: planted→paid-off | planted→abandoned

### 4. `information-asymmetry-map.json` — 2 writers
- **chapter-drafter**: Registers new facts and character knowledge gains
- **continuity-tracker**: Verifies no character uses unlearned information
- **Merge**: Facts append-only; `knownBy` arrays grow monotonically

### 5. `mystery-box-inventory.json` — 2 writers
- **chapter-drafter**: Opens new boxes, updates snapshots
- **craft-tracker**: Closes boxes, recomputes `activeCount`
- **Merge**: Status transitions: open→closed only

### 6. `emotional-throughline.json` — 2 writers
- **chapter-drafter**: Appends chapter entries per character
- **craft-tracker**: Recomputes `varietyCheck` after each update
- **Merge**: Character arrays are append-only

### 7. `symbolic-motif-registry.json` — 1 primary writer
- **craft-tracker**: Sets initial motifs during plotting; appends appearances per chapter

### 8. `series-kb/index.json` — 1 primary writer
- **series-kb-manager**: Append-mostly; facts from earlier books never silently retconned (INV-070)

---

## Acyclicity Validation

The primary phase-to-phase data flow forms a **strict DAG**:

```
input → concept → worldbuilding → character → plotting → drafting → revision → beta-reading → polish → delivery
```

**Self-loops** (agents within the same phase reading each other's output) exist in:
- `revision`: 3 edit reports → reviser (sequential within phase)
- `beta-reading`: 5 lens reports → synthesizer (parallel within phase)
- `drafting`: continuity trackers (updated per chapter, sequential)

**Intentional bounded feedback loops**:
- `revision ↔ beta-reading`: Beta synthesis verdict may trigger revision cycle. **Bounded** by INV-076 (severity-gated: only critical/major force re-revision) and orchestrator max-cycle limit.
- `series-kb → concept`: Only for sequel production (different book instantiation, not within-book cycle).
- `adversarial gates → creative phases`: Each gate is a sub-phase check, not a phase-level cycle. Gate blocks progression if critical findings exist; the producing agent fixes and re-submits to the same gate.

**Conclusion**: No unbounded dependency cycles exist. All feedback loops have explicit termination conditions.

---

## Invariant Coverage

All 81 invariants have at least one artifact enforcement path:

- **Behavioral (21)**: Enforced via story-concept.json (INV-001), world-bible/* (INV-002, INV-009), character profiles (INV-008), audit-reports (INV-027), continuity-tracker (INV-006)
- **Quality (33)**: Enforced via style-guide.json (INV-017), beta-feedback lenses (INV-003-005), emotional-throughline (INV-037), craft-profile.json + audit-reports (INV-039-064/T1-T26)
- **Workflow (13)**: Enforced via progress.json (INV-010, INV-012), revision-reports (INV-013, INV-014), craft-profile.json (INV-069, INV-079), audit-reports (INV-027, INV-081)
- **Structural (14)**: Enforced via directory structure (INV-032, INV-074, INV-075), story-config.json (INV-026), series-kb (INV-066), beta-feedback (INV-068)

---

## Design Rationale

1. **Subcategorized world-bible**: 5 files instead of 1 monolith per INV-032 and INV-074 (independently loadable). Agents that need only magic rules don't load all geography.

2. **Per-chapter file pattern**: `chapters/{N}/`, `revision-reports/{N}/`, `beta-feedback/{N}/` — enables sequential chapter production (INV-012) without loading all chapters at once.

3. **6 cross-cutting tracker artifacts**: Separated by concern (continuity vs. foreshadowing vs. emotional state vs. mystery boxes) rather than one monolith. Each tracker has a focused schema that its primary consumers can parse efficiently.

4. **Craft-profile as R-M-W with lock**: Only artifact that transitions from writable to read-only mid-pipeline. This enforces INV-079 (selected tools become binding) at the schema level.

5. **Beta feedback as 5 independent files + synthesis**: Per INV-068, each lens must be independent. Structured per-lens schemas enable the synthesizer to de-duplicate across lenses while preserving lens-specific context.

6. **Series KB at series level**: Lives outside per-book directory (INV-066). Append-mostly design (INV-070) with explicit unresolved-thread disposition tracking (INV-071) for sequel support.
