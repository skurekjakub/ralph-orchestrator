# Fantasy Fiction Writer — Domain Brief

## Purpose

Build an autonomous multi-agent system that writes **romantic fantasy fiction** — from initial concept through fully-drafted, reviewed, and polished story chapters. The system takes raw inputs (story ideas, mood boards, reference stories, style samples) and produces complete fiction through a structured creative pipeline that mirrors how professional authors and editorial teams work.

## Genre Focus: Romantic Fantasy

Romantic fantasy is a subgenre of fantasy where the central plot is a fantasy narrative (quests, magic systems, political intrigue, world-altering conflict) but a romantic relationship between protagonists is a major throughline that enriches and complicates the main plot. Unlike "fantasy romance" (which is romance-first), romantic fantasy keeps the fantasy arc primary while the romance serves as emotional spine.

### Key Genre Characteristics
- **Fantasy-first plot**: Epic quests, magical conflicts, political intrigue, world-threatening stakes
- **Romance as emotional spine**: The central relationship drives character growth and raises personal stakes, but doesn't supersede the fantasy plot
- **Slow-burn preferred**: Tension builds across chapters; emotional and physical intimacy escalate gradually
- **Popular tropes**: Enemies-to-lovers, forbidden love, fated mates, forced proximity, secret identity, there-was-only-one-bed, morally grey love interests, found family
- **Worldbuilding depth**: Rich magic systems, detailed cultures, complex political structures, immersive settings
- **Character complexity**: Protagonists with deep backstories, psychological wounds, competing loyalties, and genuine growth arcs
- **Dual POV common**: Alternating perspectives between the romantic leads
- **HEA/HFN ending**: "Happily ever after" or "happy for now" — the genre promises emotional satisfaction

### Representative Works (Style/Tone References)
- **Sarah J. Maas** — *A Court of Thorns and Roses* series (lush prose, slow-burn, high stakes, spice)
- **Leigh Bardugo** — *Six of Crows* (ensemble cast, heist plot with romance woven through)
- **Samantha Shannon** — *The Priory of the Orange Tree* (epic scope, F/F romance, complex worldbuilding)
- **Nalini Singh** — *Guild Hunter* series (paranormal romance-fantasy, compelling world, tension)
- **Jay Kristoff** — *Nevernight* (dark, gory, assassin school, smutty undertones)
- **Intisar Khanani** — *Thorn* (fairy tale retelling, slow-burn, character growth focus)
- **C.L. Polk** — *Witchmark* (mystery within magical society, angsty will-they-won't-they)
- **Emily Tesh** — *Silver in the Wood* (quiet, atmospheric, folk-horror romance)
- **Zen Cho** — *Sorcerer to the Crown* (Regency + magic + social commentary)
- **Erin Morgenstern** — *The Night Circus* (poetic, atmospheric, dual timeline, magical competition)

## Input Types the System Must Handle

These are the **runtime inputs** a user provides when invoking the fantasy-writer system. The user provides these, and the agent does everything else autonomously.

1. **Story idea / concept seed** (REQUIRED): Brief description of a premise, "what if" scenario, or elevator pitch. Can range from a one-liner ("fae assassin falls for the prince she's sent to kill") to a multi-paragraph concept note.
2. **Reference stories / style samples** (OPTIONAL): Existing fiction passages to analyze for prose style, tone, pacing, voice. These are analyzed for abstract stylistic patterns ONLY — never reproduced or closely imitated in content. The system extracts structural characteristics (sentence rhythm, vocabulary register, metaphor density, POV style, paragraph cadence) and applies those patterns to wholly original prose.
3. **Mood / tone direction** (OPTIONAL): Tonal keywords or descriptions — dark gothic, whimsical cozy, politically tense, sensual slow-burn, grimdark, lyrical, etc.
4. **Character sketches** (OPTIONAL): Partial character ideas the user wants developed — names, traits, backstory fragments, relationship dynamics
5. **World fragments** (OPTIONAL): Partial worldbuilding — a magic system idea, a political structure, a geography, naming conventions
6. **Constraints** (OPTIONAL): Length targets (chapter count, word count), heat-level (fade-to-black through explicit), trope preferences (enemies-to-lovers, forced proximity, etc.), content warnings to include/avoid, standalone vs. series

The minimum viable input is ONLY a story idea. Everything else is optional enrichment. The system must be able to generate a complete story from just a premise.

## System Architecture Requirements

### User-Facing Guide Agent
The system MUST include a **guide agent** as the sole user-facing entry point — identical in pattern to the fractal-factory-guide. The guide:
1. Asks the user for their story idea, optional style samples, mood/tone, character sketches, world fragments, and constraints
2. Validates the inputs and fills in sensible defaults for anything not provided
3. Writes a `story-config.json` (or equivalent configuration artifact) capturing all user inputs
4. Confirms the configuration with the user before launching
5. Invokes the session orchestrator which runs the full pipeline autonomously
6. Reports results back to the user when complete

The guide is the ONLY agent that interacts with the user. All other agents are fully autonomous.

### Adversarial Consistency Gates (Cross-Cutting)

Every creative phase (Phases 1–6) MUST include an **adversarial consistency auditor** as a sub-phase before the phase is considered complete. This is not deferred to the final revision/beta — each phase validates its own output before the pipeline advances.

The adversarial auditor for each phase:
1. **Receives** the phase's output artifacts
2. **Challenges** internal consistency by actively trying to find contradictions, gaps, logic failures, and weak spots
3. **Cross-references** against all prior phase artifacts (e.g., the plotting auditor checks against the world bible AND character bible, not just the outline)
4. **Produces** a structured findings report with severity levels (critical / major / minor)
5. **Blocks** phase completion if any critical findings exist — the phase's primary specialist must address criticals before the coordinator marks the phase done

**"Kill Your Darlings" mandate:** Every adversarial auditor MUST explicitly look for "darlings" — passages, world details, character traits, or plot elements that are beautiful or clever but don't serve the story, the reader, or the scene's purpose. The concept (attributed to Faulkner, popularized by Stephen King) is that writers' favorite bits are often the biggest roadblocks the reader encounters. The auditor must ask: "Does this passage/element serve the story, or does it exist because the writer loved it?" Darlings that slow pacing, muddy theme, confuse the reader, or are self-indulgent must be flagged for cutting — no matter how well-written they are. Move them to a "killed darlings" file rather than deleting entirely, but they must leave the manuscript.

**Phase-specific auditor focus areas:**

| Phase | Auditor Focus |
|---|---|
| **Concept** | Is the premise internally coherent? Do the themes conflict with the genre promise? Are comp titles actually comparable? |
| **Worldbuilding** | Does the magic system contradict itself? Do political structures make sociological sense? Are geography/distances/travel times consistent? Do cultural details contradict each other? |
| **Character** | Do character motivations contradict their backstories? Are psychological wounds consistent with behavior? Do voice guides actually differ between POV characters? Does the romance dynamic have genuine (not manufactured) tension? |
| **Plotting** | Does every scene follow from character motivation? Does every scene have Swain's Scene-Sequel structure (Goal→Conflict→Disaster / Reaction→Dilemma→Decision)? Does every scene contain all Five Commandments (Inciting Incident, Turning Point, Crisis, Climax, Resolution)? Does every scene shift a value? Are there Chekhov's guns that never fire (or fire without setup)? Does the dual-arc interleave actually work — do fantasy and romance beats reinforce rather than compete? Are there try-fail cycles before major victories? Is there a devastating Black Moment? Are there logic holes in the sequence of events? |
| **Style** | Does the style guide contradict observed patterns in reference material? Are tone palette prescriptions achievable in the specified style? |
| **Drafting** | Per-chapter: Does this chapter match the outline? Are there continuity breaks from the previous chapter? Does character voice match the voice guide? Are worldbuilding details consistent with the bible? Does the chapter deliver its assigned romance and fantasy beats? Does every scene follow Scene-Sequel structure? Do characters fail before succeeding (try-fail cycles)? Is dialogue driven by subtext rather than on-the-nose statements? Do both leads demonstrate agency? Are there any "darlings" — beautiful passages that don't serve the story? |

These auditors enforce the "verify as you go" principle — catching problems at their source rather than accumulating them for a distant review pass. The Phase 7-8 revision and beta reading still happen, but they should encounter far fewer issues because each phase was already stress-tested.

## Full Creative Pipeline

The agent system should implement a complete fiction-writing pipeline that covers every stage a professional author-editorial team would use:

### Phase 1: Concept Development
- **Idea Distillation**: Take raw inputs and crystallize the core concept — what is this story *about* (thematically), not just what *happens*
- **Theme Extraction**: Identify 2-3 thematic pillars (e.g., "the cost of power," "love as vulnerability," "chosen family vs. blood")
- **Premise Refinement**: Sharpen the one-line premise and expand to a paragraph-length hook
- **Comparable Titles**: Identify comp titles for tone/audience positioning (e.g., "ACOTAR meets Six of Crows")

### Phase 2: Worldbuilding
- **Geography & Setting**: Maps (textual), regions, climates, travel distances, key locations
- **Magic System Design**: Rules, costs, limitations, who can use it, how it's learned, how it intersects with politics/society (Sanderson's Laws: hard vs. soft magic, cost of magic, limitations before abilities)
- **Political & Social Structures**: Kingdoms, factions, class systems, power hierarchies, religious orders
- **History & Lore**: Key historical events that shape the present, creation myths, legendary figures
- **Culture & Daily Life**: Customs, food, clothing, languages (naming conventions), festivals, taboos
- **Fauna & Flora**: Magical creatures, dangerous flora, domesticated beasts
- **Consistency Bible**: A canonical reference document ensuring all worldbuilding details remain consistent

### Phase 3: Character Development
- **Protagonist Profiles**: Full character sheets for romantic leads — backstory, psychological wounds, desires (external goal + internal need), flaws, strengths, voice patterns, speech quirks
- **Romance Arc Design**: The specific dynamic between leads — what draws them together, what keeps them apart, what forces vulnerability, what is the emotional climax
- **Supporting Cast**: Named secondary characters with roles (mentor, rival, comic relief, betrayer), their own mini-arcs
- **Antagonist Design**: The villain or opposing force — motivation, methodology, relationship to protagonists, how they mirror/contrast the leads
- **Character Voice Guide**: Distinct speech patterns, internal monologue style, vocabulary level, emotional register for each POV character
- **Relationship Web**: How every named character relates to every other — alliances, tensions, secrets

### Phase 4: Plotting & Outlining
- **Story Structure Selection**: Choose and apply a structural framework:
  - **Three-Act Structure**: Setup → Confrontation → Resolution with clear act breaks
  - **Save the Cat Beat Sheet** (Blake Snyder): 15 beats from Opening Image through Final Image — particularly useful for pacing romance beats
  - **The Hero's Journey** (Campbell/Vogler): Call to adventure → Ordeal → Return — good for quest-heavy fantasy
  - **Seven-Point Story Structure** (Dan Wells): Hook → Plot Turn 1 → Pinch 1 → Midpoint → Pinch 2 → Plot Turn 2 → Resolution
  - **Romance Arc Structure**: Meet → Attraction → Rising conflict → Black moment → Grand gesture → Resolution (mapped alongside the fantasy plot arc)
  - **Dual-Arc Interleave**: The fantasy plot arc and romance arc must be plotted in parallel, with key beats from each reinforcing or complicating the other
- **Chapter-Level Outline**: Scene-by-scene breakdown with:
  - POV character
  - Scene goal (what the character wants)
  - Scene conflict (what opposes them)
  - Scene disaster/resolution (outcome that complicates)
  - Emotional arc (how the character's emotional state shifts)
  - Romance beat (where this scene falls on the romance arc)
  - Fantasy plot beat (where this falls on the main plot arc)
  - Key worldbuilding reveals
- **Tension Mapping**: Visual/textual pacing chart showing tension rise-and-fall across chapters
- **Subplot Tracking**: B-plots, C-plots with their own mini-arcs and intersection points with the main plot

### Phase 5: Prose Style Development
- **Voice Calibration**: If reference stories are provided, analyze them for:
  - Sentence length distribution (short punchy vs. long flowing)
  - Vocabulary level and register
  - Metaphor density and type (natural imagery, architectural, bodily, etc.)
  - Dialogue-to-narration ratio
  - Interior monologue style (close third, distant third, first person)
  - Paragraph rhythm and white space usage
- **Style Guide**: A concrete document specifying the target prose style for this particular story
- **Tone Palette**: Specific emotional tones by chapter type (action scenes = staccato/visceral; romantic scenes = sensory/languid; political scenes = precise/tense)

### Phase 6: Drafting
- **Chapter Drafting**: Write each chapter following the outline, maintaining:
  - Consistent character voice per POV
  - Scene structure (goal/conflict/disaster or goal/conflict/resolution)
  - Prose style adherence
  - Worldbuilding consistency
  - Romance arc pacing
  - Chapter hooks (opening hooks and closing cliffhangers/page-turners)
- **Continuity Tracking**: Track what each character knows at each point, where they physically are, timeline progression, promises made to the reader (Chekhov's guns)
- **Draft Segmentation**: Produce chapters in sequence, each building on the previous, with a running continuity document updated after each chapter

### Phase 7: Self-Editing & Revision (Multi-Pass, Exhaustive)
- **Developmental Edit Pass**: Review for:
  - Plot holes and logical inconsistencies
  - Pacing problems (sagging middle, rushed climax)
  - Character motivation gaps — does every action follow from established motivation?
  - Romance arc satisfaction — are beats earned? Is the progression natural?
  - Worldbuilding contradictions — does the magic work the same way it did 5 chapters ago?
  - Theme reinforcement — is the thematic argument landing?
  - Structural problems — scenes in wrong order, missing transitions, redundant scenes
- **Line Edit Pass**: Review for:
  - Prose quality and style consistency — flag every bland/generic sentence
  - Dialogue naturalism and character-voice distinctness — can you tell who's speaking without tags?
  - Overwriting (purple prose, info-dumping, unnecessary adjectives)
  - Underwriting (scenes that need more sensory/emotional detail)
  - Repetitive word/phrase usage — catch repeated sentence openings, pet phrases, overused words
  - Show vs. tell balance — flag every instance of told emotion in key scenes
  - Cliché detection — flag generic fantasy clichés ("orbs" for eyes, "smirk," "let out a breath they didn't know they were holding")
  - POV consistency — flag head-hopping, knowledge the POV character shouldn't have, wrong emotional register for the character
- **Copy Edit Pass**: 
  - Grammar, punctuation, spelling
  - Consistency in naming, titles, place names, honorifics
  - Timeline consistency — day/night, travel distances, elapsed time
  - Factual accuracy within the world's rules

### Phase 8: Beta Reading Simulation (Deep, Multi-Perspective)

This is a critical quality gate. The beta reading must be thorough enough to catch EVERY issue that would undermine reader satisfaction. It operates as multiple independent reviewers:

- **Romance Reader Lens**:
  - Is the central relationship compelling? Are both leads equally developed?
  - Are the romantic beats (first meeting, first touch, first vulnerability, first conflict, reconciliation) satisfying and earned?
  - Is the chemistry believable — does the dialogue crackle, do the scenes between leads feel charged?
  - Is the heat level consistent with the stated target?
  - Does the HEA/HFN feel genuine, not forced?

- **Fantasy Reader Lens**:
  - Is the worldbuilding immersive and internally consistent?
  - Is the magic system interesting and does it follow its own rules?
  - Are the stakes real? Does the fantasy plot have genuine tension?
  - Is the political/social structure believable?
  - Do the fantasy and romance arcs enhance each other, or does one feel bolted on?

- **Craft Reader Lens** (most critical):
  - **Prose quality audit**: Flag every bland, generic, or lazy sentence. No "she felt a shiver run down her spine" defaults. Every metaphor must be fresh or at minimum genre-appropriate.
  - **Voice consistency audit**: For each POV character, verify the internal monologue voice is distinct and consistent across ALL their chapters. Flag drift.
  - **POV violation scan**: Flag every instance of head-hopping, knowledge leaks (character knows something they shouldn't), or tonal mismatches for the POV character.
  - **Continuity audit**: Cross-reference every fact (character location, time of day, weather, what characters know, physical descriptions, names mentioned) against the continuity tracker. Flag every inconsistency.
  - **Emotional authenticity audit**: For every major emotional beat, verify buildup, check that the reaction matches the character's established personality, and flag any reaction that feels generic rather than character-specific.
  - **Dialogue audit**: Verify each character's dialogue voice is distinct. Flag any passage where stripping speaker tags makes it impossible to identify who's talking.
  - **Pacing audit**: Map tension level per scene across the full manuscript. Flag pacing failures (three consecutive slow scenes, climax without adequate builds, anti-climactic resolutions).

- **Sensitivity Reader Lens**:
  - Flag problematic representations, stereotypes, or harmful tropes
  - Check power dynamics in the romance for consent and agency
  - Review cultural elements for appropriation concerns

- **Originality Reader Lens**:
  - Flag any passage, character, plot element, or world detail that too closely resembles a known published work
  - Cite the specific similarity and source
  - Verify the style guide was applied transformatively, not reproductively

Each lens produces a structured findings document with severity levels (critical / major / minor / suggestion). All critical and major findings MUST be addressed in a revision pass before the chapter is considered complete.

### Phase 9: Polish & Delivery
- **Final proofread**: Last pass for typos, formatting, consistency
- **Chapter summaries**: One-paragraph summary per chapter for easy reference
- **Series knowledge base update** (if series): Promote this book's canonical facts into the series knowledge base — see Series Architecture below
- **Delivery package**: All output artifacts organized and cross-referenced under the book directory

## Series Architecture & Sequel Production

The system MUST be designed for series production from day one, even if the first invocation is a standalone. All generated knowledge is organized to enable seamless sequel creation.

### Artifact Organization

Every artifact type that accumulates significant knowledge MUST be decomposed into **subcategory files** within a typed directory. Monolithic files become unnavigable and cause context-window waste — agents loading the world bible to check a single geography detail shouldn't need to ingest the entire magic system. Subcategories also make cross-referencing precise (an outline scene can cite `world/magic/blood-singing.md` rather than "see world-bible.md, magic section").

```
output/
  series.json                    ← Series metadata (title, book count, status)
  series/                        ← Series-level canonical knowledge (cross-book truth)
    world/                       ← Canonical world state (updated after each book)
      geography/
        regions.md
        key-locations.md
        travel-distances.md
      magic/
        core-rules.md
        costs-and-limitations.md
        practitioners.md
        <system-name>.md         ← One file per named magic discipline/school
      politics/
        factions.md
        power-structures.md
        treaties-and-conflicts.md
      culture/
        customs-and-taboos.md
        languages-and-naming.md
        religions.md
        daily-life.md
      history/
        creation-myths.md
        major-events.md
        legendary-figures.md
      flora-fauna/
        magical-creatures.md
        mundane-ecology.md
    characters/                  ← All characters across books
      leads/
        <character-name>.md      ← One file per lead: backstory, arc state, voice guide
      supporting/
        <character-name>.md
      antagonists/
        <character-name>.md
      registry-index.md          ← Master index: name, role, status, last appearance, origin book
      relationship-map.md        ← Cross-book relationship state between all named characters
      voice-guides/
        <character-name>.md      ← Extracted voice patterns per POV character (carries across books)
    magic-system.md              ← High-level summary + links to world/magic/ details
    timeline.md                  ← Master timeline across all books (chronological events)
    unresolved-threads.md        ← Chekhov's guns planted but not yet fired, tagged by origin book
    naming-conventions.md        ← Established names, places, terms, honorifics
    style-guide.md               ← Series-level prose style (may evolve slightly per book)
  book-1/                        ← Per-book isolated artifacts
    concept/
      premise.md                 ← Theme, elevator pitch, comp titles
      craft-profile.md           ← Selected toolbox items with rationale
      constraints.md             ← Heat level, length target, trope selections, content warnings
    world/                       ← This book's worldbuilding additions
      <mirrors series/world/ structure — only new or expanded entries>
    characters/
      <mirrors series/characters/ structure — only this book's new/changed characters>
      arcs/
        <character-name>-arc.md  ← This character's arc plan and outcome for this book
    outline/
      structure.md               ← Chosen structural framework (3-act, Save the Cat, etc.)
      chapter-outline/
        ch-01.md ... ch-N.md     ← Per-chapter: POV, goal, conflict, beats, emotional arc
      tension-map.md             ← Pacing chart: tension rise-and-fall across chapters
      subplot-tracker.md         ← B-plots, C-plots with intersection points
    style/
      style-guide.md             ← Book-specific prose style (extends series/)
      tone-palette.md            ← Emotional tones by scene type
      reference-analysis.md      ← Abstract patterns extracted from style samples (if provided)
    chapters/
      drafts/
        ch-01.md ... ch-N.md
      final/
        ch-01.md ... ch-N.md
    continuity/
      tracker.md                 ← Running facts, positions, timeline
      knowledge-matrix.md        ← What each character knows at each chapter boundary
      promises.md                ← Reader promises (Chekhov's guns) — planted, status
    revision/
      developmental/
        ch-01.md ... ch-N.md     ← Per-chapter developmental edit findings
      line-edit/
        ch-01.md ... ch-N.md
      copy-edit/
        ch-01.md ... ch-N.md
      revision-log.md            ← Traceability: every change → what finding prompted it
    beta-feedback/
      romance-reader.md
      fantasy-reader.md
      craft-reader.md
      sensitivity-reader.md
      originality-reader.md
      synthesis.md               ← Combined findings, prioritized by severity
    killed-darlings.md           ← Removed-but-saved passages, world details, plot elements
    book-summary.md              ← Post-completion: plot summary, arc outcomes, state changes
  book-2/
    ...
```

**Subcategory rules:**
- Artifacts with more than ~3 distinct topics MUST be split into subcategory files within a typed directory. A single `world-bible.md` covering geography, magic, politics, culture, and history is too coarse.
- Each subcategory file should be self-contained enough to be loaded independently. An agent checking magic rules shouldn't need to load geography.
- Cross-references between subcategories use relative paths (`../characters/leads/kael.md`), never vague prose references ("see the character bible").
- The series-level directories define the canonical schema. Per-book directories mirror the same structure but contain only new or changed entries for that book.
- At book completion, new per-book entries are **promoted** into the series-level directories (merged, not moved — the book retains its copy for isolation).

### Sequel Input Contract

When producing a sequel, the system receives:
1. **All standard inputs** (story idea, optional style samples, etc.) — scoped to the new book
2. **The series knowledge base** (`series/`) — this is the canonical cross-book state. The new book MUST be consistent with everything in it.
3. **Previous book summaries** (`book-N/book-summary.md`) — for narrative context without re-reading full manuscripts
4. **Unresolved threads** (`series/unresolved-threads.md`) — the sequel concept phase MUST decide which threads this book resolves, advances, or deliberately leaves open. No thread may be silently forgotten.

The sequel does NOT need to re-read prior books' raw chapters — the series knowledge base and summaries are sufficient.

### Series Knowledge Base Lifecycle

1. **Book 1 (standalone)**: Per-book artifacts are created as usual. On completion, the book-summary agent extracts canonical facts into the `series/` directory. Even a "standalone" gets this treatment — it's cheap insurance.
2. **Book N (sequel)**: The concept phase loads the series knowledge base. All phases cross-reference against it. On completion, the book-summary agent **merges** this book's new facts into the series knowledge base:
   - New characters → added to `character-registry.md`
   - Changed character states (injuries, alliances, deaths) → updated in registry
   - New world facts → merged into `world-bible.md`
   - Magic system expansion → merged into `magic-system.md` (must not contradict existing rules)
   - Resolved threads → moved from `unresolved-threads.md` to the book summary
   - New threads planted → added to `unresolved-threads.md` with the book they were planted in
   - Timeline events → appended to `timeline.md`

### Cross-Book Consistency Rules

- The series knowledge base is **append-mostly**. Facts established in book 1 cannot be silently contradicted in book 2. If a retcon is needed, it must be narratively justified (unreliable narrator revealed, new information discovered by characters) and explicitly documented.
- Character voice guides carry across books. A character's voice in book 3 should be recognizably the same person as book 1, with natural evolution (trauma, growth, age) documented.
- The magic system can be *expanded* but not *contradicted*. New abilities must be compatible with established rules.
- The naming convention guide prevents naming collisions (two characters with similar names across books) and ensures consistent use of titles, honorifics, and place names.

## Craft Toolbox Selection

During the **Concept** and **Plotting** phases, the system must produce a **Story Craft Profile** (`story-craft-profile.md`) that lists:
- Which tools from the Craft Toolbox (see invariants.md Part 2) are selected for this story
- Why each tool was selected (one sentence)
- Any tools explicitly NOT selected and why (brief)
- Any per-tool adjustments for this story (e.g., "T1 Scene-Sequel: applied to action/plot scenes; relaxed for romantic interludes")

The adversarial auditors for all subsequent phases verify against the **selected** toolset, not the full toolbox. This ensures craft standards are applied with artistic judgment rather than mechanical rigidity.

## Output Artifacts

The system produces per-book and series-level artifacts, each decomposed into subcategory files.

### Per-Book Artifact Directories
1. **`concept/`** — premise, craft profile, constraints
2. **`world/`** — this book's worldbuilding additions (geography, magic, politics, culture, history, flora/fauna — mirroring series structure)
3. **`characters/`** — this book's character work + per-character arc plans and outcomes
4. **`outline/`** — structural framework, per-chapter outlines, tension map, subplot tracker
5. **`style/`** — prose style guide, tone palette, reference analysis
6. **`chapters/drafts/`** — draft chapters, one file per chapter
7. **`chapters/final/`** — polished final chapters
8. **`continuity/`** — running tracker, character knowledge matrix, reader promises
9. **`revision/`** — per-chapter findings by pass type (developmental, line-edit, copy-edit) + revision log
10. **`beta-feedback/`** — per-lens findings (romance, fantasy, craft, sensitivity, originality) + synthesis
11. **`killed-darlings.md`** — removed-but-saved passages, world details, plot elements
12. **`book-summary.md`** — post-completion: plot summary, arc outcomes, state changes for series knowledge base

### Series-Level Artifact Directories (accumulated across books)
13. **`series/world/`** — canonical worldbuilding (geography, magic, politics, culture, history, flora/fauna subdirectories)
14. **`series/characters/`** — all characters (leads, supporting, antagonists, voice guides, registry index, relationship map)
15. **`series/magic-system.md`** — high-level magic summary + links to `world/magic/` details
16. **`series/timeline.md`** — cross-book chronological events
17. **`series/unresolved-threads.md`** — planted Chekhov's guns not yet fired, tagged by origin book
18. **`series/naming-conventions.md`** — established names, places, terms, honorifics
19. **`series/style-guide.md`** — prose style continuity across books

## Quality Expectations

- **Prose quality**: Publication-ready romantic fantasy prose — lush but not purple, emotionally resonant, genre-appropriate
- **Character depth**: Leads must feel like real people with complex inner lives, not archetypes
- **Romance satisfaction**: The relationship arc must feel earned — genuine tension, genuine vulnerability, genuine payoff
- **Worldbuilding coherence**: Every magical, political, and cultural detail must be internally consistent
- **Pacing**: Chapters should flow naturally with varied tension, avoiding both the "sagging middle" and rushed endings
- **Voice distinctness**: Each POV character must have a recognizably different internal voice

## Advanced Craft Dimensions

These dimensions go beyond the basic pipeline phases. Each represents a cross-cutting craft discipline that professional fiction editors and writing coaches emphasize. The system should integrate these throughout the pipeline, not as standalone phases.

### Foreshadowing & Symbolism Architecture

The system must treat foreshadowing as a **deliberate engineering discipline**, not a happy accident discovered in revision:

- **Foreshadowing Ledger**: During plotting (Phase 4), create an explicit foreshadowing plan — every plant (setup) maps to a payoff, with the chapter numbers for each. Plants should be distributed naturally so they read as worldbuilding/character detail on first encounter but become unmistakable in hindsight.
- **Symbolic Motif Tracking**: Identify 3-5 recurring symbols or motifs tied to thematic pillars (e.g., "fire" for passion and destruction, "mirrors" for self-knowledge, "locked doors" for secrets). Track their appearance across chapters to ensure consistent density and escalation.
- **Imagery Callback System**: When a significant image appears early (a character's first glimpse of the love interest, a description of a place that matters later), the system should echo that imagery at the emotional climax — transformed by everything that's happened between. This creates "bookend" resonance.
- **Red Herrings**: For mystery/intrigue elements, deliberately plant 2-3 red herrings per major reveal. These must be fair (plausible enough to mislead) but distinguishable in hindsight from true plants.

### Multi-POV Craft Engineering

Romantic fantasy commonly uses dual POV (alternating between the two romantic leads). The system must handle this with precision:

- **POV Transition Protocol**: Every POV switch must be motivated — either by a cliffhanger/question in the departing POV that the new POV can answer or illuminate, or by a time/space jump that the narrative requires. No arbitrary switching.
- **Information Asymmetry Management**: Track what each POV character knows vs. what the reader knows. The most powerful romantic tension comes from dramatic irony — the reader knows both characters' feelings but neither character does. Map these asymmetries in the continuity tracker.
- **Voice Calibration Matrix**: For each POV character, define 8-10 measurable voice parameters: average sentence length, vocabulary register (formal/colloquial), metaphor type preference, emotional expression style (internal/external), humor frequency, observation focus (people/objects/abstract), paragraph length tendency, dialogue style (verbose/terse). These become the "voice fingerprint" verified in every beta read.
- **POV-Specific Worldbuilding**: The same location or event should read differently through different POV characters. A ballroom through the eyes of a political schemer reads differently than through the eyes of a socially anxious mage. The same magic system is experienced differently by a practitioner vs. a non-practitioner.

### Emotional Resonance Engineering

The system must engineer emotional impact rather than hoping it emerges:

- **Emotional Throughline Mapping**: For each of the two leads, chart their emotional state across every chapter — not just "happy/sad" but specific emotional textures (ashamed, yearning, defiant, tender, betrayed, exhilarated). Ensure variety, escalation, and that emotional shifts are motivated by scene events.
- **Micro-Tension Craft**: Every page should have at least one form of tension — not necessarily plot tension, but interpersonal friction, internal conflict, unanswered questions, sensory discomfort, anticipation, or dramatic irony. Tension-free pages are dead pages.
- **Vulnerability Engineering**: The most powerful romantic moments come from characters showing vulnerability — and that vulnerability being met with tenderness, not exploitation. Map 5-8 escalating vulnerability moments per lead across the story, each requiring more courage than the previous.
- **Emotional Contrast Pairing**: Pair emotionally intense scenes with contrasting recovery beats. After a devastating revelation → a moment of unexpected kindness. After a triumph → a quiet doubt. The contrast amplifies both emotions.
- **Sensory Anchoring**: Key emotional moments must be anchored in specific physical sensations — not generic "her heart raced" but character-specific, scene-specific physicality. Each lead's emotional responses should manifest through different sensory channels (one feels emotions in their hands, another in their chest, another as auditory distortion, etc.).

### Reader Experience Design

Think of the reader as a user — their experience must be designed, not left to chance:

- **Chapter Hook Engineering**: Every chapter opens with a hook that creates a micro-commitment to keep reading. Types: action hook (mid-scene start), question hook (something doesn't make sense), voice hook (irresistible narrative voice), image hook (striking visual), emotional hook (powerful feeling). Vary hook types across chapters.
- **Page-Turner Architecture**: Every chapter ends with a reason to turn the page — either an outright cliffhanger, an unanswered question, an emotional precipice, a promise of something the reader wants, or a tonal shift that creates anticipation. Map the chapter-ending technique per chapter during plotting.
- **Mystery Box Management**: At any given point, the reader should be tracking 3-5 unresolved questions. Too few = boring, too many = confusing. As questions are answered, new ones must open. Track the "active question count" across chapters.
- **Payoff Spacing**: Readers need periodic payoffs (answered questions, emotional resolutions, plot victories) to sustain engagement. No stretch of more than 3-4 chapters without at least one meaningful payoff. Large payoffs (act climaxes) should be preceded by 2-3 smaller ones that build momentum.
- **Re-readability Seeding**: Plant details that only make sense on re-read — a character's odd reaction explained by a later revelation, a throwaway dialogue line that's actually the theme in disguise, a description that gains new meaning with hindsight. These reward attentive readers and create word-of-mouth buzz.

### Dialogue Craft System

Dialogue is where most fiction either sings or dies. The system needs a dedicated craft approach:

- **Dialogue Function Tagging**: Every dialogue exchange must serve at least one of: advance plot, reveal character, build relationship, convey exposition (disguised), create conflict, provide comic relief, or increase tension. Tag each exchange during outlining.
- **Subtext Layering**: In charged scenes (romantic, political, confrontational), characters should rarely say what they mean directly. The gap between what's said and what's meant is where tension lives. Map the subtext for every significant conversation during outlining.
- **Speech Pattern Differentiation**: Beyond vocabulary and register, differentiate characters by: average exchange length, question-to-statement ratio, how they handle disagreement (deflect/confront/withdraw), pet phrases (used sparingly — max 3 per character, max 1 use per 5 chapters), and whether they control or yield in conversations.
- **Beat Action Integration**: Dialogue should be interleaved with character action beats — physical gestures, environmental interaction, involuntary reactions — that reveal what dialogue alone cannot. Avoid "talking heads" scenes where characters speak in a void.

### Thematic Architecture

Theme should be designed into the story's DNA, not sprinkled on:

- **Thematic Argument Structure**: Each thematic pillar (2-3 per story) is actually an argument — the story explores a question and arrives at an answer through character experience. Map: what's the question, what are the competing answers (embodied by different characters/factions), and how does the protagonist's journey resolve it?
- **Theme Echo in All Systems**: Theme should be visible in worldbuilding (the magic system metaphorically reflects the theme), in character design (each character embodies a different relationship to the theme), in plot structure (the central conflict is actually the thematic conflict made literal), and in prose style (imagery patterns reinforce the theme).
- **Thematic Escalation**: The thematic argument should escalate alongside the plot — Act 1 introduces the question, Act 2 tests easy answers and finds them wanting, Act 3 forces the hardest version of the question and demands a genuine answer.

## Non-Goals

- The system does NOT need to handle cover design, ISBN assignment, or publishing logistics
- The system does NOT need to market or promote the fiction
- The system does NOT generate illustrations or visual art (textual descriptions only)
- The system does NOT need to handle multiple simultaneous stories — one story at a time
