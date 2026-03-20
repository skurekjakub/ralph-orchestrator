# Depth Analysis — Romantic Fantasy Writer Agent System

**Analyzer**: fractal-factory-depth-analyzer  
**Run**: Pass 2 / depth-analysis (iteration 1)  
**Date**: 2026-03-16  
**Domain**: romantic-fantasy-writer (14 subdomains, 81 invariants, 80-agent budget, maxDepth=3)

---

## Executive Summary

Analyzed 9 phase coordinators against depth-2 vs depth-3 criteria. **5 coordinators warrant depth-3 hierarchy**, **4 remain at depth-2**. Total estimated agents: **68 of 80** (85% budget utilization, 12 agents headroom). No depth-3 decisions required reduction.

| Decision | Coordinators |
|---|---|
| **Depth-3** (5) | worldbuilding, character, plotting, drafting, beta-reading |
| **Depth-2** (4) | concept, style, revision, polish |

---

## Per-Coordinator Decision Table

| Coordinator | Complexity | Specialists | Cross-Cutting | Subdomain Groups | Invariants | Exemplar D3? | **Decision** | Trigger(s) |
|---|---|---|---|---|---|---|---|---|
| concept-coordinator | medium | 3 (≤8 ✓) | 3 (≤3 ✓) | 1 (≤3 ✓) | 16 | No | **depth-2** | None |
| worldbuilding-coordinator | high | 6 (≤8 ✓) | 3 (≤3 ✓) | **5 (>3 ✗)** | 12 | No | **depth-3** | Subdomain groups |
| character-coordinator | high | 5 (≤8 ✓) | **4 (>3 ✗)** | 3 (≤3 ✓) | 16 | No | **depth-3** | Cross-cutting |
| plotting-coordinator | high | 6 (≤8 ✓) | **4 (>3 ✗)** | **4 (>3 ✗)** | 41 | No | **depth-3** | Cross-cutting + subdomain groups |
| style-coordinator | medium | 3 (≤8 ✓) | 3 (≤3 ✓) | 2 (≤3 ✓) | 14 | No | **depth-2** | None |
| drafting-coordinator | high | 5 (≤8 ✓) | **4 (>3 ✗)** | 3 (≤3 ✓) | **47** | No | **depth-3** | Cross-cutting |
| revision-coordinator | high | 4 (≤8 ✓) | 2 (≤3 ✓) | 3 (≤3 ✓) | 28 | No | **depth-2** | None |
| beta-reading-coordinator | high | 7 (≤8 ✓) | 2 (≤3 ✓) | **5 (>3 ✗)** | 20 | No | **depth-3** | Subdomain groups |
| polish-coordinator | medium | 3 (≤8 ✓) | 1 (≤3 ✓) | 2 (≤3 ✓) | 10 | No | **depth-2** | None |

### Threshold Legend
- Direct specialists: ≤8 → depth-2, >8 → depth-3
- Cross-cutting concerns: ≤3 → depth-2, >3 → depth-3
- Subdomain groups: ≤3 → depth-2, >3 → depth-3
- Exemplar pattern: only triggers if exemplar hierarchy explicitly uses depth-3 (the fractal-factory exemplar uses depth-2)

---

## Depth-3 Coordinator Details

### 1. Worldbuilding Coordinator (depth-3)

**Trigger**: 5 subdomain groups (geography, magic-system, politics, culture, history)

**Sub-coordinator grouping**:

```
worldbuilding-coordinator
├── physical-world-coordinator
│   ├── geography-builder
│   ├── culture-builder
│   └── history-builder
├── systems-world-coordinator
│   ├── magic-system-designer
│   └── political-structure-builder
└── worldbuilding-auditor (direct specialist)
```

**Rationale**: The 5 world-bible sub-areas split into two natural clusters based on dependency patterns. Physical-world areas (geography, culture, history) share heavy spatial and temporal cross-references — geography constrains where cultures develop, history explains how both evolved. Systems-world areas (magic, politics) define rule systems that constrain everything else — who holds power, what magic enables or forbids, how governance works. These two clusters have different routing patterns: physical-world specialists reference each other iteratively, while systems-world specialists must be checked for mutual consistency (magic ↔ politics).

**Agent count**: 1 coordinator + 2 sub-coordinators + 5 specialists + 1 auditor = **9 agents**

---

### 2. Character Coordinator (depth-3)

**Trigger**: 4 cross-cutting concerns (adversarial-consistency, series-knowledge-management, multi-pov-craft, emotional-resonance)

**Sub-coordinator grouping**:

```
character-coordinator
├── core-characters-coordinator
│   ├── protagonist-profiler
│   └── romance-arc-designer
├── ensemble-coordinator
│   ├── supporting-cast-developer
│   └── character-voice-designer
└── character-auditor (direct specialist)
```

**Rationale**: Character development operates at two distinct levels. Core character creation (protagonist depth — wounds, desires, growth arc; romance arc dynamics — chemistry, conflict, emotional escalation) works on deep individual characterization and the central relationship. Ensemble management (supporting cast mini-arcs, per-character voice calibration) works on consistency and distinctiveness across the full cast. The multi-POV craft concern especially benefits from this split: the ensemble-coordinator specifically handles voice differentiation, while core-characters-coordinator handles the emotional resonance depth of the leads.

**Agent count**: 1 coordinator + 2 sub-coordinators + 4 specialists + 1 auditor = **8 agents**

---

### 3. Plotting Coordinator (depth-3) — DOUBLE TRIGGER

**Triggers**: 4 cross-cutting concerns AND 4 subdomain groups

**Sub-coordinator grouping**:

```
plotting-coordinator
├── structural-design-coordinator
│   ├── structure-selector
│   ├── dual-arc-builder
│   └── tension-mapper
├── chapter-design-coordinator
│   ├── chapter-outliner
│   └── scene-beat-designer
└── plot-auditor (direct specialist)
```

**Rationale**: The strongest depth-3 case by trigger count. Plotting is the second-most invariant-dense subdomain (41 invariants: 15 behavioral, 14 quality, 8 structural, 4 workflow). The structural-design vs chapter-design split reflects a genuine difference in scope and iteration pattern:
- **Structural design** makes whole-story decisions: which narrative framework (three-act, Save the Cat, Hero's Journey), how the dual arcs (fantasy plot + romance) interleave across the full book, where macro tension peaks and valleys fall. These are decided once and constrain everything downstream.
- **Chapter design** makes per-chapter granular decisions: specific POV/goal/conflict/beats for each chapter, Five Commandments per scene, hook placement. These iterate across N chapters and consume structural-design outputs.

The 4 cross-cutting concerns (adversarial-consistency, craft-knowledge-systems, continuity-tracking, reader-experience-design) add further routing complexity that benefits from sub-coordinator isolation.

**Agent count**: 1 coordinator + 2 sub-coordinators + 5 specialists + 1 auditor = **9 agents**

---

### 4. Drafting Coordinator (depth-3) — STRONGEST CASE

**Trigger**: 4 cross-cutting concerns (adversarial-consistency, continuity-tracking, craft-knowledge-systems, multi-pov-craft)

**Additional justification**: **47 invariants** — the highest of any subdomain (14 behavioral, 26 quality, 4 workflow, 3 structural). The 26 quality invariants alone exceed the total invariant count of most subdomains.

**Sub-coordinator grouping**:

```
drafting-coordinator
├── creative-writing-coordinator
│   ├── chapter-drafter
│   └── pov-voice-maintainer
├── quality-integration-coordinator
│   ├── continuity-integrator
│   └── craft-enforcer
└── chapter-auditor (direct specialist)
```

**Rationale**: Chapter drafting is the most demanding phase in the system. Each chapter cycle requires two fundamentally different streams:
1. **Creative writing stream**: The chapter-drafter writes prose following the outline, maintaining narrative flow, and the POV-voice-maintainer ensures character voice consistency and distinctiveness per POV section. This stream prioritizes creative quality and coherence.
2. **Quality integration stream**: The continuity-integrator checks each chapter against the running continuity tracker (character locations, timeline, knowledge state, open threads), and the craft-enforcer validates that selected craft-tool invariants are satisfied (foreshadowing callbacks planted, scene commandments met, emotional beats hit). This stream prioritizes correctness and invariant enforcement.

These two streams have different dependencies, different artifact inputs, and different failure modes. The creative-writing-coordinator routes based on chapter outlines and style guides. The quality-integration-coordinator routes based on the continuity tracker, craft profile, and foreshadowing ledger. Separating them keeps routing tables focused and makes the per-chapter loop structure clearer.

**Agent count**: 1 coordinator + 2 sub-coordinators + 4 specialists + 1 auditor = **9 agents**

---

### 5. Beta-Reading Coordinator (depth-3)

**Trigger**: 5 subdomain groups (romance-reader, fantasy-reader, craft-reader, sensitivity-reader, originality-reader)

**Sub-coordinator grouping**:

```
beta-reading-coordinator
├── genre-lens-coordinator
│   ├── romance-reader
│   └── fantasy-reader
├── craft-lens-coordinator
│   ├── craft-reader
│   ├── sensitivity-reader
│   └── originality-reader
└── beta-synthesizer (direct specialist)
```

**Rationale**: The 5 beta reader lenses naturally cluster into two perspectives:
- **Genre lenses** (romance-reader + fantasy-reader): Evaluate whether the book delivers on its genre promises — HEA/HFN satisfaction, chemistry and emotional escalation for romance; worldbuilding immersion, magic consistency, and plot tension for fantasy. These readers assess *content* fulfillment.
- **Craft lenses** (craft-reader + sensitivity-reader + originality-reader): Evaluate the quality of execution — prose quality, pacing, structure for craft; representation, harmful trope avoidance, cultural accuracy for sensitivity; cliché detection, fresh elements, comp-title differentiation for originality. These readers assess *execution* quality.

Each cluster produces differently-structured feedback (genre feedback maps to arc beats and world elements; craft feedback maps to line-level and structural issues). The beta-synthesizer aggregates both clusters into a unified report. Depth-3 cleanly maps this two-cluster fan-out → synthesis pattern.

**Agent count**: 1 coordinator + 2 sub-coordinators + 5 specialists + 1 synthesizer = **9 agents**

---

## Depth-2 Coordinator Details

### Concept Coordinator (depth-2)
- **3 specialists**: concept-developer, craft-profile-selector, concept-auditor
- **Why depth-2 suffices**: Low specialist count, single conceptual domain (distilling inputs into a story concept), and all 3 cross-cutting concerns are at the threshold but manageable in a flat routing table. 16 invariants are moderate.

### Style Coordinator (depth-2)
- **3 specialists**: style-analyzer, style-guide-writer, style-auditor
- **Why depth-2 suffices**: Tight, focused scope (analyze reference fiction → produce style guide → audit it). Only 2 subdomain groups and 14 invariants. The sequential analyze→write→audit pattern needs no sub-routing.

### Revision Coordinator (depth-2)
- **4 specialists**: developmental-editor, line-editor, copy-editor, revision-auditor
- **Why depth-2 suffices**: Despite 28 invariants (third-highest), the three editing passes follow a clean sequential pattern (developmental → line → copy → audit). Only 2 cross-cutting concerns. The 3 subdomain groups are at threshold but don't exceed it. Each editing pass is a distinct, well-bounded task that doesn't need sub-routing.

### Polish Coordinator (depth-2)
- **3 specialists**: proofreader, summary-generator, series-KB-promoter
- **Why depth-2 suffices**: Lightest coordinator in the system — 10 invariants, 1 cross-cutting concern, 2 subdomain groups. Clean sequential flow: proofread → generate summaries → promote to series KB → package.

---

## Cross-Cutting Subdomain Implementation

The 4 cross-cutting subdomains (adversarial-consistency, series-knowledge-management, continuity-tracking, craft-knowledge-systems) are **not implemented as standalone coordinators**. Instead:

| Cross-Cutting Subdomain | Implementation Strategy |
|---|---|
| adversarial-consistency | Embedded per-phase auditors (already counted as `*-auditor` specialist in each phase coordinator) |
| series-knowledge-management | Shared specialist `series-kb-manager` invoked by concept, worldbuilding, character, and polish coordinators |
| continuity-tracking | Shared specialist `continuity-tracker` invoked by drafting, revision, and beta-reading coordinators |
| craft-knowledge-systems | 3 shared specialists: `foreshadowing-architect`, `emotional-throughline-tracker`, `symbolic-motif-tracker` |

**Total shared cross-cutting agents**: 5

---

## Budget Impact Analysis

| Category | Agents |
|---|---|
| Orchestrator | 1 |
| Guide | 1 |
| Depth-2 coordinators (4) | 4 coordinators + 13 specialists = **17** |
| Depth-3 coordinators (5) | 5 coordinators + 10 sub-coordinators + 29 specialists = **44** |
| Cross-cutting shared | **5** |
| **Total** | **68** |
| **Budget** | **80** |
| **Headroom** | **12 agents (15%)** |

### Headroom Allocation Guidance

The 12-agent headroom is intentionally preserved for:
1. **Gap-hunting additions** (most likely): Additional specialists discovered to be needed during gap-hunting cycles (e.g., a dedicated subplot-tracker for plotting, or a per-POV style-variant specialist for style calibration)
2. **Adversarial strengthening**: Additional auditors if verification reveals certain phases need tighter gates
3. **Series production**: A dedicated sequel-setup specialist might emerge as needed for series-aware artifact handling

### Depth-3 vs All-Depth-2 Comparison

| Metric | All depth-2 | Selected depth-3 (actual) | Delta |
|---|---|---|---|
| Total agents | 58 | 68 | +10 |
| Sub-coordinators | 0 | 10 | +10 |
| Max routing table size | 7 rows | 5 rows | −2 |
| Coordinator complexity | High (7 specialists to route) | Moderate (sub-coords reduce span) | Improved |

The 10-agent cost of depth-3 buys meaningfully simpler routing tables for the 5 most complex creative phases. Each sub-coordinator has 2–3 specialists (well within a single routing table), while the parent coordinators route to 2–3 children (sub-coordinators + direct specialists like auditors).

---

## Reduced Decisions

**None**. All 5 depth-3 recommendations fit within the 80-agent budget (68 agents used). No depth-3 decisions were reduced to depth-2. The budget check passed without requiring any adjustments.
