# Fantasy Fiction Writer — Invariants & Craft Toolbox

This document has two sections:

1. **Invariants** — Non-negotiable rules that MUST hold for every story, every chapter, every scene. Violations are system failures.
2. **Craft Toolbox** — Proven storytelling techniques the system should draw from. During Concept and Plotting, the system selects which tools fit the story being told. Once selected for a story, a tool becomes binding for that story — but not every tool applies to every story or every scene. The adversarial auditors verify against the **selected** toolset, not the entire toolbox.

---

# Part 1: Invariants

These are absolute. They apply to every story the system produces, always.

## Narrative Invariants

### I1: Genre Promise
Every story produced MUST be romantic fantasy — the fantasy plot arc is primary, the romance arc is the emotional spine. Neither arc may be absent. The romance must reach at minimum a "happy for now" (HFN) resolution.

### I2: Internal Consistency
All worldbuilding details (magic rules, geography, political structures, cultural norms, character knowledge) MUST remain internally consistent across every artifact and every chapter. A contradiction between chapter 3 and chapter 12 is a system failure. For sequels, consistency extends across books — the series knowledge base is canonical.

### I3: Character Voice Distinctness
Each POV character MUST have a recognizably distinct internal voice — vocabulary, sentence rhythm, emotional register, and thought patterns. If passages from two different POV characters are indistinguishable when stripped of character names, this is a failure.

### I4: Earned Emotional Beats
Every major emotional beat (first kiss, betrayal, sacrifice, reconciliation) MUST be preceded by sufficient buildup. No emotional payoff without prior investment. The beta reader simulation must flag unearned beats.

### I5: Show Don't Tell (for emotions)
Character emotions MUST be conveyed primarily through action, dialogue, physical sensation, and internal reaction — not through narrator declarations like "she was sad." Telling is acceptable only for background summary or time-skips, never for key emotional moments.

### I6: Chekhov's Gun
Every significant element introduced (magical artifact, character secret, prophecy, weapon, relationship tension) MUST either pay off or be explicitly acknowledged as unresolved (for series setup). Dangling threads without purpose are failures. For series: threads explicitly tagged as "series setup" in the continuity tracker are exempt from single-book payoff requirements but MUST be tracked for future resolution.

### I7: No Info-Dumping
Worldbuilding exposition MUST be woven into action, dialogue, and character experience. No paragraphs of raw encyclopedic information. The "one page rule" — no more than one paragraph of pure exposition before returning to scene.

### I8: Character Agency
Both romantic leads MUST have agency — they make active choices that drive the story forward. Neither lead may be a passive recipient of the plot, rescued repeatedly without contributing, or reduced to reacting to events without initiating anything.

### I9: No Deus Ex Machina
If a magic rule or ability has not been established before the moment it's needed, it MUST NOT be used to resolve conflict. Every resolution must use only previously demonstrated capabilities or character qualities. New abilities introduced solely to solve an immediate problem are a critical failure. This applies to non-magical resolutions too — no cavalry-from-nowhere without prior setup.

## Structural Invariants

### I10: Outline Before Draft
No chapter may be drafted until a chapter-level outline exists. The outline must specify POV, scene goal, conflict, emotional arc, and which romance/fantasy beats the chapter hits.

### I11: Continuity Tracking
A continuity document MUST be updated after every chapter draft. It tracks: character locations, timeline, what each character knows, promises made to the reader, and open plot threads. For sequels, this extends the series-level continuity tracker.

### I12: Sequential Chapter Production
Chapters MUST be produced in sequence. Chapter N+1 cannot be drafted until chapter N is complete and its continuity implications are recorded.

### I13: Multi-Pass Review (Exhaustive)
Every chapter MUST go through at minimum: developmental review, line edit, consistency check, AND multi-perspective beta read. No chapter reaches "final" status without passing all review passes. All critical and major findings must be resolved before the chapter is accepted.

### I14: Revision Traceability
Every revision must cite what feedback or finding prompted it. No changes without justification. The revision history must be auditable.

### I14a: Voice Consistency Verification
At the verification phase, every POV character's chapters must be compared against each other to ensure voice consistency. A dedicated voice-consistency check must compare vocabulary, sentence patterns, emotional register, and thought patterns across all chapters for the same POV character. Drift must be flagged and corrected. For sequels, voice must also be compared against the character's prior-book voice guide.

### I14b: Continuity Verification (Exhaustive)
The verification phase must cross-reference EVERY factual claim in the manuscript against the continuity tracker: character locations, timeline, what each character knows, physical descriptions, names, titles, world rules, magic system behavior, political status. For sequels, verification extends to the series knowledge base. Every discrepancy is a finding that must be resolved.

### I14c: Prose Quality Floor
No chapter passes verification if it contains: more than 2 instances of cliché fantasy prose (e.g., "orbs" for eyes, "let out a breath they didn't know they were holding"), more than 3 told-not-shown emotions in key scenes, more than 5 bland/generic sentences that could appear in any story. The prose quality auditor must flag these specifically.

## Quality Invariants

### I15: No Anachronisms (within world rules)
Characters must not reference concepts, technologies, or idioms that don't exist in their world unless the worldbuilding explicitly includes them. Modern slang in a medieval fantasy court is a failure.

### I16: Dialogue Naturalism
Dialogue must sound like speech, not prose. Characters should interrupt, trail off, use contractions, disagree, and talk past each other. Perfectly articulate philosophical monologues from every character is a failure.

### I17: Pacing Variation
The story must alternate between high-tension and low-tension scenes. Three consecutive high-action chapters without a recovery scene, or three consecutive slow chapters without rising tension, constitutes a pacing failure.

### I18: Romance Arc Pacing
The romance must escalate through recognizable stages: awareness → attraction → tension → vulnerability → setback → deepening → commitment. Skipping stages (e.g., strangers to "I love you" in two chapters) is a failure.

### I19: Antagonist Motivation
The antagonist (whether a person, system, or force) MUST have comprehensible motivations. "Evil for evil's sake" is only acceptable if the story explicitly explores why (corruption, trauma, ideology). Cardboard villains are failures.

## Originality Invariants

### I20: No Plagiarism — Zero Tolerance
All prose, dialogue, character names, place names, magic system mechanics, and plot structures MUST be entirely original. Nothing produced may be directly quotable from or closely paraphraseable of any existing published work. Reference stories and style samples are provided ONLY for stylistic analysis (sentence rhythm, vocabulary register, metaphor density, pacing patterns) — never for content reproduction. If a passage could reasonably be attributed to an existing work by a reader or plagiarism detector, that is a critical system failure.

### I21: Transformative Influence Only
When style samples are provided, the system must extract abstract stylistic patterns (e.g., "average sentence length 14 words, high metaphor density using natural imagery, close third-person POV, frequent paragraph breaks") and apply those patterns to wholly original content. The system must NEVER reproduce specific metaphors, turns of phrase, character archetypes with identifying details, plot beats in the same sequence, or distinctive world elements from the reference material. Influence must be structural and tonal, never substantive.

### I22: Originality Self-Audit
The beta reading phase MUST include an originality check that specifically flags any passage, character, plot element, or world detail that too closely resembles a known published work. This check must cite what the concerning similarity is and what work it resembles, so it can be revised.

## Process Invariants

### Parameterization

The created agent must have input fields that allow the specify rough book word count. For example 100k words in addition to other optional parameters as specified in the domain brief.

### I23: Adversarial Phase Gates
Every creative phase (Concept, Worldbuilding, Character, Plotting, Style, Drafting) MUST include an adversarial consistency audit BEFORE the phase is considered complete. The auditor actively tries to break the phase's output — finding contradictions, logic gaps, consistency failures, and weak spots. The auditor cross-references against ALL prior phase artifacts, not just the current phase's output. Critical findings block phase completion. This is non-negotiable — no phase may skip its consistency gate.

### I24: Input Consumption
When reference stories or style samples are provided as input, the style analysis agent MUST produce a concrete style guide derived from those inputs. The style guide must cite specific abstract patterns observed (sentence structure, vocabulary register, pacing rhythm) — never specific content. Ignoring provided inputs is a failure.

### I25: Artifact Cross-References
Every artifact must reference its upstream dependencies. The outline references the character bible and world bible. The draft references the outline. The revision notes reference the draft and the style guide. Orphan artifacts are failures.

### I26: No Silent Failures
If an agent cannot complete its task (e.g., cannot maintain consistency, cannot find a satisfying plot resolution), it MUST surface the problem explicitly rather than producing low-quality output. A clearly flagged "I couldn't resolve X" is better than a silently broken story.

### I27: Scope Fidelity
The system must produce what was specified in the concept phase. If the concept says "standalone novel, 20 chapters, enemies-to-lovers, dark tone," the output must match. Scope drift (changing the story's fundamental nature during drafting) without explicit re-approval is a failure.

### I28: Series Artifact Isolation & Subcategory Decomposition
Every book's artifacts MUST be organized under a book-level directory (`book-1/`, `book-2/`, etc.). The series knowledge base lives at the series root and is the single source of cross-book truth. Per-book artifacts may reference the series knowledge base but MUST NOT directly reference another book's internal artifacts. Within each artifact type (world, characters, outline, revision, beta-feedback, etc.), content MUST be decomposed into subcategory files within typed directories — not stored as monolithic files. An agent loading magic rules should not need to ingest geography; an agent checking a single character's arc should not need to load every character. Cross-references between subcategories use relative file paths, never vague prose references.

### I29: Foreshadowing Resolution Completeness
Every foreshadowing plant MUST resolve by the story's end. Dangling plants — details that were set up to mean something but never paid off — are failures. The foreshadowing ledger must show a 1:1 plant-to-payoff mapping with zero unresolved entries at final delivery. Red herrings are an exception ONLY when they are explicitly tagged as intentional red herrings in the ledger and serve a narrative purpose (misdirection for a twist).

### I30: POV Voice Distinctiveness
In multi-POV stories, each POV character MUST have a recognizably distinct narrative voice. A beta reader should be able to identify the POV character within the first 3-4 sentences of any section without being told explicitly. If a POV section could plausibly belong to a different character with only name changes, that is a failure.

### I31: Micro-Tension Continuity
No prose passage longer than half a page may exist without at least one active source of tension — plot, interpersonal, internal, environmental, anticipatory, or dramatic irony. Tension-free stretches are dead pages. The revision phase MUST audit for and flag tension voids.

### I32: Thematic Coherence
Every story must have 2-3 explicitly identified thematic pillars. These themes must be visible in worldbuilding design (magic system as metaphor), character arc design (each lead embodies a different relationship to the theme), and plot structure (the central conflict literalizes the thematic argument). A story with no discernible theme, or with themes that contradict each other accidentally, is a structural failure.

### I33: Emotional State Variety
No major character may occupy the same dominant emotional state in two consecutive chapters. Emotional throughlines must show variety and escalation. If a character is "anxious" in Chapter 5, they cannot be "anxious" as the dominant emotion in Chapter 6 — they must have shifted (to dread, to reckless defiance, to forced calm, etc.). Stagnant emotional states signal stagnant character development.

### I34: Dialogue Function Mandate
Every dialogue exchange of 3+ lines MUST serve at least one identifiable narrative function: advance plot, reveal character, build/strain a relationship, create conflict, convey disguised exposition, or shift the scene's emotional register. Dialogue that exists purely as filler or that could be removed without any loss is a failure.

---

# Part 2: Craft Toolbox

These are storytelling techniques the system draws from. During **Concept** and **Plotting**, the system evaluates which tools fit *this particular story* and records the selection in a **Story Craft Profile** artifact. A tool, once selected for a story, is binding — the adversarial auditors verify against the selected toolset. But not every tool applies to every story, and not every tool applies to every scene.

The system SHOULD select at least 5–8 tools per story. A story using fewer than 5 is likely undercooked; using all of them rigidly is likely overengineered.

## Scene-Level Craft Tools

### T1: Scene-Sequel Structure (Swain)
Scenes follow Dwight Swain's pattern: **Scene** = Goal → Conflict → Disaster; **Sequel** = Reaction → Dilemma → Decision. The alternating rhythm creates compulsive readability. Best for: action-driven narratives, fast pacing, plot-heavy fantasy arcs. May be loosened for: introspective literary passages, lyrical slow-burn romance scenes, atmospheric mood pieces.

### T2: Scene Value Shifts (Story Grid)
Every scene shifts at least one value from beginning to end — emotional, relational, informational, or situational. A scene where nothing has changed is a dead scene. Best for: ensuring every scene earns its place. Applicable to nearly all stories — this one is close to an invariant, but some transitional/bridging scenes may legitimately hold a value steady while serving a pacing function.

### T3: Five Commandments Per Scene (Story Grid)
Every scene contains: (1) Inciting Incident, (2) Turning Point Progressive Complication, (3) Crisis, (4) Climax, (5) Resolution. Best for: tightly plotted stories where every scene must drive the narrative. May be loosened for: quiet character moments, atmospheric interludes, epistolary chapters.

### T4: Try-Fail Cycles
Characters fail before they succeed at significant challenges. Major problems require at minimum two failed approaches before a solution works. Each failure teaches something. Best for: quest narratives, underdog stories, magic-learning arcs. May be loosened for: stories where competence is the premise (e.g., master assassin), or romantic-tension scenes where "failure" takes a different form than action/plot failure.

## Story-Level Craft Tools

### T5: Tone Contract
The opening chapters establish a tonal promise the story must honor throughout. Tonal shifts must be gradual, motivated, and consistent with the story's identity. Best for: stories with a strong atmospheric identity (gothic, whimsical, grimdark). Essentially always applicable — but the strictness varies (a tonal experiment or an epic that intentionally shifts mood across arcs may loosen this).

### T6: Stakes Escalation
Stakes escalate through each act — what characters risk in Act 3 is greater than Act 1, both in the fantasy arc and the romance arc. Best for: epic fantasy, quest narratives, political intrigue. May be loosened for: slice-of-life fantasy, cozy fantasy, or stories where the stakes are intimate and personal throughout.

### T7: The Black Moment
A devastating "all is lost" point where the romance seems doomed and the fantasy plot appears lost. Must feel genuinely threatening. Best for: all romance-forward stories — this is a genre convention. May be adjusted for: stories with multiple romantic pairs (each pair gets a scaled black moment), or cozy fantasy where the "black moment" is gentler but still present.

### T8: Internal Romantic Resistance
Obstacles between the leads include internal resistance — fear, psychological wounds, conflicting beliefs, trust issues — not just external circumstances. At least half of major romantic obstacles should be internal/psychological. Best for: all character-driven romance. May be loosened for: stories where the external situation genuinely IS the primary obstacle and the internal journey is about something other than romantic resistance.

### T9: Subtext in Dialogue
Characters rarely say exactly what they mean, especially in charged scenes. Dialogue carries subtext — what's unsaid matters as much as what's spoken. Exception: climactic revelations where directness IS the payoff. Best for: political intrigue, slow-burn romance, morally grey characters. May be loosened for: characters whose bluntness is a defining trait, or cultures where directness is the norm.

### T10: Sanderson's First Law (Magic Clarity)
An author's ability to solve conflict with magic is directly proportional to how well the reader understands said magic. Hard magic systems need clear rules; soft magic systems shouldn't solve problems. Best for: stories with hard magic systems, magic-school settings, stories where magic is central to plot resolution. Less relevant for: stories with deliberately mysterious/soft magic where solutions come from character choices rather than magical cleverness.

### T11: Kill Your Darlings
Every revision pass actively hunts for "darlings" — passages, details, or elements that are beautiful or clever but don't serve the story. These get moved to a "killed darlings" file, not deleted. Best for: all stories (this is close to a universal tool), but especially relevant for: lush/literary prose styles where overwriting is a risk, worldbuilding-heavy stories where detail can spiral.

## Structural Craft Tools

### T12: Dual-Arc Interleave
The fantasy plot arc and romance arc are plotted in parallel with key beats from each reinforcing or complicating the other. A fantasy crisis must also be a romantic inflection point (or vice versa). Best for: all romantic fantasy (nearly always selected), but the tightness of interleave varies — some stories keep the arcs more independent, letting them intersect at key moments rather than every chapter.

### T13: Tension Mapping
A visual/textual pacing chart showing tension rise-and-fall across all chapters. Used during plotting to ensure proper rhythm and avoid flat stretches. Best for: longer works (15+ chapters), multi-POV stories. Less critical for: novellas, single-POV stories with naturally tight pacing.

### T14: Scene-Sequel MRU (Motivation-Reaction Units)
At the sentence/paragraph level within scenes: external stimulus (Motivation) is followed by character response (Reaction) in the order Feeling → Reflex → Rational Action. Best for: action sequences, fight scenes, high-tension moments. May be loosened for: introspective passages, slow-paced romance, poetic prose.

## Advanced Craft Tools

### T15: Foreshadowing Plant-Payoff Ledger
Maintain an explicit register mapping every foreshadowing plant to its payoff — chapter planted, chapter resolved, perceived purpose on first read, actual purpose on reveal. Every plant must resolve; every major payoff must have at least one plant. Best for: mystery-laced fantasy, political intrigue, prophecy-driven narratives. May be loosened for: character-driven stories with minimal plot twists, though the ledger still helps track thematic echoes.

### T16: Symbolic Motif Weaving
Assign 3-5 recurring symbols/motifs to thematic pillars (e.g., "fire" = passion/destruction, "mirrors" = self-knowledge). Track appearances per chapter to ensure consistent density without overuse. Motifs should escalate or transform alongside the themes they represent — the same symbol means something different in Act 3 than Act 1. Best for: literary fantasy, thematic stories. May be loosened for: pure action-adventure fantasy where thematic depth isn't the primary draw.

### T17: POV Voice Fingerprint Verification
For each POV character, define measurable voice parameters: sentence length distribution, vocabulary register, metaphor preference, emotional expression style, humor frequency, observation focus. Verify these fingerprints in every POV section during review. A reader should be able to identify the POV character within 3-4 sentences without being told. Best for: all multi-POV stories — nearly always selected for romantic fantasy's standard dual-POV. Less critical for: single-POV stories.

### T18: Information Asymmetry Mapping
Track what each character knows vs. what the reader knows vs. what other characters know. Map these gaps per chapter. The most powerful emotional moments in romantic fantasy come from dramatic irony — the reader knows both leads' feelings before either lead does. Manage reveals so that information asymmetries create tension, not confusion. Best for: dual-POV romantic fantasy, political intrigue, stories with secrets. Less relevant for: single-POV with no secrets.

### T19: Micro-Tension Audit
Every page must sustain at least one form of tension — not necessarily plot tension, but interpersonal friction, internal conflict, unanswered questions, sensory unease, anticipation, or dramatic irony. During revision, flag any half-page stretch with zero tension source and inject at least one. Best for: all stories, but especially important for: slow-burn romance where overt conflict is sparse, quiet fantasy, travel sequences.

### T20: Emotional Throughline Charting
Chart each lead's specific emotional state (not just "happy/sad" — use granular labels: ashamed, yearning, defiant, tender, betrayed, exhilarated) per chapter. Verify variety (no emotion repeats in adjacent chapters for the same character), escalation (emotional intensity generally increases toward climax), and motivation (every emotional shift is caused by a scene event). Best for: all character-driven fiction.

### T21: Vulnerability Escalation Ladder
Map 5-8 escalating vulnerability moments per lead across the story. Each successive vulnerability requires more courage than the previous — early: admitting a preference; middle: revealing a fear; late: exposing a wound; climax: fully trusting another with their deepest self. Vulnerability met with tenderness deepens the bond; vulnerability exploited creates devastating reversals. Best for: all romance, trauma-recovery narratives. May be loosened for: action-heavy fantasy where the romantic thread is lighter.

### T22: Chapter Hook-and-Close Catalogue
During outlining, assign each chapter an opening hook type (action, question, voice, image, emotional) and a closing technique (cliffhanger, unanswered question, emotional precipice, promise, tonal shift). Ensure variety across consecutive chapters — no two adjacent chapters should use the same hook or close type. Best for: all serialized fiction, especially chapter-a-day web fiction or any story where reader retention per chapter matters.

### T23: Mystery Box Inventory
Track the count of active unresolved questions the reader is holding at any point. Maintain a target range (typically 3-5 active questions). When a question is answered, open a new one within 1-2 chapters. Too few active questions → boredom; too many → cognitive overload and disengagement. Best for: mystery-laced fantasy, political fantasy, any plot-driven story. Less critical for: character studies, slice-of-life.

### T24: Dialogue Subtext Gap Analysis
For every significant conversation (romantic, confrontational, political), document the gap between what each character says and what they mean. The wider the gap, the more tension the scene carries. Climactic moments often work because the gap finally closes — a character says exactly what they mean for the first time. Best for: slow-burn romance, political intrigue, stories with guarded characters.

### T25: Thematic Argument Scaffolding
Structure each theme (2-3 per story) as an argument: a question, competing answers (embodied by characters/factions), and a resolution earned through the protagonist's experience. Act 1 introduces the question, Act 2 tests easy answers, Act 3 forces the hardest version. Theme should echo in worldbuilding (magic system as metaphor), character design, plot structure, and prose imagery. Best for: literary fantasy, stories with something to say. May be loosened for: pure entertainment-first adventure fantasy.

### T26: Sensory Signature Anchoring
Assign each major character a dominant sensory channel for emotional expression — one feels emotions in their hands (clenching, trembling, reaching), another as chest tightness/expansion, another as auditory distortion (sounds becoming too loud or muffled). Key emotional moments must be anchored in these character-specific physical responses rather than generic descriptions ("heart raced"). Best for: immersive prose, all character-driven fiction.
