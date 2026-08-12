# Romantic Fantasy Writer — Architecture Guide

## Overview

The **Romantic Fantasy Writer** is an autonomous multi-agent system that produces publication-quality romantic fantasy fiction. It takes a story idea as input and orchestrates 67 specialized agents through a 9-phase creative pipeline — from initial concept crystallization through worldbuilding, character development, plotting, prose style calibration, chapter drafting, multi-pass revision, simulated beta reading, and final polish.

The system is designed for **series production**: all artifacts are organized per-book with a shared series knowledge base, enabling seamless sequel creation where world, character, and continuity data carry forward automatically.

### Design Philosophy

1. **Agent-as-Function Pattern**: Every agent is a pure function — it reads input artifacts, performs exactly one task, writes output artifacts, and reports a status code. No agent maintains hidden state.

2. **Adversarial Quality Gates**: Every creative phase (concept through drafting) has a dedicated auditor agent that acts as a phase gate. Auditors use anti-laziness enforcement and can reject work, triggering revision loops.

3. **Two-Tier Quality System**: 81 non-negotiable invariants always apply (genre promise, consistency, voice distinctness, etc.), plus a **craft toolbox** of proven techniques selected per-story during the concept phase and enforced throughout.

4. **Filesystem Artifact Handoff**: Agents communicate exclusively through JSON artifacts and Markdown files on the filesystem. No agent calls another directly — coordinators read status files and dispatch the next agent.

5. **Depth-Adaptive Hierarchy**: Complex phases (worldbuilding, character, plotting, drafting, beta-reading) use 3-level deep hierarchies with sub-coordinators, while simpler phases (concept, style, revision, polish) use 2-level flat hierarchies.

---

## System Statistics

| Metric | Value |
|--------|-------|
| Total agents | 67 |
| Orchestrators | 1 |
| Coordinators | 9 |
| Sub-coordinators | 10 |
| Specialists | 46 |
| Guide (user-facing) | 1 |
| Artifact schemas | 18 |
| Skills | 9 |
| Invariants enforced | 81 |
| Golden test scenarios | 26 |
| Verification score | 1326/1326 (100%) |

---

## Creative Pipeline

The system executes a 9-phase sequential pipeline. Each phase must complete (pass its auditor gate) before the next begins.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CREATIVE PIPELINE                                    │
│                                                                             │
│  ┌─────────┐   ┌──────────────┐   ┌───────────┐   ┌──────────┐            │
│  │ CONCEPT  │──▶│ WORLDBUILDING│──▶│ CHARACTER │──▶│ PLOTTING │            │
│  │ Phase 1  │   │   Phase 2    │   │  Phase 3  │   │ Phase 4  │            │
│  │ depth-2  │   │   depth-3    │   │  depth-3  │   │ depth-3  │            │
│  └─────────┘   └──────────────┘   └───────────┘   └──────────┘            │
│       │               │                 │               │                   │
│       ▼               ▼                 ▼               ▼                   │
│    [Gate]          [Gate]           [Gate]          [Gate]                   │
│       │               │                 │               │                   │
│       ▼               ▼                 ▼               ▼                   │
│  ┌─────────┐   ┌──────────────┐   ┌───────────┐   ┌──────────────────┐    │
│  │  STYLE  │──▶│   DRAFTING   │──▶│ REVISION  │──▶│  BETA READING    │    │
│  │ Phase 5  │   │   Phase 6    │   │  Phase 7  │   │    Phase 8       │    │
│  │ depth-2  │   │   depth-3    │   │  depth-2  │   │    depth-3       │    │
│  └─────────┘   └──────────────┘   └───────────┘   └──────────────────┘    │
│       │               │                 │               │                   │
│       ▼               ▼                 ▼               ▼                   │
│    [Gate]          [Gate]        Revision ◀──────── Beta may                │
│                                  loop      request  revision               │
│                                    │                                        │
│                                    ▼                                        │
│                             ┌──────────┐                                    │
│                             │  POLISH  │                                    │
│                             │ Phase 9  │                                    │
│                             │ depth-2  │                                    │
│                             └──────────┘                                    │
│                                    │                                        │
│                                    ▼                                        │
│                              [DELIVERY]                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Cross-cutting agents (active throughout):
  • Continuity Tracker — maintains facts, positions, timeline
  • Series KB Manager — manages series-level knowledge base
  • Craft Tracker — tracks foreshadowing, symbolism, emotional throughline
```

### Phase Details

| Phase | Name | Purpose | Depth | Agents | Key Artifacts Produced |
|-------|------|---------|-------|--------|----------------------|
| 1 | Concept | Crystallize story idea into structured concept; select craft toolbox | 2 | 3 | `story-concept.json`, `craft-profile.json` |
| 2 | Worldbuilding | Build deeply subcategorized world bible | 3 | 8 | `world-bible/*.json` (geography, magic, politics, culture, history) |
| 3 | Character | Create protagonist profiles, romance arc, supporting cast, voice design | 3 | 7 | `characters/*.json`, `romance-arc-design.json` |
| 4 | Plotting | Select structure, build dual-arc timeline, chapter outlines, scene beats | 3 | 8 | `plot-structure.json`, `dual-arc-timeline.json`, `tension-map.json`, `chapter-outlines/*.json` |
| 5 | Style | Analyze reference fiction, produce prose style guide | 2 | 3 | `style-guide.json` |
| 6 | Drafting | Write chapters with voice maintenance and quality integration | 3 | 7 | `chapters/*/draft.md`, continuity/craft tracker updates |
| 7 | Revision | Three-pass editing (developmental → line → copy) then revision | 2 | 5 | `revision-reports/*/*.json`, `chapters/*/revised.md` |
| 8 | Beta Reading | Five simulated reader lenses plus synthesis | 3 | 8 | `beta-feedback/*/*.json`, `beta-synthesis/*.json` |
| 9 | Polish | Final proofread, summaries, series KB promotion, delivery assembly | 2 | 3 | `chapters/*/final.md`, `chapter-summaries/*.json`, `delivery-report.json` |

---

## Agent Hierarchy

```
romantic-fantasy-writer-guide (Guide — user-facing)
└── romantic-fantasy-writer (Session Orchestrator)
    │
    ├── concept-coordinator [depth-2, Phase 1]
    │   ├── concept-developer
    │   ├── craft-profile-selector
    │   └── concept-auditor ⚔️
    │
    ├── worldbuilding-coordinator [depth-3, Phase 2]
    │   ├── physical-world-coordinator (Sub-Coordinator)
    │   │   ├── geography-builder
    │   │   ├── culture-builder
    │   │   └── history-builder
    │   ├── systems-world-coordinator (Sub-Coordinator)
    │   │   ├── magic-system-designer
    │   │   └── political-structure-builder
    │   └── worldbuilding-auditor ⚔️
    │
    ├── character-coordinator [depth-3, Phase 3]
    │   ├── core-characters-coordinator (Sub-Coordinator)
    │   │   ├── protagonist-profiler
    │   │   └── romance-arc-designer
    │   ├── ensemble-coordinator (Sub-Coordinator)
    │   │   ├── supporting-cast-developer
    │   │   └── character-voice-designer
    │   └── character-auditor ⚔️
    │
    ├── plotting-coordinator [depth-3, Phase 4]
    │   ├── structural-design-coordinator (Sub-Coordinator)
    │   │   ├── structure-selector
    │   │   ├── dual-arc-builder
    │   │   └── tension-mapper
    │   ├── chapter-design-coordinator (Sub-Coordinator)
    │   │   ├── chapter-outliner
    │   │   └── scene-beat-designer
    │   └── plotting-auditor ⚔️
    │
    ├── style-coordinator [depth-2, Phase 5]
    │   ├── style-analyzer
    │   ├── style-guide-writer
    │   └── style-auditor ⚔️
    │
    ├── drafting-coordinator [depth-3, Phase 6]
    │   ├── creative-writing-coordinator (Sub-Coordinator)
    │   │   ├── chapter-drafter
    │   │   └── pov-voice-maintainer
    │   ├── quality-integration-coordinator (Sub-Coordinator)
    │   │   ├── continuity-integrator
    │   │   └── craft-enforcer ⚔️
    │   └── drafting-auditor ⚔️
    │
    ├── revision-coordinator [depth-2, Phase 7]
    │   ├── developmental-editor
    │   ├── line-editor
    │   ├── copy-editor
    │   ├── chapter-reviser
    │   └── revision-auditor ⚔️
    │
    ├── beta-reading-coordinator [depth-3, Phase 8]
    │   ├── genre-lens-coordinator (Sub-Coordinator)
    │   │   ├── romance-beta-reader
    │   │   └── fantasy-beta-reader
    │   ├── craft-lens-coordinator (Sub-Coordinator)
    │   │   ├── craft-beta-reader
    │   │   ├── sensitivity-beta-reader
    │   │   └── originality-beta-reader
    │   ├── beta-synthesizer
    │   └── beta-reading-auditor ⚔️
    │
    ├── polish-coordinator [depth-2, Phase 9]
    │   ├── polisher
    │   ├── summary-generator
    │   └── delivery-assembler
    │
    ├── continuity-tracker (Cross-Cutting) ⚔️
    ├── series-kb-manager (Cross-Cutting)
    └── craft-tracker (Cross-Cutting) ⚔️

Legend:
  ⚔️ = Anti-laziness enforcement (adversarial rules)
  Agent names shown without the "romantic-fantasy-writer-" prefix for readability
```

---

## Depth Decisions

Five coordinators use **depth-3** (3-level hierarchy with sub-coordinators), four use **depth-2** (flat):

| Coordinator | Depth | Rationale |
|-------------|-------|-----------|
| **Concept** | 2 | 3 specialists, single subdomain group — simple routing |
| **Worldbuilding** | **3** | 5 distinct world-bible sub-areas (geography, magic, politics, culture, history) split into physical-world vs systems-world routing patterns |
| **Character** | **3** | 4 cross-cutting concerns; core character creation vs ensemble management require different routing |
| **Plotting** | **3** | 41 invariants (second-highest), 4 subdomain groups; structural-design (whole-story) vs chapter-design (granular) split |
| **Style** | 2 | 3 specialists, 2 subdomain groups — simple analysis→guide flow |
| **Drafting** | **3** | 47 invariants (highest of any phase), 26 quality invariants; creative-writing vs quality-integration streams per chapter |
| **Revision** | 2 | Clean sequential pattern (dev→line→copy→revise), 4 specialists |
| **Beta Reading** | **3** | 5 reader lenses split into genre-lens (romance + fantasy) and craft-lens (craft + sensitivity + originality) clusters |
| **Polish** | 2 | 3 specialists, lightest coordinator in the system |

---

## Artifact Data Flow

Agents communicate through 18 artifact schemas organized in three tiers:

### Universal Infrastructure Artifacts

| Artifact | Purpose | Writers | Protocol |
|----------|---------|---------|----------|
| `story-config.json` | User-provided story parameters (idea, word count, mood, style samples) | Guide | create-once |
| `progress.json` | Pipeline execution state: active phase, chapter progress, gate statuses | Orchestrator | read-modify-write |
| `manifest.json` | Append-only audit trail of all agent actions | All agents | prepend-entry |
| `agents/*/status.json` | Per-agent routing signal (result code, summary, artifacts) | Each agent (own) | create-once-per-iteration |

### Domain Artifacts (by Phase)

```
story-config.json (User Input)
        │
        ▼
story-concept.json ──────────────────────────────────────┐
        │                                                 │
        ▼                                                 │
craft-profile.json ──────────────────────────────────┐    │
        │                                             │    │
        ├──────────▶ world-bible/                     │    │
        │            ├── geography.json               │    │
        │            ├── culture.json                 │    │
        │            ├── history.json                 │    │
        │            ├── magic-system.json            │    │
        │            └── politics.json                │    │
        │                    │                        │    │
        │                    ▼                        │    │
        │            characters/                      │    │
        │            ├── index.json                   │    │
        │            ├── {CHAR-NNN}.json              │    │
        │            └── romance-arc-design.json      │    │
        │                    │                        │    │
        │                    ▼                        ▼    ▼
        │            plot-structure.json ◀── craft-profile + story-concept
        │            dual-arc-timeline.json
        │            tension-map.json
        │            chapter-outlines/{N}.json
        │                    │
        │                    ▼
        │            style-guide.json ◀── style samples + concept
        │                    │
        │                    ▼
        │            chapters/{N}/
        │            ├── draft.md ◀── outline + style + characters + world
        │            ├── metadata.json
        │            ├── revised.md ◀── revision reports
        │            └── final.md ◀── beta synthesis + polish
        │                    │
        │                    ▼
        │            revision-reports/{N}/
        │            ├── developmental.json
        │            ├── line-edit.json
        │            └── copy-edit.json
        │                    │
        │                    ▼
        │            beta-feedback/{N}/
        │            ├── romance-lens.json
        │            ├── fantasy-lens.json
        │            ├── craft-lens.json
        │            ├── sensitivity-lens.json
        │            └── originality-lens.json
        │                    │
        │                    ▼
        │            beta-synthesis/{N}.json
        │                    │
        │                    ▼
        │            chapter-summaries/{N}.json
        │                    │
        │                    ▼
        └───────────▶ delivery-report.json
                     series-kb/index.json
```

### Cross-Cutting Tracker Artifacts

| Artifact | Purpose | Updated By |
|----------|---------|------------|
| `continuity-tracker.json` | Running record of established facts, character positions, timeline events | Continuity Tracker, Chapter Drafter |
| `foreshadowing-ledger.json` | Planted/resolved foreshadowing items | Craft Tracker, Chapter Drafter |
| `mystery-box-inventory.json` | Open/resolved mystery boxes | Craft Tracker, Chapter Drafter |
| `emotional-throughline.json` | Emotional arc progression per character | Craft Tracker, Chapter Drafter |
| `symbolic-motif-registry.json` | Recurring symbols and motifs | Craft Tracker |
| `information-asymmetry-map.json` | What each character knows vs reader knows | Continuity Tracker, Chapter Drafter |
| `series-kb/index.json` | Series-level knowledge base for sequel production | Series KB Manager |

---

## Quality Gates & Adversarial Auditors

### Phase Gate Pattern

Every creative phase (1–6) ends with an **auditor agent** that acts as an adversarial phase gate:

```
Specialists produce artifacts
        │
        ▼
   ┌──────────┐     ┌──────────┐
   │  Auditor  │────▶│  PASSED  │──▶ Next phase
   │ (⚔️ anti- │     └──────────┘
   │  laziness)│     ┌──────────┐
   │           │────▶│  FAILED  │──▶ Revision loop (specialists re-run)
   └──────────┘     └──────────┘
                     ┌──────────┐
                ────▶│ BLOCKED  │──▶ Escalate to orchestrator
                     └──────────┘
```

**Auditors with anti-laziness enforcement:**
- Concept Auditor, Worldbuilding Auditor, Character Auditor, Plotting Auditor
- Style Auditor, Drafting Auditor, Revision Auditor, Beta Reading Auditor
- Craft Enforcer, Craft Tracker

Anti-laziness means these agents have explicit instructions to be thorough, adversarial, and never approve work that merely "looks good enough."

### Revision-Beta Loop

After revision (Phase 7) and beta reading (Phase 8), a special loop may occur:

```
┌─────────────┐      ┌───────────────┐      ┌──────────────┐
│  Revision    │─────▶│  Beta Reading  │─────▶│ Beta says OK │──▶ Polish
│  (Phase 7)   │      │  (Phase 8)     │      └──────────────┘
└──────▲───────┘      └───────┬────────┘
       │                      │
       │              ┌──────────────────┐
       └──────────────│ Beta says revise │
                      └──────────────────┘
```

This loop has configurable bounds (`maxRevisionBetaCycles`) to prevent infinite cycling.

### Invariant Enforcement

The system enforces **81 invariants** organized into four categories:

| Category | Count | Examples |
|----------|-------|---------|
| **Behavioral** | ~30 | Genre promise (INV-001), character agency (INV-008), no deus ex machina (INV-009) |
| **Quality** | ~26 | Prose quality floor (INV-017), dialogue naturalism (INV-019), pacing variation (INV-020) |
| **Workflow** | ~12 | Outline before draft (INV-010), sequential chapters (INV-012), multi-pass review (INV-013) |
| **Structural** | ~13 | Continuity tracking (INV-011), revision traceability (INV-014), subcategorized world bible |

Key invariants include:
- **INV-001 Genre Promise**: Every story MUST be romantic fantasy — fantasy arc primary, romance arc essential
- **INV-002 Internal Consistency**: All worldbuilding details must be cross-referenced for contradictions
- **INV-003 Character Voice Distinctness**: Each POV character must have recognizably distinct voice
- **INV-004 Earned Emotional Beats**: Every major emotional beat must be properly set up
- **INV-010 Outline Before Draft**: No chapter drafted without a chapter-level outline
- **INV-012 Sequential Chapters**: Chapters produced in order; N+1 cannot start before N is drafted
- **INV-023 No Plagiarism**: Zero tolerance — all prose must be original

---

## Re-Entry and Convergence

### Auditor Rejection Retry

When an auditor rejects work, the coordinator re-dispatches the relevant specialists. Each coordinator has a `maxRetries` bound (typically 3). If retries are exhausted, the coordinator reports `blocked` and the orchestrator decides whether to proceed with gaps or halt.

### Revision-Beta Convergence

The revision→beta→revision loop is bounded by `maxRevisionBetaCycles`. If beta readers continue requesting revision after the cycle limit, the system proceeds with the best available version and notes the gap.

### Per-Chapter Iteration

Drafting, revision, beta-reading, and polish phases all operate **per-chapter**. The orchestrator tracks `currentChapter` in `progress.json` and the coordinator iterates through chapters sequentially (per INV-012).

```
For each chapter N (1..total):
  1. Drafting-coordinator drafts chapter N
  2. Revision-coordinator revises chapter N  
  3. Beta-reading-coordinator beta-reads chapter N
  4. If beta requests revision → loop to step 2
  5. Polish-coordinator polishes chapter N
```

---

## Series Production

The system is designed for **series-aware production** from day one:

1. **Series Knowledge Base** (`series-kb/index.json`): After each book, the Series KB Manager promotes world, character, and continuity data to the series-level KB.

2. **Sequel Configuration**: A new book's `story-config.json` can set `sequelOf` to reference a previous book's `storyId`, automatically inheriting the series KB.

3. **Continuity Across Books**: The continuity tracker and information asymmetry map carry forward, ensuring characters remember what happened in previous books.

---

## Infrastructure

### File Organization

All artifacts for a book are stored under a per-book directory:

```
books/
└── book-1/
    ├── story-config.json
    ├── story-concept.json
    ├── craft-profile.json
    ├── progress.json
    ├── manifest.json
    ├── world-bible/
    │   ├── geography.json
    │   ├── culture.json
    │   ├── history.json
    │   ├── magic-system.json
    │   └── politics.json
    ├── characters/
    │   ├── index.json
    │   └── CHAR-*.json
    ├── romance-arc-design.json
    ├── plot-structure.json
    ├── dual-arc-timeline.json
    ├── tension-map.json
    ├── chapter-outlines/
    │   └── {N}.json
    ├── style-guide.json
    ├── chapters/
    │   └── {N}/
    │       ├── draft.md
    │       ├── metadata.json
    │       ├── revised.md
    │       └── final.md
    ├── revision-reports/
    │   └── {N}/
    │       ├── developmental.json
    │       ├── line-edit.json
    │       └── copy-edit.json
    ├── beta-feedback/
    │   └── {N}/
    │       ├── romance-lens.json
    │       ├── fantasy-lens.json
    │       ├── craft-lens.json
    │       ├── sensitivity-lens.json
    │       └── originality-lens.json
    ├── beta-synthesis/
    │   └── {N}.json
    ├── chapter-summaries/
    │   └── {N}.json
    ├── continuity-tracker.json
    ├── foreshadowing-ledger.json
    ├── mystery-box-inventory.json
    ├── emotional-throughline.json
    ├── symbolic-motif-registry.json
    ├── information-asymmetry-map.json
    ├── audit-reports/
    │   └── {phase}/gate.json
    ├── agents/
    │   └── {agent}/status.json
    ├── delivery-report.json
    └── series-kb/
        └── index.json
```

### Write Protocols

| Protocol | Description | Used By |
|----------|-------------|---------|
| `create-once` | Written once, never modified | `story-config.json`, `story-concept.json` |
| `read-modify-write` | Read existing, merge changes, write back | `progress.json`, tracker artifacts |
| `prepend-entry` | New entries prepended (newest first) | `manifest.json` |
| `create-once-per-iteration` | Fresh file per retry cycle | `agents/*/status.json` |

### Bootstrap

The `bootstrap.sh` script initializes a new story project:
1. Creates the per-book directory structure
2. Validates the story-config.json schema
3. Initializes empty tracker artifacts
4. Sets up the agent status directories

---

## Verification & Quality Assurance

The system was verified through:

- **Structural Validation**: 1,326 checks across all 67 agent prompts — 100% pass rate
- **Dual-Perspective Audit**: Agent-as-function compliance + fractal workflow evaluation
- **Gap Hunting**: 4 convergence cycles (22→6→2→0 gaps), fully converged
- **26 Golden Test Scenarios**: Covering happy paths, auditor rejections, convergence exhaustion, re-entry, per-chapter iteration, cross-cutting agents, edge cases, coordinator routing, and revision-beta loops

### Outstanding Warnings (Non-Critical)

| ID | Severity | Description |
|----|----------|-------------|
| AF-ARTIFACT-04a | Warning | `characters/index.json` create-once protocol has 2 writers — should be read-modify-write |
| AF-ARTIFACT-04b | Warning | `characters/{CHAR-NNN}.json` has 3 writers — character-voice-designer needs read-modify-write |
| FW-HIERARCHY-01a | Warning | Orchestrator dispatches 3 specialists directly (cross-cutting agents) — intentional documented exception |
| FW-DATAFLOW-01 | Warning | concept-developer missing `series-kb/index.json` in Reads for sequel handling |

These are documented exceptions that do not affect system operation.
