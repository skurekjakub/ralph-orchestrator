# Romantic Fantasy Writer

An autonomous multi-agent system that writes romantic fantasy fiction — from initial concept through worldbuilding, character development, plotting, prose style calibration, chapter drafting, adversarial quality gates, multi-pass revision, simulated multi-lens beta reading, and final polish.

## Overview

**67 agents** organized in a 3-level hierarchy:

| Level | Count | Role |
|-------|-------|------|
| Guide | 1 | User-facing entry point — gathers story idea, builds `story-config.json` |
| Orchestrator | 1 | Routes 9 creative phases sequentially, manages revision↔beta loop |
| Coordinators | 9 | One per creative phase — dispatch specialists and run auditor gates |
| Sub-Coordinators | 10 | Split large phases (worldbuilding, character, plotting, drafting, beta) |
| Specialists | 46 | Do the actual creative work — drafting, editing, beta reading, etc. |

## Architecture

### Creative Pipeline (9 Phases)

```
Concept → Worldbuilding → Character → Plotting → Style
    → Drafting → Revision ↔ Beta Reading → Polish
```

Each phase has an **adversarial auditor** that gates progression. The auditor can reject work up to `maxAuditorRetries` (default: 3) times before the coordinator escalates to `blocked`.

The **revision ↔ beta-reading loop** iterates up to `maxRevisionBetaCycles` (default: 2) times. Beta readers can return `revision-required` to send chapters back through revision.

### Cross-Cutting Agents

Three specialists run outside the normal phase sequence:
- **`continuity-tracker`** — Maintains running continuity document across chapters
- **`craft-tracker`** — Tracks craft tool enforcement (foreshadowing, motifs, mystery boxes, emotional throughlines)
- **`series-kb-manager`** — Promotes completed book knowledge to the series knowledge base

### Artifact System

All agents communicate through **filesystem artifacts** in `.romantic-fantasy-writer/stories/{story-id}/`. Key artifacts:

| Artifact | Purpose | Write Protocol |
|----------|---------|----------------|
| `story-config.json` | User input contract | create-once |
| `story-concept.json` | Crystallized concept | create-once |
| `craft-profile.json` | Selected craft tools (binding) | create-once |
| `world-bible/*.json` | Geography, magic, politics, culture, history | create-once |
| `characters/*.json` | Per-character profiles | create-once |
| `romance-arc-design.json` | Detailed romance arc | create-once |
| `plot-structure.json` | Story structure blueprint | create-once |
| `chapter-outlines/{N}.json` | Per-chapter outlines | create-once |
| `chapters/{N}/draft.md` | Chapter prose draft | read-modify-write |
| `chapters/{N}/revised.md` | Post-revision chapter | create-once |
| `chapters/{N}/final.md` | Polished final chapter | create-once |
| `beta-feedback/{N}/*.json` | 5-lens beta reader reports | create-once |
| `continuity-tracker.json` | Running continuity state | read-modify-write |
| `progress.json` | Pipeline execution state | read-modify-write |
| `manifest.json` | Append-only audit trail | prepend-entry |

See `schemas/` for full artifact documentation.

## Quick Start

### 1. Bootstrap a Story

```bash
chmod +x bootstrap.sh
./bootstrap.sh my-first-story
# Or for a series:
./bootstrap.sh book-1 crimson-court-trilogy
```

### 2. Configure Your Story

Edit `.romantic-fantasy-writer/stories/my-first-story/story-config.json`:

```json
{
  "storyId": "my-first-story",
  "storyIdea": "A fire mage who has lost her powers falls in love with the ice prince she was sent to assassinate, while an ancient magical plague threatens both their kingdoms.",
  "targetWordCount": 80000,
  "mood": "dark romantic, hopeful undertone",
  "constraints": { "heatLevel": "warm" },
  "confirmedByUser": true
}
```

### 3. Run the Pipeline

Invoke the `romantic-fantasy-writer-guide` agent. It will:
1. Validate your `story-config.json`
2. Launch the orchestrator
3. The orchestrator routes through all 9 creative phases
4. You get polished chapters + a delivery report

## Agent Roster

### Phase 1: Concept Development
- **concept-coordinator** → concept-developer, craft-profile-selector, concept-auditor

### Phase 2: Worldbuilding
- **worldbuilding-coordinator**
  - **physical-world-coordinator** → geography-builder, culture-builder, history-builder
  - **systems-world-coordinator** → magic-system-designer, political-structure-builder
  - worldbuilding-auditor

### Phase 3: Character Development
- **character-coordinator**
  - **core-characters-coordinator** → protagonist-profiler, romance-arc-designer
  - **ensemble-coordinator** → supporting-cast-developer, character-voice-designer
  - character-auditor

### Phase 4: Plotting & Outlining
- **plotting-coordinator**
  - **structural-design-coordinator** → structure-selector, dual-arc-builder, tension-mapper
  - **chapter-design-coordinator** → chapter-outliner, scene-beat-designer
  - plotting-auditor

### Phase 5: Style Calibration
- **style-coordinator** → style-analyzer, style-guide-writer, style-auditor

### Phase 6: Chapter Drafting (per-chapter)
- **drafting-coordinator**
  - **creative-writing-coordinator** → chapter-drafter, pov-voice-maintainer
  - **quality-integration-coordinator** → continuity-integrator, craft-enforcer
  - drafting-auditor

### Phase 7: Revision (per-chapter)
- **revision-coordinator** → developmental-editor, line-editor, copy-editor, chapter-reviser, revision-auditor

### Phase 8: Beta Reading (per-chapter)
- **beta-reading-coordinator**
  - **genre-lens-coordinator** → romance-beta-reader, fantasy-beta-reader
  - **craft-lens-coordinator** → craft-beta-reader, sensitivity-beta-reader, originality-beta-reader
  - beta-synthesizer, beta-reading-auditor

### Phase 9: Polish & Delivery
- **polish-coordinator** → polisher, summary-generator, delivery-assembler

### Cross-Cutting
- **continuity-tracker** — runs after each chapter draft
- **craft-tracker** — initializes from craft-profile, tracks enforcement
- **series-kb-manager** — promotes book knowledge to series KB

## Convergence Bounds

| Bound | Default | Purpose |
|-------|---------|---------|
| `maxAuditorRetries` | 3 | Max writer→auditor cycles per phase |
| `maxRevisionBetaCycles` | 2 | Max revision↔beta loop iterations |
| `maxChaptersBeforeCheckpoint` | 5 | Checkpoint after N chapters drafted |

## Key Invariants

The system enforces 81 invariants covering:
- **Genre Promise** (INV-001): Every story must be romantic fantasy with HFN/HEA
- **Internal Consistency** (INV-002): Worldbuilding details never contradict
- **Voice Distinctness** (INV-003): Each POV character has recognizably distinct voice
- **Show Don't Tell** (INV-005): Emotions conveyed through physical sensation and action
- **Sequential Drafting** (INV-012): Chapter N+1 cannot start until N is complete
- **Three-Pass Revision** (INV-013): Every chapter gets developmental, line, and copy edits
- **No Deus Ex Machina** (INV-009): Solutions must use previously established abilities
- **Originality** (INV-023/025): Zero-tolerance for plagiarism; style samples are transformative only
- **Craft Tool Binding** (INV-069/079): Once selected in concept phase, craft tools are binding

See `schemas/` for full artifact and invariant documentation.

## Directory Structure

```
.romantic-fantasy-writer/
├── stories/{story-id}/
│   ├── story-config.json          # User input
│   ├── story-concept.json         # Concept phase output
│   ├── craft-profile.json         # Selected craft tools
│   ├── progress.json              # Pipeline state
│   ├── manifest.json              # Audit trail
│   ├── world-bible/
│   │   ├── geography.json
│   │   ├── magic-system.json
│   │   ├── politics.json
│   │   ├── culture.json
│   │   └── history.json
│   ├── characters/
│   │   ├── index.json
│   │   └── {CHAR-NNN}.json
│   ├── plot/
│   │   ├── romance-arc-design.json
│   │   ├── plot-structure.json
│   │   ├── dual-arc-timeline.json
│   │   ├── tension-map.json
│   │   └── chapter-outlines/{N}.json
│   ├── style/
│   │   └── style-guide.json
│   ├── chapters/{N}/
│   │   ├── draft.md
│   │   ├── metadata.json
│   │   ├── revised.md
│   │   └── final.md
│   ├── revision-reports/{N}/
│   │   ├── developmental.json
│   │   ├── line-edit.json
│   │   └── copy-edit.json
│   ├── beta-feedback/{N}/
│   │   ├── romance-lens.json
│   │   ├── fantasy-lens.json
│   │   ├── craft-lens.json
│   │   ├── sensitivity-lens.json
│   │   └── originality-lens.json
│   ├── beta-synthesis/{N}.json
│   ├── chapter-summaries/{N}.json
│   ├── continuity/
│   │   ├── continuity-tracker.json
│   │   ├── foreshadowing-ledger.json
│   │   ├── information-asymmetry-map.json
│   │   ├── mystery-box-inventory.json
│   │   └── emotional-throughline.json
│   ├── craft-tracking/
│   │   └── symbolic-motif-registry.json
│   ├── audit-reports/{phase}/{gate-id}.json
│   ├── delivery/
│   │   └── delivery-report.json
│   └── agents/{agent-name}/status.json
└── series/{series-id}/
    └── index.json
```

## Result Codes

Every agent writes a `status.json` with a `result` field. The routing system uses these result codes to determine what happens next.

### Specialist Result Codes

| Code | Meaning | Example |
|------|---------|---------|
| `completed` | Work done successfully, output artifacts written | geography-builder created `world-bible/geography.json` |
| `blocked` | Cannot proceed — missing input, unrecoverable error, or max retries hit | chapter-drafter blocked because outline is missing |

### Auditor Result Codes

| Code | Meaning | What Happens Next |
|------|---------|-------------------|
| `passed` | Artifacts meet quality bar and invariant requirements | Coordinator advances to next phase |
| `failed` | Artifacts have issues — findings written to audit report | Coordinator resets writers and retries (up to `maxAuditorRetries`) |

### Coordinator Result Codes

| Code | Meaning | What Happens Next |
|------|---------|-------------------|
| `complete` | All children completed and auditor passed | Orchestrator dispatches next phase |
| `blocked` | A child blocked or auditor failed after max retries | Orchestrator evaluates: critical phase → pipeline blocked; late phase → delivered-with-gaps |

### Orchestrator Result Codes

| Code | Meaning | Condition |
|------|---------|-----------|
| `delivered` | Full pipeline success — all 9 phases + series-kb completed | All coordinators complete, all chapters polished |
| `delivered-with-gaps` | Pipeline reached end but non-critical phases had issues | Polish or series-kb-manager blocked, but chapters are revised |
| `blocked` | Pipeline cannot continue — critical phase failure | Any phase from concept through revision blocked after max retries |

### Cross-Cutting Agent Result Codes

| Code | Meaning | Used By |
|------|---------|---------|
| `completed` | Tracker/manager work done | continuity-tracker, craft-tracker, series-kb-manager |
| `blocked` | Cannot complete tracking/management task | continuity-tracker, craft-tracker, series-kb-manager |

### Special Routing Signals

| Signal | Meaning | Used By |
|--------|---------|---------|
| `revision-required` | Beta synthesis determined chapters need another revision pass | beta-synthesizer (via beta-reading-coordinator) |
| `revision-loop` | Orchestrator routes back from beta to revision | Orchestrator internal routing |
| `pending` | Agent has not been dispatched yet | Default initial state |

## Testing & Validation

The `tests/` directory contains **26 golden test scenarios** that validate the system's behavior across all critical paths.

### Test Categories

| Category | Count | What It Tests |
|----------|-------|---------------|
| `happy-path` | 2 | Full pipeline for single and multi-chapter books |
| `auditor-rejection` | 4 | Writer→auditor retry loops including depth-3 cascade resets |
| `convergence-exhaustion` | 2 | Max retry limits and escalation to blocked |
| `re-entry` | 1 | Gap-hunting detection and phase re-entry |
| `per-chapter-iteration` | 2 | Multi-chapter drafting and mid-book blocking |
| `cross-cutting-agents` | 4 | Craft tracker, continuity tracker, series KB, sequel production |
| `edge-case` | 3 | Empty story ideas, missing style references, missing outlines |
| `specialist-behavior` | 2 | Individual specialist output validation |
| `coordinator-routing` | 4 | Sub-coordinator dispatch, parallel fan-out, delivered-with-gaps |
| `revision-beta-loop` | 2 | Revision↔beta iteration and convergence |

### Running a Test Scenario

Each test directory contains:
- `context.json` — Pre-configured scenario parameters and preconditions
- `expected-status.json` — Expected result codes and artifact expectations
- `README.md` — Step-by-step setup and verification checklist

To run a test:

1. **Bootstrap**: `./bootstrap.sh {test-book-id}`
2. **Seed preconditions**: Set up any artifacts listed in `context.json.existingArtifacts`
3. **Invoke**: Dispatch the agent listed in the test plan's `trigger` field
4. **Verify**: Check each item in the README verification checklist

### Priority Levels

| Priority | Meaning | Count |
|----------|---------|-------|
| **P0** | Must pass — core pipeline functionality | 7 scenarios |
| **P1** | Should pass — important but not blocking | 16 scenarios |
| **P2** | Nice to have — edge cases and specialist details | 3 scenarios |

### P0 Scenarios (Critical)

| ID | Name |
|----|------|
| TEST-001 | Happy path full pipeline single chapter |
| TEST-002 | Happy path multi-chapter book |
| TEST-003 | Auditor rejection concept phase retry |
| TEST-005 | Convergence exhaustion worldbuilding blocked |
| TEST-020 | Revision-beta loop one cycle |
| TEST-021 | Revision-beta loop no revision needed |
| TEST-022 | Delivered-with-gaps polish-coordinator blocked |

### Completeness Check

Verify all test directories exist:
```bash
for i in $(seq -f "%03g" 1 26); do
  dir="tests/TEST-$i"
  [ -d "$dir" ] && echo "✓ TEST-$i" || echo "✗ TEST-$i MISSING"
done
```

## Skills

The system includes 9 skills providing operational guidance:

| Skill | Path | Purpose |
|-------|------|---------|
| agent-as-function-contract | `skills/agent-as-function-contract/SKILL.md` | Contract rules, status codes, retry patterns |
| fractal-coordinator-patterns | `skills/fractal-coordinator-patterns/SKILL.md` | Coordinator routing loops and cascade resets |
| fractal-orchestrator-architecture | `skills/fractal-orchestrator-architecture/SKILL.md` | Phase sequence, revision↔beta loop, result codes |
| rules | `skills/rules/SKILL.md` | Ten operational rules for all agents |
| profile-config | `skills/profile-config/SKILL.md` | Profile.json structure and extension |
| prompt-security | `skills/prompt-security/SKILL.md` | Input injection mitigation |
| dockerfile-pattern | `skills/dockerfile-pattern/SKILL.md` | Container deployment topology |
| mcp-sidecar | `skills/mcp-sidecar/SKILL.md` | MCP tool server configuration |
| web-fetch | `skills/web-fetch/SKILL.md` | Style sample retrieval policy |

## License

Part of the Romantic Fantasy Writer agent system — produced by the Fractal Factory.
