# Romantic Fantasy Writer — Agent Family Map

> 66 agents · 11 phases · claude-opus-4.6 · fractal router architecture

---

## Pipeline Overview

```
User ──► Guide ──► Orchestrator ──► Phase 1–11 (sequential) ──► Delivery back to Guide
```

| # | Phase | Coordinator | Sub-coords | Specialists | Auditor | Per-chapter? |
|---|-------|-------------|-----------|-------------|---------|-------------|
| 1 | Concept | concept-coordinator | — | 2 | concept-auditor | No |
| 2 | Worldbuilding | worldbuilding-coordinator | 2 | 5 | worldbuilding-auditor | No |
| 3 | Character | character-coordinator | 2 | 4 | character-auditor | No |
| 4 | Plotting | plotting-coordinator | 2 | 5 | plotting-auditor | No |
| 5 | Style Calibration | style-coordinator | — | 2 | style-auditor | No |
| — | Craft Tracking Init | *(cross-cutting)* | — | 1 | — | No |
| 6 | Drafting | drafting-coordinator | 2 | 4 | drafting-auditor | **Yes** |
| — | Continuity Verification | *(cross-cutting)* | — | 1 | — | No |
| 7 | Revision | revision-coordinator | — | 4 | revision-auditor | **Yes** |
| 8 | Beta-Reading | beta-reading-coordinator | 2 | 6 | beta-reading-auditor | **Yes** |
| 9 | Polish | polish-coordinator | — | 2 | — | **Yes** |
| 10 | Series KB | — | — | 1 | — | No |
| 11 | Delivery | — | — | 1 | — | No |

---

## Full Agent Hierarchy

```
romantic-fantasy-writer-guide                          ← sole user-facing agent
  └─ romantic-fantasy-writer                           ← session orchestrator
     │
     ├─ PHASE 1: CONCEPT
     │  └─ concept-coordinator
     │     ├─ concept-developer                        [specialist]
     │     ├─ craft-profile-selector                   [specialist]
     │     └─ concept-auditor                          [auditor / phase gate]
     │
     ├─ PHASE 2: WORLDBUILDING
     │  └─ worldbuilding-coordinator
     │     ├─ physical-world-coordinator               [sub-coordinator]
     │     │  ├─ geography-builder                     [specialist]
     │     │  ├─ culture-builder                       [specialist]
     │     │  └─ history-builder                       [specialist]
     │     ├─ systems-world-coordinator                [sub-coordinator]
     │     │  ├─ magic-system-designer                 [specialist]
     │     │  └─ political-structure-builder            [specialist]
     │     └─ worldbuilding-auditor                    [auditor / phase gate]
     │
     ├─ PHASE 3: CHARACTER
     │  └─ character-coordinator
     │     ├─ core-characters-coordinator              [sub-coordinator]
     │     │  ├─ protagonist-profiler                  [specialist]
     │     │  └─ romance-arc-designer                  [specialist]
     │     ├─ ensemble-coordinator                     [sub-coordinator]
     │     │  ├─ supporting-cast-developer             [specialist]
     │     │  └─ character-voice-designer              [specialist]
     │     └─ character-auditor                        [auditor / phase gate]
     │
     ├─ PHASE 4: PLOTTING
     │  └─ plotting-coordinator
     │     ├─ structural-design-coordinator            [sub-coordinator]
     │     │  ├─ structure-selector                    [specialist]
     │     │  ├─ dual-arc-builder                      [specialist]
     │     │  └─ tension-mapper                        [specialist]
     │     ├─ chapter-design-coordinator               [sub-coordinator]
     │     │  ├─ chapter-outliner                      [specialist]
     │     │  └─ scene-beat-designer                   [specialist]
     │     └─ plotting-auditor                         [auditor / phase gate]
     │
     ├─ PHASE 5: STYLE CALIBRATION
     │  └─ style-coordinator
     │     ├─ style-analyzer                           [specialist]
     │     ├─ style-guide-writer                       [specialist]
     │     └─ style-auditor                            [auditor / phase gate]
     │
     ├─ ── CROSS-CUTTING: craft-tracker initialized ──
     │
     ├─ PHASE 6: DRAFTING  (sequential per chapter)
     │  └─ drafting-coordinator
     │     ├─ creative-writing-coordinator             [sub-coordinator, per chapter]
     │     │  ├─ chapter-drafter                       [specialist]
     │     │  └─ pov-voice-maintainer                  [specialist]
     │     ├─ quality-integration-coordinator          [sub-coordinator, per chapter]
     │     │  ├─ continuity-integrator                 [specialist]
     │     │  └─ craft-enforcer                        [specialist]
     │     └─ drafting-auditor                         [auditor / per-chapter gate]
     │
     ├─ ── CROSS-CUTTING: continuity-tracker full verification ──
     │
     ├─ PHASE 7: REVISION  (sequential per chapter)
     │  └─ revision-coordinator
     │     ├─ developmental-editor                     [specialist — edit pass 1]
     │     ├─ line-editor                              [specialist — edit pass 2]
     │     ├─ copy-editor                              [specialist — edit pass 3]
     │     ├─ chapter-reviser                          [specialist — applies fixes]
     │     └─ revision-auditor                         [auditor / per-chapter gate]
     │
     ├─ PHASE 8: BETA-READING  (per chapter, 5 lenses parallel)
     │  └─ beta-reading-coordinator
     │     ├─ genre-lens-coordinator                   [sub-coordinator]
     │     │  ├─ romance-beta-reader                   [specialist — lens 1]
     │     │  └─ fantasy-beta-reader                   [specialist — lens 2]
     │     ├─ craft-lens-coordinator                   [sub-coordinator]
     │     │  ├─ craft-beta-reader                     [specialist — lens 3]
     │     │  ├─ sensitivity-beta-reader               [specialist — lens 4]
     │     │  └─ originality-beta-reader               [specialist — lens 5]
     │     ├─ beta-synthesizer                         [specialist — aggregates]
     │     └─ beta-reading-auditor                     [auditor / per-chapter gate]
     │
     │     ↕ revision loop if verdict == revision-required
     │
     ├─ PHASE 9: POLISH  (per chapter)
     │  └─ polish-coordinator
     │     ├─ polisher                                 [specialist]
     │     └─ summary-generator                        [specialist]
     │
     ├─ PHASE 10: SERIES KB
     │  └─ series-kb-manager                           [specialist]
     │
     └─ PHASE 11: DELIVERY
        └─ delivery-assembler                          [specialist]
```

All agent names above are prefixed with `romantic-fantasy-writer-` (omitted for readability).

---

## Phase Details

### Phase 1 — Concept

**Goal:** Crystallize story vision from user input into binding concept document.

```
concept-developer → craft-profile-selector → concept-auditor
                                                  │
                                          PASS ───┤──── FAIL → retry both specialists
                                                  ↓
                                            phase complete
```

- **concept-developer** — Refines raw user premise into `story-concept.json`: thematic pillars, tone contract, comp titles, target audience, genre balance, romance arc type, estimated chapter count
- **craft-profile-selector** — Selects 5–8 of 26 craft tools (T1–T26) applicable to this story; produces `craft-profile.json` (binding for the entire manuscript)
- **concept-auditor** — Genre compliance, thematic coherence, craft profile completeness, alignment with user intent

### Phase 2 — Worldbuilding

**Goal:** Design complete fantasy world and its systems.

```
physical-world-coordinator ──┐
  geography-builder          │
  culture-builder            ├──► worldbuilding-auditor
  history-builder            │          │
                             │   PASS ──┤── FAIL → retry all
systems-world-coordinator ───┘          ↓
  magic-system-designer           phase complete
  political-structure-builder
```

- **geography-builder** — Locations, landscapes, climate, travel routes; locations serve as emotional stages for romance
- **culture-builder** — Customs, religions, social hierarchies, naming conventions; cultural norms create romantic obstacles
- **history-builder** — Timeline, legends, prophecies, historical figures; raw material for foreshadowing
- **magic-system-designer** — Rules, costs, limitations (Sanderson's Laws); magic as emotional metaphor and power dynamic
- **political-structure-builder** — Factions, governance, alliances; external forces that constrain characters
- **worldbuilding-auditor** — Cross-references all 5 world-bible files for internal consistency

### Phase 3 — Character

**Goal:** Develop all major characters with psychological depth and distinct voices.

```
core-characters-coordinator ──┐
  protagonist-profiler        │
  romance-arc-designer        ├──► character-auditor
                              │          │
ensemble-coordinator ─────────┘   PASS ──┤── FAIL → retry all
  supporting-cast-developer               ↓
  character-voice-designer          phase complete
```

- **protagonist-profiler** — Deep psychological profiles for leads: wound, desire, fear, lie, ghost, need, voice fingerprint, sensory signature
- **romance-arc-designer** — Maps stages of attraction, obstacles, black moment, resolution
- **supporting-cast-developer** — Antagonists, mentors, confidants, rivals; every character serves narrative function
- **character-voice-designer** — Refines voice fingerprints for all speaking characters; ensures sufficient contrast across cast
- **character-auditor** — Psychological coherence, voice distinctness, character agency, romance arc earning

### Phase 4 — Plotting

**Goal:** Complete plot structure with chapter-by-chapter planning.

```
structural-design-coordinator ──┐
  structure-selector            │
  dual-arc-builder              ├──► plotting-auditor
  tension-mapper                │          │
                                │   PASS ──┤── FAIL → retry all
chapter-design-coordinator ─────┘          ↓
  chapter-outliner                   phase complete
  scene-beat-designer
```

- **structure-selector** — Chooses framework (3-act, Save the Cat, Hero's Journey, hybrid); maps act boundaries and key beats
- **dual-arc-builder** — Maps fantasy + romance arcs in parallel showing intersections and complications
- **tension-mapper** — Chapter-by-chapter tension chart; catches flat stretches and pacing problems
- **chapter-outliner** — Detailed per-chapter outlines: POV, scene goals, conflict, emotional arc, beats
- **scene-beat-designer** — Decomposes outlines into granular beats: scene-sequel structure, MRU units, value shifts, micro-tension
- **plotting-auditor** — Plot coherence, dual-arc interweaving, pacing, stakes escalation, craft tool implementation

### Phase 5 — Style Calibration

**Goal:** Establish prose style standards before any drafting begins.

```
style-analyzer → style-guide-writer → style-auditor
                                          │
                                   PASS ──┤── FAIL → retry all
                                          ↓
                                    phase complete
```

- **style-analyzer** — Analyzes optional user style samples or genre conventions for abstract stylistic patterns (rhythm, register, density)
- **style-guide-writer** — Comprehensive style guide: tone, vocabulary, sentence rhythm, POV rules, metaphor preferences, dialogue conventions, per-character voice calibration
- **style-auditor** — Verifies guide is comprehensive, internally consistent, honors tone contract, provides sufficient per-character differentiation

### Cross-Cutting — Craft Tracker

Initialized after Style phase, operates through Drafting → Polish.

Maintains four persistent artifacts:
1. **Foreshadowing Ledger** (T15) — every plant and its intended payoff
2. **Mystery Box Inventory** (T23) — active unresolved reader questions (target: 3–7 active)
3. **Emotional Throughline Chart** (T20) — per-character emotional states at chapter boundaries
4. **Symbolic Motif Registry** (T16) — recurring symbols and their appearances

### Phase 6 — Drafting

**Goal:** Generate publication-quality prose, chapter by chapter (sequential).

```
FOR EACH CHAPTER (sequential: Ch N must pass before Ch N+1 begins):

  creative-writing-coordinator ──┐
    chapter-drafter              │
    pov-voice-maintainer         ├──► drafting-auditor
                                 │          │
  quality-integration-coord ─────┘   PASS ──┤── FAIL → retry chapter
    continuity-integrator                    ↓
    craft-enforcer                     next chapter
                                       (or phase complete)
```

- **chapter-drafter** — Transforms outline into prose; lush but not purple, emotionally resonant, distinct POV voices
- **pov-voice-maintainer** — Verifies POV distinctive within 3–4 sentences; compares against fingerprint
- **continuity-integrator** — Checks against world rules, character locations, timeline, naming, knowledge states
- **craft-enforcer** — Verifies all selected craft tools are correctly applied in the actual prose
- **drafting-auditor** — Outline compliance, prose quality, micro-tension, voice distinctness, craft compliance. Can FAIL a chapter.

### Cross-Cutting — Continuity Tracker

Runs after all chapters drafted, before Revision. Full-manuscript verification of:
- Character locations · Timeline progression · Character knowledge states
- Active story promises · Naming consistency · Information asymmetry

### Phase 7 — Revision

**Goal:** Three-pass editorial review + implementation, per chapter.

```
FOR EACH CHAPTER:

  developmental-editor ──► line-editor ──► copy-editor
           │                    │                │
           └──── all 3 reports ─┘────────────────┘
                        │
                        ↓
                 chapter-reviser  (applies fixes, cites which finding prompted each)
                        │
                        ↓
                 revision-auditor
                        │
                 PASS ──┤── FAIL → back to reviser
                        ↓
                  next chapter
```

- **developmental-editor** — Macro structure: plot progression, character arc, pacing, thematic resonance, dual-arc interweave
- **line-editor** — Sentence-level: cliché detection, show-vs-tell, dialogue naturalism, micro-tension, MRU structure
- **copy-editor** — Factual accuracy within world rules, name/place spelling, timeline, grammar, punctuation
- **chapter-reviser** — Implements all findings; every modification cites its source; prioritizes critical → major → minor
- **revision-auditor** — Verifies all critical/major findings addressed; re-audits for regression; compares revised vs draft

### Phase 8 — Beta-Reading

**Goal:** Five independent reader lenses identify remaining issues; synthesis feeds revision loop.

```
FOR EACH CHAPTER:

  genre-lens-coordinator ──────────┐
    romance-beta-reader  (lens 1)  │
    fantasy-beta-reader  (lens 2)  │
                                   ├──► beta-synthesizer ──► beta-reading-auditor
  craft-lens-coordinator ──────────┘          │                      │
    craft-beta-reader    (lens 3)             │               PASS ──┤── FAIL → back to synthesis
    sensitivity-reader   (lens 4)             │                      │
    originality-reader   (lens 5)             │               verdict: revision-required?
                                              │                      │
                                              │               YES ───┤── NO → next chapter
                                              │                      ↓
                                              │            back to REVISION PHASE
                                              │            (tracked cycle count vs max)
```

- **romance-beta-reader** — Emotional satisfaction, chemistry, romantic beat pacing, vulnerability escalation
- **fantasy-beta-reader** — Worldbuilding immersion, magic consistency, plot logic, information asymmetry
- **craft-beta-reader** — Craft tool compliance, scene structure, pacing rhythm, foreshadowing, motifs
- **sensitivity-beta-reader** — Representation quality, stereotypes, cultural sensitivity, consent portrayal
- **originality-beta-reader** — Zero-tolerance plagiarism check; flags derivative content
- **beta-synthesizer** — Aggregates 5 lens reports; de-duplicates; reconciles conflicts; assigns composite severity
- **beta-reading-auditor** — Verifies all lenses gave substantive feedback (not rubber-stamps); verifies synthesis accuracy

### Phase 9 — Polish

**Goal:** Final prose refinement and summary extraction.

```
FOR EACH CHAPTER:

  polisher ──► summary-generator
```

- **polisher** — Smooths transitions, tightens prose, eliminates awkwardness, paragraph rhythm, prose music
- **summary-generator** — Extracts structured summaries for series KB; tracks character developments, relationship changes, unresolved threads

No auditor — quality gates completed in prior phases.

### Phase 10 — Series KB Update

- **series-kb-manager** — Promotes finalized facts from book artifacts into series-level KB; canonical record of world facts, character histories, relationships, resolved/unresolved threads; ensures sequels cannot contradict book 1

### Phase 11 — Delivery

- **delivery-assembler** — Compiles delivery package: quality metrics, word counts, chapter roster, craft tool compliance summary, invariant adherence report, outstanding items; verifies all artifacts exist and are consistent

---

## Agent Census

| Role | Count | Agents |
|------|-----:|--------|
| User-facing | 1 | guide |
| Orchestrator | 1 | romantic-fantasy-writer |
| Phase Coordinators | 9 | concept-, worldbuilding-, character-, plotting-, style-, drafting-, revision-, beta-reading-, polish-coordinator |
| Sub-Coordinators | 10 | physical-world-, systems-world-, core-characters-, ensemble-, structural-design-, chapter-design-, creative-writing-, quality-integration-, genre-lens-, craft-lens-coordinator |
| Auditors | 8 | concept-, worldbuilding-, character-, plotting-, style-, drafting-, revision-, beta-reading-auditor |
| Cross-Cutting | 2 | craft-tracker, continuity-tracker |
| Specialists | 35 | *(see hierarchy above)* |
| **Total** | **66** | |

---

## Architectural Patterns

### Adversarial Phase Gates
Every creative phase includes a dedicated auditor that can **block** progression. Failed phases retry their specialist pipeline. This is the "no silent failures" principle.

### Pure Router Purity
Coordinators (main and sub) are **pure routers**: they read status files, evaluate routing logic, and dispatch specialists. They never perform substantive creative work.

### Sequential Chapter Constraint
Drafting, Revision, Beta-Reading, and Polish process chapters **in order** — chapter N must complete before chapter N+1 begins. This preserves narrative continuity and character knowledge state.

### Revision–Beta Loop
If a chapter fails beta-reading with verdict `revision-required`, it loops back through the full Revision phase. The orchestrator tracks `revisionBetaCycles` vs `maxRevisionBetaCycles` to prevent infinite loops.

### Five Independent Beta Lenses
Five completely independent reader perspectives (romance, fantasy, craft, sensitivity, originality) ensure no single angle dominates. The synthesizer reconciles them into a unified revision mandate.

### Craft Tool Binding
Once `craft-profile-selector` chooses applicable tools (from T1–T26), those become **binding** for the entire manuscript. Auditors at every downstream phase verify compliance.

### Three-Pass Mandatory Review
Every chapter in Revision undergoes exactly three edit passes (developmental → line → copy) before the reviser acts, ensuring multi-angle scrutiny.

### User Interface Isolation
Only `guide` interacts with the user. All other 65 agents are fully autonomous.

---

## Artifact Map

| Phase | Key Artifacts |
|-------|--------------|
| Concept | `story-concept.json`, `craft-profile.json` |
| Worldbuilding | `world-bible/` — geography, culture, history, magic-system, politics `.json` |
| Character | `characters/index.json`, `characters/CHAR-NNN.json` (×14), `romance-arc-design.json` |
| Plotting | `plot-structure.json`, `dual-arc-timeline.json`, `tension-map.json`, `chapter-outlines/{N}.json` |
| Style | `style-guide.json` |
| Drafting | `chapters/{N}/draft.md`, `continuity-tracker.json` |
| Revision | `chapters/{N}/revised.md`, `revision-reports/{N}/` (dev, line, copy `.json`) |
| Beta-Reading | `beta-feedback/{N}/` (5 lens `.json`), `beta-synthesis/{N}.json` |
| Polish | `chapters/{N}/final.md`, `chapter-summaries/{N}.json` |
| Series KB | `series-kb/index.json` |
| Delivery | `delivery-report.json` |
