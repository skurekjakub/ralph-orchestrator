# Invariant Extractor — Output Report

## Summary

Extracted **81 invariants** from 3 sources across 4 classifications. All invariants assigned to affected subdomains with verification strategies.

## Sources Consulted

| Source | Type | Invariants Extracted |
|---|---|---|
| `invariants.md` Part 1 (Non-Negotiable) | Explicit | 38 (INV-001 – INV-038) |
| `invariants.md` Part 2 (Craft Toolbox) | Explicit/Conditional | 26 (INV-039 – INV-064) |
| `domain-brief.md` | Implicit | 17 (INV-065 – INV-081) |

## Classification Breakdown

| Classification | Count | Description |
|---|---|---|
| **behavioral** | 21 | What the system must/must not do (genre promise, consistency, agency, plagiarism, etc.) |
| **quality** | 33 | Output quality standards (voice distinctness, prose floor, pacing, dialogue, craft tools) |
| **structural** | 14 | How the system is organized (artifact layout, subcategories, series isolation, guide pattern) |
| **workflow** | 13 | Process ordering and handoff rules (sequential chapters, review gates, phase gates, traceability) |

## Confidence Breakdown

| Band | Count | Source Type |
|---|---|---|
| **High (≥0.9)** | 65 | Explicitly stated in invariants.md Part 1 (1.0) and Part 2 (0.9), plus INV-079 (0.95) |
| **Medium (0.7–0.89)** | 16 | Strongly implied by domain brief requirements (0.7–0.85) |
| **Low (<0.5)** | 0 | No speculative invariants — all have clear textual basis |

## Two-Tier Quality System

The invariants encode a **two-tier quality system**:

1. **Non-Negotiable Invariants (INV-001 – INV-038)**: Always enforced for every story. Violations are system failures.
2. **Craft Toolbox (INV-039 – INV-064)**: Proven techniques selected per-story during Concept/Plotting. Once selected in the Story Craft Profile, they become binding. Auditors verify against the *selected* toolset.

The meta-invariants governing this system:
- **INV-078**: At least 5–8 tools should be selected per story
- **INV-079**: Selected tools become binding; auditors enforce the selected toolset

## Full Invariant Table

### Part 1: Non-Negotiable Invariants (always enforced)

| ID | Classification | Conf. | Description | Affected Subdomains |
|---|---|---|---|---|
| INV-001 | behavioral | 1.0 | Genre Promise: Must be romantic fantasy, fantasy-primary, romance as emotional spine, HFN minimum | All |
| INV-002 | behavioral | 1.0 | Internal Consistency: All worldbuilding details consistent across all artifacts and chapters | SD-003,007,008,009,011,012,013 |
| INV-003 | quality | 1.0 | Character Voice Distinctness: Each POV character has recognizably distinct voice | SD-004,006,007,008,009 |
| INV-004 | quality | 1.0 | Earned Emotional Beats: Major beats preceded by sufficient buildup | SD-005,007,008,009 |
| INV-005 | quality | 1.0 | Show Don't Tell: Emotions conveyed through action/dialogue/sensation, not narrator declarations | SD-007,008,009 |
| INV-006 | behavioral | 1.0 | Chekhov's Gun: Every significant element must pay off or be tagged as series setup | SD-005,007,013,014 |
| INV-007 | quality | 1.0 | No Info-Dumping: Exposition woven into action/dialogue; one-paragraph limit | SD-007,008 |
| INV-008 | behavioral | 1.0 | Character Agency: Both leads make active choices driving the story | SD-004,005,007,009 |
| INV-009 | behavioral | 1.0 | No Deus Ex Machina: Only previously established capabilities may resolve conflict | SD-003,005,007,011 |
| INV-010 | workflow | 1.0 | Outline Before Draft: Chapter outline must exist before drafting | SD-005,007 |
| INV-011 | workflow | 1.0 | Continuity Tracking: Continuity document updated after every chapter | SD-007,013 |
| INV-012 | workflow | 1.0 | Sequential Chapter Production: Chapters produced in strict sequence | SD-007 |
| INV-013 | workflow | 1.0 | Multi-Pass Review: Every chapter gets dev review, line edit, consistency check, and beta read | SD-008,009 |
| INV-014 | workflow | 1.0 | Revision Traceability: Every revision cites its prompting finding | SD-008 |
| INV-015 | quality | 1.0 | Voice Consistency Verification: Cross-chapter voice comparison with measurable parameters | SD-006,008,009 |
| INV-016 | quality | 1.0 | Continuity Verification: Exhaustive cross-reference of every factual claim against tracker | SD-008,013 |
| INV-017 | quality | 1.0 | Prose Quality Floor: Max 2 clichés, 3 told emotions, 5 generic sentences per chapter | SD-007,008,009 |
| INV-018 | quality | 1.0 | No Anachronisms: No concepts/idioms outside world rules | SD-007,008 |
| INV-019 | quality | 1.0 | Dialogue Naturalism: Dialogue sounds like speech, not prose | SD-007,008 |
| INV-020 | quality | 1.0 | Pacing Variation: No 3+ consecutive same-tension chapters | SD-005,007,008 |
| INV-021 | behavioral | 1.0 | Romance Arc Pacing: Must progress through all stages without skipping | SD-005,007 |
| INV-022 | quality | 1.0 | Antagonist Motivation: Comprehensible motivations required | SD-004,007 |
| INV-023 | behavioral | 1.0 | No Plagiarism — Zero Tolerance: All content entirely original | All |
| INV-024 | behavioral | 1.0 | Transformative Influence Only: Style samples for abstract patterns, never content reproduction | SD-006,007 |
| INV-025 | workflow | 1.0 | Originality Self-Audit: Beta reading includes originality check with citations | SD-009 |
| INV-026 | structural | 1.0 | Parameterization: System accepts word count and other parameters as input | SD-001 |
| INV-027 | workflow | 1.0 | Adversarial Phase Gates: Every creative phase gets adversarial audit before completion | SD-002,003,004,005,006,007,011 |
| INV-028 | behavioral | 1.0 | Input Consumption: Style samples produce concrete style guide; ignoring inputs is failure | SD-006 |
| INV-029 | structural | 1.0 | Artifact Cross-References: Every artifact references upstream dependencies | All creative |
| INV-030 | behavioral | 1.0 | No Silent Failures: Agents surface problems explicitly, never produce silently broken output | All |
| INV-031 | behavioral | 1.0 | Scope Fidelity: Output matches concept-phase specifications; no unapproved scope drift | All |
| INV-032 | structural | 1.0 | Series Artifact Isolation & Subcategory Decomposition: Book-level dirs, series root KB, subcategory files | SD-010,012 |
| INV-033 | behavioral | 1.0 | Foreshadowing Resolution Completeness: 1:1 plant-to-payoff mapping, zero dangling plants | SD-005,007,013,014 |
| INV-034 | quality | 1.0 | POV Voice Distinctiveness: POV identifiable within 3-4 sentences without name tags | SD-004,006,007,009 |
| INV-035 | quality | 1.0 | Micro-Tension Continuity: No half-page stretch without at least one tension source | SD-007,008 |
| INV-036 | quality | 1.0 | Thematic Coherence: 2-3 themes visible in worldbuilding, character arcs, and plot structure | SD-002,003,004,005 |
| INV-037 | quality | 1.0 | Emotional State Variety: No repeated dominant emotion in consecutive chapters per character | SD-005,007,008 |
| INV-038 | quality | 1.0 | Dialogue Function Mandate: Every 3+ line exchange serves identifiable narrative function | SD-007,008 |

### Part 2: Craft Toolbox (binding when selected per-story)

| ID | Tool | Classification | Conf. | Description | Affected Subdomains |
|---|---|---|---|---|---|
| INV-039 | T1 | quality | 0.9 | Scene-Sequel Structure (Swain): Goal→Conflict→Disaster / Reaction→Dilemma→Decision | SD-005,007,011 |
| INV-040 | T2 | quality | 0.9 | Scene Value Shifts: Every scene shifts at least one value | SD-005,007,011 |
| INV-041 | T3 | quality | 0.9 | Five Commandments Per Scene: Inciting Incident → Turning Point → Crisis → Climax → Resolution | SD-005,007,011 |
| INV-042 | T4 | behavioral | 0.9 | Try-Fail Cycles: Min 2 failed approaches before success at major challenges | SD-005,007,011 |
| INV-043 | T5 | quality | 0.9 | Tone Contract: Opening chapters set tonal promise honored throughout | SD-002,007,011 |
| INV-044 | T6 | behavioral | 0.9 | Stakes Escalation: Stakes increase from Act 1 through Act 3 in both arcs | SD-005,007,011 |
| INV-045 | T7 | behavioral | 0.9 | The Black Moment: Devastating "all is lost" for romance and fantasy arcs | SD-005,007,011 |
| INV-046 | T8 | behavioral | 0.9 | Internal Romantic Resistance: ≥50% of romantic obstacles are internal/psychological | SD-004,005,011 |
| INV-047 | T9 | quality | 0.9 | Subtext in Dialogue: Characters rarely say what they mean in charged scenes | SD-007,008,011 |
| INV-048 | T10 | behavioral | 0.9 | Sanderson's First Law: Magic clarity proportional to use in conflict resolution | SD-003,005,011 |
| INV-049 | T11 | workflow | 0.9 | Kill Your Darlings: Revision actively hunts darlings, moves to killed-darlings file | SD-008,011 |
| INV-050 | T12 | structural | 0.9 | Dual-Arc Interleave: Fantasy and romance arcs in parallel, key beats reinforce each other | SD-005,011 |
| INV-051 | T13 | structural | 0.9 | Tension Mapping: Pacing chart showing tension rise-and-fall across all chapters | SD-005,011 |
| INV-052 | T14 | quality | 0.9 | Scene-Sequel MRU: Motivation→Reaction (Feeling→Reflex→Rational Action) at sentence level | SD-007,011 |
| INV-053 | T15 | structural | 0.9 | Foreshadowing Plant-Payoff Ledger: Explicit register with chapter-level plant/payoff mapping | SD-005,013,014 |
| INV-054 | T16 | quality | 0.9 | Symbolic Motif Weaving: 3-5 motifs tied to themes, tracked per chapter, escalating | SD-005,007,014 |
| INV-055 | T17 | quality | 0.9 | POV Voice Fingerprint Verification: Measurable voice parameters verified per POV section | SD-006,009,011 |
| INV-056 | T18 | structural | 0.9 | Information Asymmetry Mapping: Per-chapter character-vs-reader knowledge tracking | SD-005,013 |
| INV-057 | T19 | quality | 0.9 | Micro-Tension Audit: Flag every half-page with zero tension during revision | SD-008,011 |
| INV-058 | T20 | quality | 0.9 | Emotional Throughline Charting: Granular emotional state per lead per chapter | SD-005,007,011 |
| INV-059 | T21 | behavioral | 0.9 | Vulnerability Escalation Ladder: 5-8 escalating vulnerability moments per lead | SD-004,005,011 |
| INV-060 | T22 | quality | 0.9 | Chapter Hook-and-Close Catalogue: Varied hook/close types, no adjacent repetition | SD-005,007,011 |
| INV-061 | T23 | structural | 0.9 | Mystery Box Inventory: Maintain 3-5 active unresolved questions for the reader | SD-005,013 |
| INV-062 | T24 | quality | 0.9 | Dialogue Subtext Gap Analysis: Document said-vs-meant gap for key conversations | SD-005,007,011 |
| INV-063 | T25 | quality | 0.9 | Thematic Argument Scaffolding: Theme as argument — question, competing answers, resolution | SD-002,005,011 |
| INV-064 | T26 | quality | 0.9 | Sensory Signature Anchoring: Character-specific sensory channels for emotional expression | SD-004,007,011 |

### Part 3: Implicit Invariants (from domain brief)

| ID | Classification | Conf. | Description | Affected Subdomains |
|---|---|---|---|---|
| INV-065 | structural | 0.85 | Guide Agent as Sole User Interface: Only the guide agent interacts with users | SD-001 |
| INV-066 | structural | 0.85 | Series-Ready Architecture From Day One: Even standalone stories get series-ready layout | SD-010,012 |
| INV-067 | behavioral | 0.8 | Minimum Viable Input: Complete story from just a story idea; all else optional | SD-001,002 |
| INV-068 | structural | 0.8 | Five Independent Beta Reader Lenses: Romance, fantasy, craft, sensitivity, originality | SD-009 |
| INV-069 | workflow | 0.85 | Story Craft Profile Required: Must be produced during concept/plotting with rationale | SD-002,005 |
| INV-070 | behavioral | 0.8 | Series KB Append-Mostly: No silent contradictions; retcons require narrative justification | SD-012 |
| INV-071 | behavioral | 0.8 | Sequel Thread Disposition: Concept phase must decide fate of every unresolved thread | SD-002,012 |
| INV-072 | quality | 0.7 | POV Transition Motivation: Every POV switch must be motivated, not arbitrary | SD-005,007 |
| INV-073 | quality | 0.7 | Publication-Ready Prose: Output must meet publication-quality standard | SD-007,008,010 |
| INV-074 | structural | 0.8 | Independent Subcategory Loading: Each file self-contained for independent agent loading | SD-002–014 |
| INV-075 | structural | 0.8 | Relative Path Cross-References: Use file paths, never vague prose references | SD-002–014 |
| INV-076 | workflow | 0.8 | Severity-Gated Acceptance: Critical/major findings must be resolved before chapter acceptance | SD-008,009 |
| INV-077 | structural | 0.7 | One Story At A Time: No simultaneous story production | SD-001 |
| INV-078 | quality | 0.85 | Craft Toolbox Selection Minimum: 5-8 tools per story recommended | SD-002,005 |
| INV-079 | workflow | 0.95 | Selected Craft Tools Become Binding: Auditors enforce selected toolset | SD-002,005,011 |
| INV-080 | workflow | 0.8 | Story-Config Artifact Required: story-config.json written and confirmed before pipeline | SD-001 |
| INV-081 | workflow | 0.85 | Kill-Your-Darlings in Every Audit: Adversarial auditors must check for darlings | SD-011 |

## Invariants Flagged for Verification

**None.** All invariants have confidence ≥ 0.7. No speculative invariants were generated — every extracted invariant has clear textual support from the source documents.

## Notable Patterns

1. **Quality dominates** (33 of 81): The domain is heavily quality-focused, reflecting fiction's craft standards.
2. **Adversarial verification is pervasive**: INV-027 (phase gates), INV-079 (craft tool enforcement), INV-081 (kill-your-darlings) create a multi-layered audit system.
3. **Series architecture is structural**: INV-032, INV-066, INV-070, INV-071 form a cohesive series-production system.
4. **Originality is triple-guarded**: INV-023 (zero tolerance), INV-024 (transformative only), INV-025 (self-audit) — reflecting the critical importance of avoiding plagiarism.
5. **Craft toolbox creates flexible-but-enforced quality**: The two-tier system (always-on + selectable) balances artistic flexibility with quality standards.
