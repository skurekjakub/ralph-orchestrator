# Romantic Fantasy Writer — User Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Writing Your Story Idea](#writing-your-story-idea)
5. [Workflow Walkthrough](#workflow-walkthrough)
6. [Monitoring Progress](#monitoring-progress)
7. [Resuming Interrupted Work](#resuming-interrupted-work)
8. [Series & Sequel Production](#series--sequel-production)
9. [Troubleshooting](#troubleshooting)
10. [Extending the System](#extending-the-system)

---

## Prerequisites

### Required

- **Agent runtime environment** (e.g., Ralph Orchestrator or compatible agent-as-function runner)
- **Filesystem access** — the system reads and writes all artifacts to a local filesystem directory
- **LLM API access** — each agent requires access to an LLM (the system prompts are model-agnostic)

### Optional

- **Reference fiction files** — if you want the style calibration phase to analyze existing prose for stylistic patterns
- **Previous book data** — if writing a sequel, the `series-kb/` from the prior book

### Directory Setup

The system expects a working directory structure. The bootstrap script creates this automatically (see [Quick Start](#quick-start)).

---

## Quick Start

### Step 1: Bootstrap a New Story Project

Run the bootstrap script to create the project structure:

```bash
./bootstrap.sh --story-id "book-1" --output-dir ./books/book-1
```

This creates the full directory hierarchy: `world-bible/`, `characters/`, `chapters/`, `agents/`, and all tracker files.

### Step 2: Configure Your Story

Edit `books/book-1/story-config.json` with your story parameters:

```json
{
  "storyId": "book-1",
  "seriesId": "crystal-realms",
  "storyIdea": "A disgraced court mage discovers she shares an ancient magical bond with the enemy general besieging her city. As the siege tightens, they must navigate forbidden meetings, political intrigue, and a prophecy that could destroy or save both nations.",
  "targetWordCount": 90000,
  "mood": "dark romantic, epic, slow-burn tension",
  "characterSketches": [
    {
      "name": "Lyra",
      "role": "protagonist",
      "notes": "Former court mage, banished for a magical accident. Brilliant but self-doubting. Has a complicated relationship with power."
    },
    {
      "name": "Commander Kael",
      "role": "love interest",
      "notes": "Enemy general. Honorable but bound by duty. Scarred by a war he didn't choose."
    }
  ],
  "worldFragments": [
    "Two rival kingdoms separated by a mountain range with magical properties",
    "Magic is drawn from crystalline structures found deep underground"
  ],
  "styleSamples": null,
  "constraints": {
    "heatLevel": "moderate",
    "contentWarnings": ["war violence", "political betrayal"]
  },
  "sequelOf": null,
  "confirmedByUser": true,
  "createdAt": "2026-01-15T10:00:00Z"
}
```

### Step 3: Launch the System

Invoke the guide agent to start the pipeline:

```bash
# Using Ralph Orchestrator
ralph run romantic-fantasy-writer-guide --config ./books/book-1/story-config.json

# Or invoke the guide agent directly in your agent runtime
```

The guide agent validates your configuration and hands off to the session orchestrator, which then runs through all 9 creative phases automatically.

### Step 4: Monitor Progress

Watch the pipeline progress:

```bash
# Check current phase
cat books/book-1/progress.json | jq '.currentPhase'

# Check chapter-by-chapter status
cat books/book-1/progress.json | jq '.chapterProgress'

# Read the audit trail
cat books/book-1/manifest.json | jq '.[0:5]'
```

### Step 5: Collect Your Output

When complete, find your finished chapters at:

```
books/book-1/chapters/*/final.md       # Final polished chapters
books/book-1/chapter-summaries/*.json   # Per-chapter summaries
books/book-1/delivery-report.json       # Delivery summary with stats
```

---

## Configuration

### story-config.json Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `storyId` | string | ✅ | Unique identifier for this book (e.g., `"book-1"`) |
| `seriesId` | string \| null | ❌ | Series identifier if part of a series; `null` for standalone |
| `storyIdea` | string | ✅ | Core story premise — the minimum viable input for the entire pipeline |
| `targetWordCount` | number | ✅ | Rough target word count (e.g., `90000` for a novel) |
| `mood` | string \| null | ❌ | Desired mood/tone keywords (e.g., `"dark romantic, slow-burn"`) |
| `characterSketches` | array \| null | ❌ | Optional rough character ideas |
| `worldFragments` | array \| null | ❌ | Optional world details you want included |
| `styleSamples` | array \| null | ❌ | File paths to reference fiction for style extraction |
| `constraints` | object \| null | ❌ | Heat level, content warnings, or other constraints |
| `sequelOf` | string \| null | ❌ | `storyId` of predecessor book if this is a sequel |
| `confirmedByUser` | boolean | ✅ | Must be `true` before the pipeline launches |
| `createdAt` | string | ✅ | ISO-8601 timestamp |

### Minimal Configuration

The absolute minimum is just a story idea:

```json
{
  "storyId": "my-story",
  "seriesId": null,
  "storyIdea": "A healer discovers she is bonded to the dragon prince who destroyed her village.",
  "targetWordCount": 80000,
  "mood": null,
  "characterSketches": null,
  "worldFragments": null,
  "styleSamples": null,
  "constraints": null,
  "sequelOf": null,
  "confirmedByUser": true,
  "createdAt": "2026-01-15T10:00:00Z"
}
```

The system's concept development phase will fill in everything else based on the story idea alone.

### Rich Configuration

For maximum control, provide detailed sketches:

```json
{
  "storyId": "book-2",
  "seriesId": "crystal-realms",
  "storyIdea": "Six months after the siege, Lyra and Kael must forge an alliance between their kingdoms as a new magical threat emerges from beneath the mountains.",
  "targetWordCount": 100000,
  "mood": "epic, political intrigue, deepening romance",
  "characterSketches": [
    {
      "name": "Lyra",
      "role": "protagonist",
      "notes": "Now co-ambassador. Growing into her power. Struggling with the political cost of peace."
    },
    {
      "name": "Kael",
      "role": "love interest",
      "notes": "Stripped of his military command. Learning diplomacy. The bond with Lyra is deepening but causing political complications."
    },
    {
      "name": "Thessia",
      "role": "antagonist",
      "notes": "New character. An ancient mage awakened from beneath the mountains. Sees both kingdoms as her subjects."
    }
  ],
  "worldFragments": [
    "The crystal mines are connected to an underground civilization thought extinct",
    "A council of mages from both kingdoms is being formed"
  ],
  "styleSamples": ["./references/style-sample-1.md"],
  "constraints": {
    "heatLevel": "high",
    "contentWarnings": ["war trauma", "political manipulation", "magical body horror"]
  },
  "sequelOf": "book-1",
  "confirmedByUser": true,
  "createdAt": "2026-06-01T10:00:00Z"
}
```

---

## Writing Your Story Idea

The `storyIdea` field is the single most important input. Here are guidelines for writing effective story ideas:

### What to Include

- **Core conflict**: What is the central tension?
- **Romantic dynamic**: Who are the romantic leads and what draws/separates them?
- **Fantasy hook**: What makes the fantasy world unique?
- **Stakes**: What's at risk?

### Examples

**Minimal but effective:**
> "A bookshop owner inherits a sentient grimoire that can only be opened by someone who has never loved — and the mysterious customer who keeps visiting is the one person who makes her heart race."

**More detailed:**
> "In a world where emotions manifest as weather, a storm-calling princess must marry the sun-blessed prince of a rival nation to end a century of magical climate war. But she's already falling for his spy, planted in her court — who doesn't know the marriage will kill her power permanently."

### What the System Does With It

1. **Concept Developer** expands the idea into a structured story concept with themes, core conflicts, genre positioning
2. **Craft Profile Selector** analyzes the concept and selects which advanced craft techniques (from the toolbox) are most appropriate
3. **Concept Auditor** verifies the concept is viable, internally consistent, and fulfills the genre promise

---

## Workflow Walkthrough

Here's what happens at each phase when you launch the system:

### Phase 1: Concept Development

The concept coordinator takes your story idea and produces:
- **`story-concept.json`**: Crystallized concept with premise, themes, conflict structure, genre positioning, target demographic
- **`craft-profile.json`**: Selected craft techniques from the toolbox (e.g., which foreshadowing patterns, symbolism frameworks, tension architectures to use)

The **concept auditor** then verifies the concept is viable and complete. If rejected, the concept developer revises.

### Phase 2: Worldbuilding

The worldbuilding coordinator splits work between two sub-coordinators:

**Physical World** (geography → culture → history):
- Geography builder creates landscapes, cities, significant locations
- Culture builder develops customs, religions, social structures grounded in geography
- History builder constructs historical events that explain the current world state

**Systems World** (magic system ↔ political structure):
- Magic system designer creates the rules, costs, and limitations of magic
- Political structure builder designs power hierarchies influenced by magic

The **worldbuilding auditor** cross-references all five world-bible files for internal consistency.

### Phase 3: Character Development

Two sub-coordinators work on different aspects:

**Core Characters** (protagonist profiler → romance arc designer):
- Deep psychological profiles of both romantic leads: wounds, desires, growth arcs, motivations
- Romance arc design: chemistry sources, conflict drivers, emotional escalation plan

**Ensemble** (supporting cast developer → character voice designer):
- Supporting characters with mini-arcs, antagonist with comprehensible motivation
- Distinct voice calibration for every POV character

The **character auditor** verifies voice distinctness, motivation coherence, and world grounding.

### Phase 4: Plotting

**Structural Design** (structure selector → dual-arc builder → tension mapper):
- Selects the best structural framework (three-act, Save the Cat, Hero's Journey, etc.)
- Builds a dual-arc timeline interleaving fantasy plot and romance arc
- Maps tension rise/fall across the full book

**Chapter Design** (chapter outliner → scene beat designer):
- Produces per-chapter outlines with POV, goals, conflicts, revelations
- Designs scene-level beats within each chapter

The **plotting auditor** verifies arc completeness, tension pacing, and structural integrity. This is the most invariant-dense gate (41 invariants).

### Phase 5: Style Calibration

- **Style analyzer** examines any reference fiction provided (or uses the concept to infer style)
- **Style guide writer** produces `style-guide.json`: sentence rhythm patterns, vocabulary register, metaphor density, POV-specific voice guidelines, dialogue style
- **Style auditor** verifies the guide is consistent with the concept and character voices

### Phase 6: Chapter Drafting

For each chapter (sequentially per INV-012):

**Creative Writing** (chapter drafter → POV voice maintainer):
- Chapter drafter writes the prose following the outline, style guide, and character profiles
- POV voice maintainer ensures character voice consistency within the draft

**Quality Integration** (continuity integrator → craft enforcer):
- Continuity integrator checks facts, positions, and timeline against the continuity tracker
- Craft enforcer verifies the selected craft techniques are actually being used

The **drafting auditor** performs the adversarial phase gate for each chapter.

### Phase 7: Revision

Three sequential editing passes, then revision:
1. **Developmental editor**: Examines plot holes, pacing, character motivation, arc satisfaction
2. **Line editor**: Refines prose quality, sentence flow, word choice, rhythm
3. **Copy editor**: Checks continuity details, world consistency, factual errors within the world

The **chapter reviser** synthesizes all three reports into a revised draft. The **revision auditor** verifies all noted issues were addressed.

### Phase 8: Beta Reading

Five simulated reader lenses provide diverse feedback:

**Genre Lens** (parallel):
- **Romance beta reader**: HEA/HFN satisfaction, chemistry, emotional escalation, steam level
- **Fantasy beta reader**: Worldbuilding immersion, magic consistency, plot tension, lore engagement

**Craft Lens** (parallel):
- **Craft beta reader**: Prose quality, structure, pacing, craft technique effectiveness
- **Sensitivity beta reader**: Representation, cultural sensitivity, power dynamics
- **Originality beta reader**: Freshness, cliché avoidance, unique voice

The **beta synthesizer** aggregates all five lenses into a unified synthesis. If the synthesis recommends revision, the chapter loops back to Phase 7 (bounded by `maxRevisionBetaCycles`).

### Phase 9: Polish & Delivery

- **Polisher**: Final proofread pass, minor prose refinements
- **Summary generator**: Creates per-chapter summaries for reference
- **Delivery assembler**: Packages everything, promotes data to series KB, generates delivery report

---

## Monitoring Progress

### progress.json

The orchestrator maintains a real-time progress file:

```json
{
  "storyId": "book-1",
  "currentPhase": "drafting",
  "phaseStatuses": {
    "concept": { "status": "completed", "startedAt": "...", "completedAt": "...", "gateResult": "passed" },
    "worldbuilding": { "status": "completed", "startedAt": "...", "completedAt": "...", "gateResult": "passed" },
    "character": { "status": "completed", "gateResult": "passed" },
    "plotting": { "status": "completed", "gateResult": "passed" },
    "style": { "status": "completed", "gateResult": "passed" },
    "drafting": { "status": "in-progress" }
  },
  "chapterProgress": [
    { "chapterNum": 1, "drafted": true, "revised": true, "betaRead": true, "polished": false },
    { "chapterNum": 2, "drafted": true, "revised": false, "betaRead": false, "polished": false },
    { "chapterNum": 3, "drafted": false, "revised": false, "betaRead": false, "polished": false }
  ],
  "currentChapter": 2,
  "gapCycles": 0,
  "lastUpdated": "2026-01-15T14:30:00Z"
}
```

### manifest.json

The audit trail shows every agent action (newest first):

```json
[
  {
    "timestamp": "2026-01-15T14:30:00Z",
    "agent": "romantic-fantasy-writer-chapter-drafter",
    "task_id": "drafting/chapter-2",
    "action": "Draft chapter 2",
    "result": "completed",
    "detail": "Wrote 4,200 words. POV: Kael. Key scene: first secret meeting."
  }
]
```

### Agent Status Files

Each agent writes its status to `agents/{agent-name}/status.json`:

```json
{
  "agent": "romantic-fantasy-writer-chapter-drafter",
  "status": "completed",
  "result": "completed",
  "summary": "Chapter 2 drafted: 4,200 words, Kael POV, 3 scenes",
  "artifacts": ["chapters/2/draft.md", "chapters/2/metadata.json"]
}
```

### Audit Gate Results

Check phase gate outcomes at `audit-reports/{phase}/gate.json`:

```json
{
  "phase": "worldbuilding",
  "verdict": "passed",
  "findings": [],
  "invariantsChecked": 12,
  "invariantsPassed": 12
}
```

---

## Resuming Interrupted Work

The system is designed for resumable execution. If a run is interrupted:

1. **Check `progress.json`** to see the current phase and chapter
2. **Check `agents/*/status.json`** to see which agent was last active
3. **Re-invoke the orchestrator** — it reads `progress.json` and resumes from where it left off

```bash
# See where things stopped
cat books/book-1/progress.json | jq '{currentPhase, currentChapter}'

# Resume
ralph run romantic-fantasy-writer --resume ./books/book-1
```

The filesystem artifact model means all completed work persists. The orchestrator simply picks up from the last incomplete phase/chapter.

---

## Series & Sequel Production

### Setting Up a Series

1. Use a consistent `seriesId` across all books
2. After Book 1 completes, the Series KB Manager promotes data to `series-kb/index.json`

### Writing a Sequel

1. Create a new `story-config.json` with `sequelOf` set to the previous book's `storyId`
2. Ensure the previous book's `series-kb/` directory is accessible
3. Launch the guide — it automatically loads the series KB

```json
{
  "storyId": "book-2",
  "seriesId": "crystal-realms",
  "sequelOf": "book-1",
  "storyIdea": "Six months after the siege..."
}
```

The system will:
- Load world-bible data from the series KB (geography, magic rules, politics evolve)
- Load character data (characters remember previous events)
- Load the continuity tracker (timeline continues)
- Respect established world rules while allowing evolution

---

## Troubleshooting

### Agent Blocked

**Symptom**: `progress.json` shows a phase as `blocked`.

**Diagnosis**:
```bash
# Find the blocked agent
grep -r '"status": "blocked"' books/book-1/agents/
```

**Common causes**:
- Auditor rejected work 3+ times (max retries exhausted)
- Missing prerequisite artifact (e.g., outline not found for drafting)
- Cross-cutting tracker in inconsistent state

**Fix**: Check the blocked agent's `status.json` for the `summary` field, which explains why it blocked. Address the issue in the relevant artifact and re-run.

### Auditor Keeps Rejecting

**Symptom**: A phase loops between specialist and auditor multiple times.

**Diagnosis**:
```bash
# Check gate reports
cat books/book-1/audit-reports/{phase}/gate.json | jq '.findings'
```

**Common causes**:
- Story concept has internal contradictions the specialist can't resolve
- World-bible has inconsistencies across sub-areas
- Character voice is too similar across POVs

**Fix**: Review the auditor's findings. You may need to adjust the `story-config.json` (e.g., simplify conflicting world fragments) and re-run the phase.

### Convergence Not Reached (Revision-Beta Loop)

**Symptom**: Beta readers keep requesting revision.

**Diagnosis**:
```bash
cat books/book-1/progress.json | jq '.gapCycles'
cat books/book-1/beta-synthesis/{N}.json | jq '.recommendation'
```

**Common causes**:
- Fundamental plotting issue that revision can't fix
- Character motivation inconsistency embedded early in the pipeline
- Style guide mismatch with the story's emotional needs

**Fix**: The system will eventually proceed with the best available version (bounded by `maxRevisionBetaCycles`). For better results, review the beta synthesis feedback and consider re-running from an earlier phase.

### Missing Output Files

**Symptom**: Expected files don't exist.

**Diagnosis**:
```bash
# Check which chapters completed
cat books/book-1/progress.json | jq '.chapterProgress'

# Check delivery report
cat books/book-1/delivery-report.json
```

**Common causes**:
- Pipeline didn't reach polish phase yet
- A chapter is still in revision loop
- Delivery assembler was not yet dispatched

**Fix**: Check `progress.json` to verify the pipeline completed all phases. If a chapter is stuck, see "Auditor Keeps Rejecting" above.

### Slow Performance

**Symptom**: The pipeline seems to take very long on a particular phase.

**Common causes**:
- Drafting phase is the longest by design (per-chapter with quality checks)
- Plotting has 41 invariants to verify — the densest gate
- Beta reading runs 5 parallel lenses per chapter

**Fix**: This is expected behavior. The system prioritizes quality over speed. Monitor `progress.json` for steady advancement.

---

## Extending the System

### Adding a New Specialist

1. Create a new `.agent.md` file following the existing specialist template
2. Add the agent to the parent coordinator's `children` list in `roster.json`
3. Update the coordinator's routing table in `routing.json` to dispatch the new agent
4. Update the coordinator's `reads` list to include the new agent's `status.json`
5. Define what artifacts the new agent reads/writes
6. Run verification to ensure consistency

### Adding a New Invariant

1. Add the invariant to the domain model's invariant list
2. Identify which auditor(s) should enforce it
3. Update the relevant auditor agent's prompt to check for the new invariant
4. Add a test scenario covering the new invariant

### Adding a New Beta Reader Lens

1. Create the new beta reader specialist agent (e.g., `romantic-fantasy-writer-pacing-beta-reader`)
2. Add it to the appropriate sub-coordinator (`genre-lens-coordinator` or `craft-lens-coordinator`)
3. Update the sub-coordinator's routing table
4. Update the `beta-synthesizer` to include the new lens in its aggregation
5. Define the output schema (e.g., `beta-feedback/{N}/pacing-lens.json`)

### Modifying the Craft Toolbox

The craft profile is selected per-story during the concept phase. To add new techniques:

1. Update the craft profile schema to include the new technique category
2. Update the `craft-profile-selector` agent to consider the new technique
3. Update the `craft-enforcer` and `craft-tracker` to track/enforce the new technique
4. Update relevant auditors to check for the technique when the craft profile activates it

### Adding a New Creative Phase

This is the most complex extension:

1. Create a new coordinator agent
2. Create specialist agents for the phase
3. Create an auditor agent for the phase gate
4. Insert the phase in the orchestrator's dispatch order
5. Define input/output artifacts and their schemas
6. Update `progress.json` schema to track the new phase
7. Run full verification and gap-hunting

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the agent hierarchy and data flow patterns to follow.
