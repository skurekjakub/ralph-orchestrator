# Romantic Fantasy Writer — Roster Reference

Complete agent inventory for the Romantic Fantasy Writer system: 67 agents across a 3-level hierarchy with 1 guide, 1 orchestrator, 9 coordinators, 10 sub-coordinators, and 46 specialists.

---

## Summary Table

| # | Agent | Level | Parent | Phase | Anti-Laziness | Result Codes |
|---|-------|-------|--------|-------|:---:|--------------|
| A-001 | Guide | guide | user | — | — | — |
| A-002 | Session Orchestrator | orchestrator | Guide | all | — | delivered, delivered-with-gaps, failed |
| A-003 | Concept Coordinator | coordinator | Orchestrator | concept | — | complete, blocked, revision-loop |
| A-004 | Worldbuilding Coordinator | coordinator | Orchestrator | worldbuilding | — | complete, blocked, revision-loop |
| A-005 | Character Coordinator | coordinator | Orchestrator | character | — | complete, blocked, revision-loop |
| A-006 | Plotting Coordinator | coordinator | Orchestrator | plotting | — | complete, blocked, revision-loop |
| A-007 | Style Coordinator | coordinator | Orchestrator | style | — | complete, blocked, revision-loop |
| A-008 | Drafting Coordinator | coordinator | Orchestrator | drafting | — | complete, blocked, revision-loop |
| A-009 | Revision Coordinator | coordinator | Orchestrator | revision | — | complete, blocked, revision-loop |
| A-010 | Beta Reading Coordinator | coordinator | Orchestrator | beta-reading | — | complete, blocked, revision-loop |
| A-011 | Polish Coordinator | coordinator | Orchestrator | polish | — | complete, blocked |
| A-012 | Physical World Sub-Coordinator | sub-coordinator | Worldbuilding Coord. | worldbuilding | — | complete, blocked |
| A-013 | Systems World Sub-Coordinator | sub-coordinator | Worldbuilding Coord. | worldbuilding | — | complete, blocked |
| A-014 | Core Characters Sub-Coordinator | sub-coordinator | Character Coord. | character | — | complete, blocked |
| A-015 | Ensemble Sub-Coordinator | sub-coordinator | Character Coord. | character | — | complete, blocked |
| A-016 | Structural Design Sub-Coordinator | sub-coordinator | Plotting Coord. | plotting | — | complete, blocked |
| A-017 | Chapter Design Sub-Coordinator | sub-coordinator | Plotting Coord. | plotting | — | complete, blocked |
| A-018 | Creative Writing Sub-Coordinator | sub-coordinator | Drafting Coord. | drafting | — | complete, blocked |
| A-019 | Quality Integration Sub-Coordinator | sub-coordinator | Drafting Coord. | drafting | — | complete, blocked |
| A-020 | Genre Lens Sub-Coordinator | sub-coordinator | Beta Reading Coord. | beta-reading | — | complete, blocked |
| A-021 | Craft Lens Sub-Coordinator | sub-coordinator | Beta Reading Coord. | beta-reading | — | complete, blocked |
| — | Concept Developer | specialist | Concept Coord. | concept | — | completed, blocked |
| — | Craft Profile Selector | specialist | Concept Coord. | concept | — | completed, blocked |
| — | Concept Auditor | specialist | Concept Coord. | concept | ⚔️ | passed, failed, blocked |
| — | Geography Builder | specialist | Physical World Sub-Coord. | worldbuilding | — | completed, blocked |
| — | Culture Builder | specialist | Physical World Sub-Coord. | worldbuilding | — | completed, blocked |
| — | History Builder | specialist | Physical World Sub-Coord. | worldbuilding | — | completed, blocked |
| — | Magic System Designer | specialist | Systems World Sub-Coord. | worldbuilding | — | completed, blocked |
| — | Political Structure Builder | specialist | Systems World Sub-Coord. | worldbuilding | — | completed, blocked |
| — | Worldbuilding Auditor | specialist | Worldbuilding Coord. | worldbuilding | ⚔️ | passed, failed, blocked |
| — | Protagonist Profiler | specialist | Core Characters Sub-Coord. | character | — | completed, blocked |
| — | Romance Arc Designer | specialist | Core Characters Sub-Coord. | character | — | completed, blocked |
| — | Supporting Cast Developer | specialist | Ensemble Sub-Coord. | character | — | completed, blocked |
| — | Character Voice Designer | specialist | Ensemble Sub-Coord. | character | — | completed, blocked |
| — | Character Auditor | specialist | Character Coord. | character | ⚔️ | passed, failed, blocked |
| — | Structure Selector | specialist | Structural Design Sub-Coord. | plotting | — | completed, blocked |
| — | Dual Arc Builder | specialist | Structural Design Sub-Coord. | plotting | — | completed, blocked |
| — | Tension Mapper | specialist | Structural Design Sub-Coord. | plotting | — | completed, blocked |
| — | Chapter Outliner | specialist | Chapter Design Sub-Coord. | plotting | — | completed, blocked |
| — | Scene Beat Designer | specialist | Chapter Design Sub-Coord. | plotting | — | completed, blocked |
| — | Plotting Auditor | specialist | Plotting Coord. | plotting | ⚔️ | passed, failed, blocked |
| — | Style Analyzer | specialist | Style Coord. | style | — | completed, blocked |
| — | Style Guide Writer | specialist | Style Coord. | style | — | completed, blocked |
| — | Style Auditor | specialist | Style Coord. | style | ⚔️ | passed, failed, blocked |
| — | Chapter Drafter | specialist | Creative Writing Sub-Coord. | drafting | — | completed, blocked |
| — | POV Voice Maintainer | specialist | Creative Writing Sub-Coord. | drafting | — | completed, blocked |
| — | Continuity Integrator | specialist | Quality Integration Sub-Coord. | drafting | — | completed, blocked |
| — | Craft Enforcer | specialist | Quality Integration Sub-Coord. | drafting | ⚔️ | completed, blocked |
| — | Drafting Auditor | specialist | Drafting Coord. | drafting | ⚔️ | passed, failed, blocked |
| — | Developmental Editor | specialist | Revision Coord. | revision | — | completed, blocked |
| — | Line Editor | specialist | Revision Coord. | revision | — | completed, blocked |
| — | Copy Editor | specialist | Revision Coord. | revision | — | completed, blocked |
| — | Chapter Reviser | specialist | Revision Coord. | revision | — | completed, blocked |
| — | Revision Auditor | specialist | Revision Coord. | revision | ⚔️ | passed, failed, blocked |
| — | Romance Beta Reader | specialist | Genre Lens Sub-Coord. | beta-reading | — | completed, blocked |
| — | Fantasy Beta Reader | specialist | Genre Lens Sub-Coord. | beta-reading | — | completed, blocked |
| — | Craft Beta Reader | specialist | Craft Lens Sub-Coord. | beta-reading | — | completed, blocked |
| — | Sensitivity Beta Reader | specialist | Craft Lens Sub-Coord. | beta-reading | — | completed, blocked |
| — | Originality Beta Reader | specialist | Craft Lens Sub-Coord. | beta-reading | — | completed, blocked |
| — | Beta Synthesizer | specialist | Beta Reading Coord. | beta-reading | — | completed, blocked |
| — | Beta Reading Auditor | specialist | Beta Reading Coord. | beta-reading | ⚔️ | passed, failed, blocked |
| — | Polisher | specialist | Polish Coord. | polish | — | completed, blocked |
| — | Summary Generator | specialist | Polish Coord. | polish | — | completed, blocked |
| — | Delivery Assembler | specialist | Polish Coord. | polish | — | completed, blocked |
| — | Continuity Tracker | specialist | Orchestrator | cross-cutting | — | completed, blocked |
| — | Series KB Manager | specialist | Orchestrator | cross-cutting | — | completed, blocked |
| — | Craft Tracker | specialist | Orchestrator | cross-cutting | ⚔️ | completed, blocked |

> All agent names omit the `romantic-fantasy-writer-` prefix for readability.
> ⚔️ = Anti-laziness enforcement (adversarial rules that prevent superficial approval).

---

## Detailed Agent Descriptions

### Guide & Orchestrator

#### romantic-fantasy-writer-guide
- **Level**: Guide (user-facing entry point)
- **Parent**: User
- **Children**: Session Orchestrator
- **Purpose**: Gathers the user's story idea, validates `story-config.json`, and launches the session orchestrator. The only user-invocable agent in the system.
- **Reads**: `delivery-report.json` (to show results)
- **Writes**: `story-config.json`
- **Anti-laziness**: No

#### romantic-fantasy-writer (Session Orchestrator)
- **Level**: Orchestrator
- **Parent**: Guide
- **Children**: All 9 coordinators + 3 cross-cutting specialists
- **Purpose**: Pure router that dispatches coordinators in the correct phase order, reads their status codes, and decides next steps. Manages `progress.json` for resumability.
- **Reads**: `progress.json`, `agents/*/status.json`
- **Writes**: `progress.json`
- **Result Codes**:
  - `delivered` — all phases completed successfully
  - `delivered-with-gaps` — completed with known issues (e.g., a chapter stuck in revision loop)
  - `failed` — critical blocking failure
- **Anti-laziness**: No (routers don't produce content)

---

### Phase 1: Concept (depth-2)

#### romantic-fantasy-writer-concept-coordinator
- **Level**: Coordinator
- **Parent**: Orchestrator
- **Children**: Concept Developer, Craft Profile Selector, Concept Auditor
- **Dispatch Order**: Concept Developer → Craft Profile Selector → Concept Auditor (gate)
- **Reads**: `progress.json`, `story-config.json`, child status files
- **Writes**: Own status

#### romantic-fantasy-writer-concept-developer
- **Level**: Specialist
- **Parent**: Concept Coordinator
- **Purpose**: Expands the user's story idea into a structured `story-concept.json` containing: premise, themes, core conflicts, genre positioning, tone, target demographic, character seeds, world seeds, and estimated chapter count.
- **Reads**: `story-config.json`
- **Writes**: `story-concept.json`
- **Result Codes**: `completed`, `blocked`

#### romantic-fantasy-writer-craft-profile-selector
- **Level**: Specialist
- **Parent**: Concept Coordinator
- **Purpose**: Analyzes the story concept and selects which advanced craft techniques from the toolbox should be active for this story. Produces `craft-profile.json` containing enabled techniques, intensity levels, and per-technique configuration.
- **Reads**: `story-config.json`, `story-concept.json`
- **Writes**: `craft-profile.json`
- **Result Codes**: `completed`, `blocked`

#### romantic-fantasy-writer-concept-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Parent**: Concept Coordinator
- **Purpose**: Adversarial phase gate for the concept phase. Verifies the story concept is viable, internally consistent, fulfills genre promise (INV-001), and the craft profile is appropriate for the story type.
- **Reads**: `story-concept.json`, `craft-profile.json`, `story-config.json`
- **Writes**: `audit-reports/concept/gate.json`
- **Result Codes**: `passed`, `failed`, `blocked`
- **Anti-laziness**: Yes

---

### Phase 2: Worldbuilding (depth-3)

#### romantic-fantasy-writer-worldbuilding-coordinator
- **Level**: Coordinator
- **Parent**: Orchestrator
- **Children**: Physical World Sub-Coord., Systems World Sub-Coord., Worldbuilding Auditor
- **Dispatch Order**: Physical World Sub-Coord. ‖ Systems World Sub-Coord. → Worldbuilding Auditor (gate)

#### romantic-fantasy-writer-physical-world-coordinator
- **Level**: Sub-Coordinator
- **Parent**: Worldbuilding Coordinator
- **Children**: Geography Builder, Culture Builder, History Builder
- **Dispatch Order**: Geography Builder → Culture Builder → History Builder (sequential — each depends on the previous)

#### romantic-fantasy-writer-geography-builder
- **Level**: Specialist
- **Purpose**: Creates the physical geography — landscapes, cities, significant locations, distances, climate zones. Establishes the spatial framework other world-building depends on.
- **Reads**: `story-concept.json`
- **Writes**: `world-bible/geography.json`

#### romantic-fantasy-writer-culture-builder
- **Level**: Specialist
- **Purpose**: Develops cultures, customs, religions, social hierarchies, and daily life patterns grounded in the established geography.
- **Reads**: `story-concept.json`, `world-bible/geography.json`
- **Writes**: `world-bible/culture.json`

#### romantic-fantasy-writer-history-builder
- **Level**: Specialist
- **Purpose**: Constructs historical events, wars, migrations, discoveries, and turning points that explain the current state of the world.
- **Reads**: `story-concept.json`, `world-bible/geography.json`, `world-bible/culture.json`
- **Writes**: `world-bible/history.json`

#### romantic-fantasy-writer-systems-world-coordinator
- **Level**: Sub-Coordinator
- **Parent**: Worldbuilding Coordinator
- **Children**: Magic System Designer, Political Structure Builder
- **Dispatch Order**: Magic System Designer → Political Structure Builder (sequential — politics influenced by magic)

#### romantic-fantasy-writer-magic-system-designer
- **Level**: Specialist
- **Purpose**: Creates the magic system — sources of power, rules, costs, limitations, categories of magic users, rare abilities. Must follow INV-009 (no deus ex machina — rules must be established before they're used).
- **Reads**: `story-concept.json`
- **Writes**: `world-bible/magic-system.json`

#### romantic-fantasy-writer-political-structure-builder
- **Level**: Specialist
- **Purpose**: Designs the political landscape — governing structures, factions, alliances, conflicts, power dynamics. Must account for how magic affects political power.
- **Reads**: `story-concept.json`, `world-bible/magic-system.json`
- **Writes**: `world-bible/politics.json`

#### romantic-fantasy-writer-worldbuilding-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Purpose**: Adversarial phase gate. Cross-references all five world-bible files for internal consistency (INV-002), ensures no contradictions between geography, magic, politics, culture, and history.
- **Reads**: `story-concept.json`, `world-bible/geography.json`, `world-bible/magic-system.json`, `world-bible/politics.json`, `world-bible/culture.json`, `world-bible/history.json`
- **Writes**: `audit-reports/worldbuilding/gate.json`
- **Result Codes**: `passed`, `failed`, `blocked`
- **Anti-laziness**: Yes

---

### Phase 3: Character Development (depth-3)

#### romantic-fantasy-writer-character-coordinator
- **Level**: Coordinator
- **Children**: Core Characters Sub-Coord., Ensemble Sub-Coord., Character Auditor
- **Dispatch Order**: Core Characters Sub-Coord. → Ensemble Sub-Coord. → Character Auditor (gate)

#### romantic-fantasy-writer-core-characters-coordinator
- **Level**: Sub-Coordinator
- **Children**: Protagonist Profiler, Romance Arc Designer
- **Dispatch Order**: Protagonist Profiler → Romance Arc Designer

#### romantic-fantasy-writer-protagonist-profiler
- **Level**: Specialist
- **Purpose**: Creates deep psychological profiles for both romantic leads: wounds, desires, fears, strengths, growth arcs, motivations, backstory. Grounded in the established world (magic abilities, social position, cultural background).
- **Reads**: `story-concept.json`, `world-bible/geography.json`, `world-bible/culture.json`, `world-bible/magic-system.json`
- **Writes**: `characters/index.json`, `characters/{CHAR-NNN}.json`

#### romantic-fantasy-writer-romance-arc-designer
- **Level**: Specialist
- **Purpose**: Designs the romance arc between the leads: chemistry sources, conflict drivers, emotional escalation plan, key beats (awareness, attraction, conflict, vulnerability, commitment). Ensures the romance escalates through recognizable stages (INV-021).
- **Reads**: `story-concept.json`, `characters/index.json`, `characters/{CHAR-NNN}.json`
- **Writes**: `romance-arc-design.json`

#### romantic-fantasy-writer-ensemble-coordinator
- **Level**: Sub-Coordinator
- **Children**: Supporting Cast Developer, Character Voice Designer

#### romantic-fantasy-writer-supporting-cast-developer
- **Level**: Specialist
- **Purpose**: Creates supporting characters with mini-arcs, antagonist with comprehensible motivation (INV-022), allies, mentors, and political players. Each character has a functional role in the plot.
- **Reads**: `story-concept.json`, `characters/index.json`, `world-bible/politics.json`, `world-bible/culture.json`
- **Writes**: `characters/{CHAR-NNN}.json`, `characters/index.json`

#### romantic-fantasy-writer-character-voice-designer
- **Level**: Specialist
- **Purpose**: Calibrates a distinct voice for every POV character: vocabulary, sentence patterns, internal monologue style, speech habits. Ensures voice distinctness per INV-003.
- **Reads**: `characters/index.json`, `characters/{CHAR-NNN}.json`, `story-concept.json`
- **Writes**: `characters/{CHAR-NNN}.json` (adds voice profile)

#### romantic-fantasy-writer-character-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Purpose**: Verifies character voice distinctness (INV-003), motivation coherence, world grounding, romance arc viability, and antagonist motivation (INV-022).
- **Reads**: `story-concept.json`, `characters/index.json`, `characters/{CHAR-NNN}.json`, `romance-arc-design.json`, `world-bible/culture.json`
- **Writes**: `audit-reports/character/gate.json`
- **Anti-laziness**: Yes

---

### Phase 4: Plotting (depth-3)

#### romantic-fantasy-writer-plotting-coordinator
- **Level**: Coordinator
- **Children**: Structural Design Sub-Coord., Chapter Design Sub-Coord., Plotting Auditor
- **Dispatch Order**: Structural Design Sub-Coord. → Chapter Design Sub-Coord. → Plotting Auditor (gate)
- **Note**: Most invariant-dense phase with 41 invariants

#### romantic-fantasy-writer-structural-design-coordinator
- **Level**: Sub-Coordinator
- **Children**: Structure Selector, Dual Arc Builder, Tension Mapper
- **Dispatch Order**: Structure Selector → Dual Arc Builder → Tension Mapper

#### romantic-fantasy-writer-structure-selector
- **Level**: Specialist
- **Purpose**: Selects the best structural framework (three-act, Save the Cat, Hero's Journey, etc.) based on the story concept, craft profile, and character arcs.
- **Reads**: `story-concept.json`, `craft-profile.json`, `characters/index.json`, `romance-arc-design.json`
- **Writes**: `plot-structure.json`

#### romantic-fantasy-writer-dual-arc-builder
- **Level**: Specialist
- **Purpose**: Builds a dual-arc timeline that interleaves the fantasy plot arc and the romance arc. Maps key beats, turning points, and how the two arcs reinforce each other.
- **Reads**: `plot-structure.json`, `romance-arc-design.json`, `characters/index.json`, `craft-profile.json`
- **Writes**: `dual-arc-timeline.json`

#### romantic-fantasy-writer-tension-mapper
- **Level**: Specialist
- **Purpose**: Maps the tension rise and fall across the full book. Ensures pacing variation (INV-020) with alternating high-tension and low-tension scenes.
- **Reads**: `plot-structure.json`, `dual-arc-timeline.json`, `craft-profile.json`
- **Writes**: `tension-map.json`

#### romantic-fantasy-writer-chapter-design-coordinator
- **Level**: Sub-Coordinator
- **Children**: Chapter Outliner, Scene Beat Designer

#### romantic-fantasy-writer-chapter-outliner
- **Level**: Specialist
- **Purpose**: Produces per-chapter outlines: POV character, chapter goals, conflicts, revelations, emotional arc, and how the chapter advances both the fantasy and romance arcs.
- **Reads**: `plot-structure.json`, `dual-arc-timeline.json`, `tension-map.json`, `characters/index.json`
- **Writes**: `chapter-outlines/{N}.json`

#### romantic-fantasy-writer-scene-beat-designer
- **Level**: Specialist
- **Purpose**: Designs scene-level beats within each chapter: scene goals, tension type, POV focus, dialogue vs action balance, emotional register shifts.
- **Reads**: `chapter-outlines/{N}.json`, `craft-profile.json`, `characters/{CHAR-NNN}.json`, `romance-arc-design.json`
- **Writes**: `chapter-outlines/{N}.json` (adds scene beats)

#### romantic-fantasy-writer-plotting-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Purpose**: Most comprehensive auditor. Verifies arc completeness, tension pacing, Chekhov's gun compliance (INV-006), structural integrity, romance escalation (INV-021), and consistency with all prior artifacts.
- **Reads**: `plot-structure.json`, `dual-arc-timeline.json`, `tension-map.json`, `chapter-outlines/{N}.json`, `craft-profile.json`, `story-concept.json`, `romance-arc-design.json`
- **Writes**: `audit-reports/plotting/gate.json`
- **Anti-laziness**: Yes

---

### Phase 5: Style Calibration (depth-2)

#### romantic-fantasy-writer-style-coordinator
- **Level**: Coordinator
- **Children**: Style Analyzer, Style Guide Writer, Style Auditor
- **Dispatch Order**: Style Analyzer → Style Guide Writer → Style Auditor (gate)

#### romantic-fantasy-writer-style-analyzer
- **Level**: Specialist
- **Purpose**: Analyzes reference fiction (if provided) or infers style from the story concept. Extracts abstract stylistic patterns: sentence rhythm, vocabulary register, metaphor density, POV handling conventions.
- **Reads**: `story-config.json`, `story-concept.json`, `characters/{CHAR-NNN}.json`

#### romantic-fantasy-writer-style-guide-writer
- **Level**: Specialist
- **Purpose**: Produces `style-guide.json` with concrete prose guidelines: sentence rhythm patterns, vocabulary register, metaphor density targets, per-POV voice differentiation rules, dialogue style conventions.
- **Reads**: `story-concept.json`, `characters/index.json`, `characters/{CHAR-NNN}.json`, `craft-profile.json`
- **Writes**: `style-guide.json`

#### romantic-fantasy-writer-style-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Purpose**: Verifies the style guide is internally consistent, appropriate for the genre, and compatible with each character's established voice.
- **Reads**: `style-guide.json`, `story-concept.json`, `craft-profile.json`, `characters/{CHAR-NNN}.json`
- **Writes**: `audit-reports/style/gate.json`
- **Anti-laziness**: Yes

---

### Phase 6: Chapter Drafting (depth-3)

#### romantic-fantasy-writer-drafting-coordinator
- **Level**: Coordinator
- **Children**: Creative Writing Sub-Coord., Quality Integration Sub-Coord., Drafting Auditor
- **Dispatch Order per chapter**: Creative Writing Sub-Coord. → Quality Integration Sub-Coord. → Drafting Auditor (gate)
- **Note**: Highest invariant count (47) of any phase; iterates per-chapter

#### romantic-fantasy-writer-creative-writing-coordinator
- **Level**: Sub-Coordinator
- **Children**: Chapter Drafter, POV Voice Maintainer

#### romantic-fantasy-writer-chapter-drafter
- **Level**: Specialist
- **Purpose**: The core prose generator. Writes each chapter following the outline, style guide, character profiles, and world-bible. Updates cross-cutting trackers (continuity, foreshadowing, emotional throughline) as it writes.
- **Reads**: `chapter-outlines/{N}.json`, `style-guide.json`, `characters/{CHAR-NNN}.json`, `world-bible/geography.json`, `world-bible/magic-system.json`, `plot-structure.json`, `dual-arc-timeline.json`, `tension-map.json`, `continuity-tracker.json`, `craft-profile.json`, `foreshadowing-ledger.json`, `emotional-throughline.json`
- **Writes**: `chapters/{N}/draft.md`, `chapters/{N}/metadata.json`, `continuity-tracker.json`, `foreshadowing-ledger.json`, `information-asymmetry-map.json`, `mystery-box-inventory.json`, `emotional-throughline.json`

#### romantic-fantasy-writer-pov-voice-maintainer
- **Level**: Specialist
- **Purpose**: Reviews the draft and ensures POV voice consistency. Each POV section should sound like the designated character per the voice profile (INV-003, INV-015).
- **Reads**: `chapters/{N}/draft.md`, `characters/{CHAR-NNN}.json`, `style-guide.json`
- **Writes**: `chapters/{N}/draft.md` (voice corrections)

#### romantic-fantasy-writer-quality-integration-coordinator
- **Level**: Sub-Coordinator
- **Children**: Continuity Integrator, Craft Enforcer

#### romantic-fantasy-writer-continuity-integrator
- **Level**: Specialist
- **Purpose**: Cross-references the draft against the continuity tracker, world-bible, and character positions. Flags and fixes any continuity errors (INV-002, INV-011, INV-016).
- **Reads**: `chapters/{N}/draft.md`, `continuity-tracker.json`, `world-bible/geography.json`, `characters/index.json`, `information-asymmetry-map.json`
- **Writes**: `chapters/{N}/draft.md` (continuity fixes)

#### romantic-fantasy-writer-craft-enforcer ⚔️
- **Level**: Specialist
- **Purpose**: Verifies that the craft techniques selected in the craft profile are actually being used in the prose. Checks foreshadowing placement, symbolic motif usage, emotional throughline progression, mystery box management.
- **Reads**: `chapters/{N}/draft.md`, `craft-profile.json`, `foreshadowing-ledger.json`, `emotional-throughline.json`, `symbolic-motif-registry.json`, `mystery-box-inventory.json`
- **Writes**: `chapters/{N}/draft.md` (craft technique additions)
- **Anti-laziness**: Yes

#### romantic-fantasy-writer-drafting-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Purpose**: Adversarial gate for each drafted chapter. Verifies outline compliance, style guide adherence, continuity accuracy, and craft technique usage.
- **Reads**: `chapters/{N}/draft.md`, `chapters/{N}/metadata.json`, `chapter-outlines/{N}.json`, `style-guide.json`, `craft-profile.json`, `continuity-tracker.json`
- **Writes**: `audit-reports/drafting/gate.json`
- **Anti-laziness**: Yes

---

### Phase 7: Revision (depth-2)

#### romantic-fantasy-writer-revision-coordinator
- **Level**: Coordinator
- **Children**: Developmental Editor, Line Editor, Copy Editor, Chapter Reviser, Revision Auditor
- **Dispatch Order per chapter**: Developmental Editor → Line Editor → Copy Editor → Chapter Reviser → Revision Auditor (gate)

#### romantic-fantasy-writer-developmental-editor
- **Level**: Specialist
- **Purpose**: Macro-level edit: examines plot holes, pacing issues, character motivation gaps, arc satisfaction, thematic consistency. Produces a developmental edit report.
- **Reads**: `chapters/{N}/draft.md`, `plot-structure.json`, `dual-arc-timeline.json`, `tension-map.json`, `romance-arc-design.json`, `craft-profile.json`
- **Writes**: `revision-reports/{N}/developmental.json`

#### romantic-fantasy-writer-line-editor
- **Level**: Specialist
- **Purpose**: Sentence-level edit: prose quality, sentence rhythm, word choice, repetition, flow, readability. Produces a line edit report.
- **Reads**: `chapters/{N}/draft.md`, `style-guide.json`, `craft-profile.json`
- **Writes**: `revision-reports/{N}/line-edit.json`

#### romantic-fantasy-writer-copy-editor
- **Level**: Specialist
- **Purpose**: Fact-level edit: continuity details, world consistency, character name/description accuracy, timeline correctness. Produces a copy edit report.
- **Reads**: `chapters/{N}/draft.md`, `continuity-tracker.json`, `world-bible/geography.json`, `characters/index.json`
- **Writes**: `revision-reports/{N}/copy-edit.json`

#### romantic-fantasy-writer-chapter-reviser
- **Level**: Specialist
- **Purpose**: Synthesizes all three edit reports (and any beta feedback from a revision-beta loop) into a revised chapter draft.
- **Reads**: `chapters/{N}/draft.md`, `revision-reports/{N}/developmental.json`, `revision-reports/{N}/line-edit.json`, `revision-reports/{N}/copy-edit.json`, `beta-synthesis/{N}.json`
- **Writes**: `chapters/{N}/revised.md`

#### romantic-fantasy-writer-revision-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Purpose**: Verifies all editor findings were addressed in the revision. Compares revised draft against original and edit reports.
- **Reads**: `chapters/{N}/revised.md`, `chapters/{N}/draft.md`, `revision-reports/{N}/developmental.json`, `revision-reports/{N}/line-edit.json`, `revision-reports/{N}/copy-edit.json`, `craft-profile.json`
- **Writes**: `audit-reports/revision/gate.json`
- **Anti-laziness**: Yes

---

### Phase 8: Beta Reading (depth-3)

#### romantic-fantasy-writer-beta-reading-coordinator
- **Level**: Coordinator
- **Children**: Genre Lens Sub-Coord., Craft Lens Sub-Coord., Beta Synthesizer, Beta Reading Auditor
- **Dispatch Order per chapter**: Genre Lens Sub-Coord. ‖ Craft Lens Sub-Coord. (parallel) → Beta Synthesizer → Beta Reading Auditor (gate)

#### romantic-fantasy-writer-genre-lens-coordinator
- **Level**: Sub-Coordinator
- **Children**: Romance Beta Reader, Fantasy Beta Reader
- **Dispatch**: Parallel — both readers evaluate independently

#### romantic-fantasy-writer-romance-beta-reader
- **Level**: Specialist
- **Purpose**: Evaluates from a romance reader perspective: HEA/HFN satisfaction, chemistry believability, emotional escalation pacing, steam level appropriateness, romantic tension effectiveness.
- **Reads**: `chapters/{N}/revised.md`, `romance-arc-design.json`, `characters/{CHAR-NNN}.json`, `craft-profile.json`
- **Writes**: `beta-feedback/{N}/romance-lens.json`

#### romantic-fantasy-writer-fantasy-beta-reader
- **Level**: Specialist
- **Purpose**: Evaluates from a fantasy reader perspective: worldbuilding immersion, magic system consistency, plot tension, lore engagement, battle/action scene quality.
- **Reads**: `chapters/{N}/revised.md`, `world-bible/geography.json`, `world-bible/magic-system.json`, `information-asymmetry-map.json`, `continuity-tracker.json`
- **Writes**: `beta-feedback/{N}/fantasy-lens.json`

#### romantic-fantasy-writer-craft-lens-coordinator
- **Level**: Sub-Coordinator
- **Children**: Craft Beta Reader, Sensitivity Beta Reader, Originality Beta Reader
- **Dispatch**: Parallel — all three readers evaluate independently

#### romantic-fantasy-writer-craft-beta-reader
- **Level**: Specialist
- **Purpose**: Evaluates prose craft quality: sentence-level writing, structural pacing, use of literary techniques, foreshadowing effectiveness, symbolic resonance.
- **Reads**: `chapters/{N}/revised.md`, `style-guide.json`, `craft-profile.json`, `foreshadowing-ledger.json`, `symbolic-motif-registry.json`
- **Writes**: `beta-feedback/{N}/craft-lens.json`

#### romantic-fantasy-writer-sensitivity-beta-reader
- **Level**: Specialist
- **Purpose**: Evaluates representation, cultural sensitivity, power dynamics, and consent in romantic scenes. Flags any harmful stereotypes or problematic portrayals.
- **Reads**: `chapters/{N}/revised.md`, `characters/{CHAR-NNN}.json`, `world-bible/culture.json`, `craft-profile.json`
- **Writes**: `beta-feedback/{N}/sensitivity-lens.json`

#### romantic-fantasy-writer-originality-beta-reader
- **Level**: Specialist
- **Purpose**: Evaluates freshness and originality: cliché detection, genre convention awareness (subverting vs. following), unique voice assessment. Enforces INV-023 (no plagiarism) and INV-025 (originality self-audit).
- **Reads**: `chapters/{N}/revised.md`, `story-concept.json`, `craft-profile.json`
- **Writes**: `beta-feedback/{N}/originality-lens.json`

#### romantic-fantasy-writer-beta-synthesizer
- **Level**: Specialist
- **Purpose**: Aggregates all five beta reader reports into a unified synthesis. Prioritizes findings, identifies consensus issues, and recommends either approval or specific revisions needed.
- **Reads**: `beta-feedback/{N}/romance-lens.json`, `beta-feedback/{N}/fantasy-lens.json`, `beta-feedback/{N}/craft-lens.json`, `beta-feedback/{N}/sensitivity-lens.json`, `beta-feedback/{N}/originality-lens.json`
- **Writes**: `beta-synthesis/{N}.json`

#### romantic-fantasy-writer-beta-reading-auditor ⚔️
- **Level**: Specialist (Auditor)
- **Purpose**: Verifies all five lenses produced substantive feedback and the synthesis accurately represents the consensus. Prevents rubber-stamping.
- **Reads**: All five lens feedback files, `beta-synthesis/{N}.json`, `chapters/{N}/revised.md`
- **Writes**: `audit-reports/beta-reading/gate.json`
- **Anti-laziness**: Yes

---

### Phase 9: Polish & Delivery (depth-2)

#### romantic-fantasy-writer-polish-coordinator
- **Level**: Coordinator
- **Children**: Polisher, Summary Generator, Delivery Assembler
- **Dispatch Order**: Polisher → Summary Generator → Delivery Assembler

#### romantic-fantasy-writer-polisher
- **Level**: Specialist
- **Purpose**: Final proofread pass: minor prose refinements, typo fixes, formatting consistency. Produces the final version of each chapter.
- **Reads**: `chapters/{N}/revised.md`, `style-guide.json`, `continuity-tracker.json`
- **Writes**: `chapters/{N}/final.md`

#### romantic-fantasy-writer-summary-generator
- **Level**: Specialist
- **Purpose**: Creates per-chapter summaries for reference, series tracking, and potential marketing use.
- **Reads**: `chapters/{N}/final.md`, `characters/index.json`, `plot-structure.json`
- **Writes**: `chapter-summaries/{N}.json`

#### romantic-fantasy-writer-delivery-assembler
- **Level**: Specialist
- **Purpose**: Packages the complete book: generates the delivery report with statistics, promotes relevant data to the series KB, and confirms all chapters are present and complete.
- **Reads**: `chapters/{N}/final.md`, `chapter-summaries/{N}.json`, `series-kb/index.json`, `story-concept.json`
- **Writes**: `delivery-report.json`

---

### Cross-Cutting Specialists

These three specialists are dispatched directly by the orchestrator (an intentional hierarchy exception) and operate throughout the pipeline.

#### romantic-fantasy-writer-continuity-tracker
- **Level**: Specialist (Cross-Cutting)
- **Parent**: Orchestrator
- **Purpose**: Maintains the running continuity record: established facts, character physical positions, timeline events, what characters know vs. what the reader knows. Updated after every chapter draft and revision.
- **Reads**: `chapters/{N}/draft.md`, `chapters/{N}/revised.md`, `world-bible/geography.json`, `characters/index.json`, `plot-structure.json`
- **Writes**: `continuity-tracker.json`, `information-asymmetry-map.json`

#### romantic-fantasy-writer-series-kb-manager
- **Level**: Specialist (Cross-Cutting)
- **Parent**: Orchestrator
- **Purpose**: Manages the series-level knowledge base lifecycle. After book completion, promotes world-bible data, character arcs, resolved plot threads, and continuity records to the series KB for use in sequels.
- **Reads**: `story-concept.json`, all `world-bible/*.json`, `characters/index.json`, `characters/{CHAR-NNN}.json`, `chapter-summaries/{N}.json`, `chapters/{N}/final.md`
- **Writes**: `series-kb/index.json`

#### romantic-fantasy-writer-craft-tracker ⚔️
- **Level**: Specialist (Cross-Cutting)
- **Parent**: Orchestrator
- **Purpose**: Tracks advanced craft dimensions throughout the pipeline: foreshadowing items planted and resolved, mystery boxes opened and closed, emotional throughline progression, symbolic motif recurrence patterns.
- **Reads**: `chapters/{N}/draft.md`, `craft-profile.json`, `plot-structure.json`, `chapter-outlines/{N}.json`
- **Writes**: `foreshadowing-ledger.json`, `mystery-box-inventory.json`, `emotional-throughline.json`, `symbolic-motif-registry.json`
- **Anti-laziness**: Yes

---

## Cross-Reference: Artifact Producer-Consumer Map

| Artifact | Produced By | Consumed By |
|----------|-------------|-------------|
| `story-config.json` | Guide | All agents |
| `story-concept.json` | Concept Developer | Worldbuilding, Character, Plotting, Style, Delivery |
| `craft-profile.json` | Craft Profile Selector | Plotting, Style, Drafting, Revision, Beta, Craft Tracker |
| `world-bible/geography.json` | Geography Builder | Culture Builder, History Builder, Character, Drafting, Copy Editor, Beta, Continuity Tracker |
| `world-bible/culture.json` | Culture Builder | History Builder, Character, Sensitivity Beta Reader |
| `world-bible/history.json` | History Builder | (Referenced by worldbuilding auditor) |
| `world-bible/magic-system.json` | Magic System Designer | Political Structure Builder, Character, Drafting, Fantasy Beta Reader |
| `world-bible/politics.json` | Political Structure Builder | Supporting Cast Developer |
| `characters/index.json` | Protagonist Profiler, Supporting Cast Developer | Romance Arc, Ensemble, Plotting, Drafting, Copy Editor, Polish |
| `characters/{CHAR-NNN}.json` | Protagonist Profiler, Supporting Cast, Voice Designer | Romance Arc, Plotting, Style, Drafting, Beta |
| `romance-arc-design.json` | Romance Arc Designer | Plotting, Developmental Editor, Romance Beta Reader |
| `plot-structure.json` | Structure Selector | Dual Arc Builder, Tension Mapper, Chapter Outliner, Drafting, Polish, Trackers |
| `dual-arc-timeline.json` | Dual Arc Builder | Tension Mapper, Chapter Outliner, Developmental Editor |
| `tension-map.json` | Tension Mapper | Chapter Outliner, Developmental Editor |
| `chapter-outlines/{N}.json` | Chapter Outliner, Scene Beat Designer | Drafting, Craft Tracker |
| `style-guide.json` | Style Guide Writer | Drafting, POV Voice, Line Editor, Polisher, Craft Beta Reader |
| `chapters/{N}/draft.md` | Chapter Drafter, POV Voice, Continuity Integrator, Craft Enforcer | Revision, Continuity Tracker, Craft Tracker |
| `chapters/{N}/revised.md` | Chapter Reviser | Beta Reading, Polisher |
| `chapters/{N}/final.md` | Polisher | Summary Generator, Delivery Assembler, Series KB Manager |
| `revision-reports/{N}/*.json` | Dev Editor, Line Editor, Copy Editor | Chapter Reviser, Revision Auditor |
| `beta-feedback/{N}/*.json` | 5 Beta Readers | Beta Synthesizer, Beta Reading Auditor |
| `beta-synthesis/{N}.json` | Beta Synthesizer | Chapter Reviser (revision-beta loop), Beta Reading Auditor |
| `continuity-tracker.json` | Continuity Tracker, Chapter Drafter | Continuity Integrator, Copy Editor, Polisher |
| `foreshadowing-ledger.json` | Craft Tracker, Chapter Drafter | Craft Enforcer, Craft Beta Reader |
| `emotional-throughline.json` | Craft Tracker, Chapter Drafter | Craft Enforcer |
| `symbolic-motif-registry.json` | Craft Tracker | Craft Enforcer, Craft Beta Reader |
| `mystery-box-inventory.json` | Craft Tracker, Chapter Drafter | Craft Enforcer |
| `information-asymmetry-map.json` | Continuity Tracker, Chapter Drafter | Continuity Integrator, Fantasy Beta Reader |
| `series-kb/index.json` | Series KB Manager | Delivery Assembler, (next book's agents) |
| `delivery-report.json` | Delivery Assembler | Guide |
| `audit-reports/{phase}/gate.json` | Phase Auditors | Coordinators (routing decision) |
| `progress.json` | Orchestrator | All coordinators |
| `manifest.json` | All agents | Orchestrator, Delivery |
