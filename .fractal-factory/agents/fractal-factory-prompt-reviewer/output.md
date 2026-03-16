# Prompt Review — Iteration 1

**Reviewer:** fractal-factory-prompt-reviewer  
**Date:** 2026-03-16  
**Domain:** romantic-fantasy-writer  
**Files Reviewed:** 67 / 67  
**Overall Verdict:** ❌ **REJECTED** — 47 agents need revision

---

## Executive Summary

The 20 routing agents (1 orchestrator + 9 coordinators + 10 sub-coordinators) are **well-implemented** with complete routing tables matching routing.json, proper purity rules, and correct result codes. These pass review.

However, **all 46 specialist agents and the guide** are **rejected** due to catastrophic boilerplate failure. Every specialist prompt contains identical generic text with zero domain-specific work instructions, placeholder invariants ("Unknown"), and no actionable guidance for the agent to perform its creative role.

### Verdicts by Level

| Level | Count | Approved | Rejected |
|-------|-------|----------|----------|
| orchestrator | 1 | 1 | 0 |
| coordinator | 9 | 9 | 0 |
| sub-coordinator | 10 | 10 | 0 |
| specialist | 46 | 0 | 46 |
| guide | 1 | 0 | 1 |
| **Total** | **67** | **20** | **47** |

### Finding Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 BLOCK | 5 systemic | Generic role descriptions, placeholder invariants, no work instructions, no audit criteria, no guide interaction protocol |
| ⚠ WARN | 2 systemic | Missing anti-laziness rules for auditors, thin content (<160 words per specialist) |
| ✅ INFO | 1 systemic | Missing ask_questions suppression (cosmetic) |

---

## Systemic Blocking Issues (All 46 Specialists)

### BLOCK-1: Generic Role Description

**Every specialist** has the identical role description:

> "Specialist agent for specific creative work."

This tells the agent absolutely nothing about its purpose. Examples of what should be there instead:
- **magic-system-designer**: "Design a comprehensive magic system for the story following Sanderson's Laws, defining rules, costs, limitations, and how magic intersects with the romantic relationship."
- **chapter-drafter**: "Draft a complete chapter of romantic fantasy prose, weaving together the scene beats from the outline, maintaining POV voice consistency, and advancing both the fantasy and romance arcs."
- **concept-auditor**: "Audit the story concept for genre compliance, thematic coherence, comp-title alignment, and craft profile completeness. Issue pass/fail verdict with specific remediation notes."

**Affected agents:** All 46 specialists  
**Location:** `## Role` section

### BLOCK-2: Placeholder Invariants

**Every specialist** contains:

```
**Key Invariants to Enforce:**
- Unknown
- Unknown
- Unknown
```

The domain-model.json contains **81 specific invariants** (INV-001 through INV-081) covering genre promises, character voice distinctness, show-don't-tell, Chekhov's gun, continuity tracking, pacing variation, and more. These MUST be mapped to the relevant specialists. For example:
- **chapter-drafter** should enforce INV-003 (Character Voice Distinctness), INV-005 (Show Don't Tell), INV-007 (No Info-Dumping), INV-010 (Outline Before Draft), INV-019 (Dialogue Naturalism), INV-020 (Pacing Variation)
- **magic-system-designer** should enforce INV-002 (Internal Consistency), INV-009 (No Deus Ex Machina)
- **concept-auditor** should enforce INV-001 (Genre Promise), INV-006 (Chekhov's Gun)

**Affected agents:** All 46 specialists  
**Location:** `## Work Instructions > Key Invariants to Enforce`

### BLOCK-3: No Actionable Work Instructions

**Every specialist** has the identical 4-bullet work instruction template:

```
1. Perform creative work specific to your role
2. Produce artifacts according to artifact assignments
3. Enforce relevant invariants from the domain model
4. Write status.json upon completion with appropriate result code
```

These instructions are completely vacuous. Each specialist needs a detailed **Process** section with numbered steps specific to its domain. For example, the **chapter-drafter** needs:
1. Read the chapter outline from `chapter-outlines/{N}.json` — extract scene goals, beats, POV character, conflict
2. Load the POV character's voice profile from `characters/{CHAR-NNN}.json`
3. Load the style guide from `style-guide.json` — apply prose calibration settings
4. Check `continuity-tracker.json` for current world state entering this chapter
5. Draft each scene beat, maintaining POV-specific voice, advancing the romance and fantasy arcs per `dual-arc-timeline.json`
6. After each scene, update `continuity-tracker.json` with any state changes
7. Write draft to `chapters/{N}/draft.md`
8. Write metadata to `chapters/{N}/metadata.json` including word count, scene count, POV character, arc advancement notes

**Affected agents:** All 46 specialists  
**Location:** `## Work Instructions`

### BLOCK-4: Auditors Have No Audit Criteria

The 8 auditor agents (concept-auditor, worldbuilding-auditor, character-auditor, plotting-auditor, style-auditor, drafting-auditor, revision-auditor, beta-reading-auditor) say "Specialist agent for specific creative work" — they don't even describe **auditing**. An auditor needs:
- A pass/fail checklist with specific criteria
- Gate conditions (what must be true to pass)
- What to write in the audit report on failure (remediation guidance)
- Which invariants constitute automatic failures
- Anti-laziness rules requiring cover-to-cover review

**Affected agents:** 8 auditor specialists  
**Location:** `## Role` and `## Work Instructions`

### BLOCK-5: Guide Has No Interaction Protocol

The guide (`romantic-fantasy-writer-guide.agent.md`) has:
- A one-sentence role description
- No process for gathering user input (what questions to ask)
- No validation rules for `story-config.json` fields
- No confirmation protocol before launching the pipeline
- No reference to INV-067 (minimum viable input) or INV-080 (user confirmation required)
- No result codes defined (roster has empty array, which is correct, but the guide still needs operational instructions)

**Affected agent:** romantic-fantasy-writer-guide  
**Location:** Entire file (90 words total)

---

## Systemic Warnings

### WARN-1: Missing Anti-Laziness Rules for Auditors

All 8 auditor agents should have `## Anti-Laziness Rules` with ≥4 specific rules preventing lazy/shallow auditing. None have this section.

**Affected agents:** 8 auditors

### WARN-2: Specialist Content Too Thin

Average specialist prompt is ~147 words. Expected minimum for a specialist with domain-specific work instructions is 400+ words. Most specialists are 143-160 words — barely enough for the boilerplate template itself.

---

## Per-Agent Review Results

### Approved Agents (20)

| Agent | Level | Structural | Content | Words | Routing Entries | Notes |
|-------|-------|-----------|---------|-------|-----------------|-------|
| romantic-fantasy-writer | orchestrator | 8/8 | 5/5 | 576 | 24/24 ✅ | Complete routing table, purity rule, all result codes |
| romantic-fantasy-writer-concept-coordinator | coordinator | 8/8 | 5/5 | 294 | 9/9 ✅ | Dispatch order matches, auditor retry loop correct |
| romantic-fantasy-writer-worldbuilding-coordinator | coordinator | 8/8 | 5/5 | 301 | 9/9 ✅ | Proper sub-coordinator dispatch |
| romantic-fantasy-writer-character-coordinator | coordinator | 8/8 | 5/5 | 300 | 9/9 ✅ | Proper sub-coordinator dispatch |
| romantic-fantasy-writer-plotting-coordinator | coordinator | 8/8 | 5/5 | 302 | 9/9 ✅ | Structural + chapter design dispatch correct |
| romantic-fantasy-writer-style-coordinator | coordinator | 8/8 | 5/5 | 295 | 9/9 ✅ | Analyzer → guide-writer → auditor chain correct |
| romantic-fantasy-writer-drafting-coordinator | coordinator | 8/8 | 5/5 | 373 | 10/10 ✅ | Per-chapter loop with auditor retry correct |
| romantic-fantasy-writer-revision-coordinator | coordinator | 8/8 | 5/5 | 399 | 14/14 ✅ | 5-child sequential dispatch, retry loop correct |
| romantic-fantasy-writer-beta-reading-coordinator | coordinator | 8/8 | 5/5 | 364 | 10/10 ✅ | Parallel lens dispatch, synthesizer chain correct |
| romantic-fantasy-writer-polish-coordinator | coordinator | 8/8 | 4/5 | 293 | 8/8 ✅ | Minor: only 2 result codes vs 3 in some others (correct per roster) |
| romantic-fantasy-writer-physical-world-coordinator | sub-coordinator | 8/8 | 4/5 | 247 | 7/7 ✅ | Sequential 3-specialist dispatch |
| romantic-fantasy-writer-systems-world-coordinator | sub-coordinator | 8/8 | 4/5 | 223 | 5/5 ✅ | 2-specialist dispatch |
| romantic-fantasy-writer-core-characters-coordinator | sub-coordinator | 8/8 | 4/5 | 225 | 5/5 ✅ | Protagonist + romance arc sequential |
| romantic-fantasy-writer-ensemble-coordinator | sub-coordinator | 8/8 | 4/5 | 223 | 5/5 ✅ | Supporting cast + voice designer sequential |
| romantic-fantasy-writer-structural-design-coordinator | sub-coordinator | 8/8 | 4/5 | 250 | 7/7 ✅ | 3-specialist plotting chain |
| romantic-fantasy-writer-chapter-design-coordinator | sub-coordinator | 8/8 | 4/5 | 225 | 5/5 ✅ | Outliner → scene-beat sequential |
| romantic-fantasy-writer-creative-writing-coordinator | sub-coordinator | 8/8 | 4/5 | 231 | 5/5 ✅ | Drafter → POV maintainer sequential |
| romantic-fantasy-writer-quality-integration-coordinator | sub-coordinator | 8/8 | 4/5 | 230 | 5/5 ✅ | Continuity + craft enforcement sequential |
| romantic-fantasy-writer-genre-lens-coordinator | sub-coordinator | 8/8 | 4/5 | 220 | 3/3 ✅ | Parallel romance + fantasy beta reader dispatch |
| romantic-fantasy-writer-craft-lens-coordinator | sub-coordinator | 8/8 | 4/5 | 230 | 3/3 ✅ | Parallel craft + sensitivity + originality dispatch |

### Rejected Agents (47)

#### Guide (1 agent)

| Agent | Blocking Findings |
|-------|-------------------|
| romantic-fantasy-writer-guide | BLOCK-5: No interaction protocol, no input validation process, no user confirmation flow, no reference to INV-067/INV-080. File is 90 words of skeleton. |

#### Auditor Specialists (8 agents)

| Agent | Blocking Findings |
|-------|-------------------|
| romantic-fantasy-writer-concept-auditor | BLOCK-1, BLOCK-2, BLOCK-3, BLOCK-4: Generic role, unknown invariants, no audit checklist/criteria, no pass/fail gate definition. Result codes (passed/failed/blocked) are present but no guidance on what triggers each. |
| romantic-fantasy-writer-worldbuilding-auditor | Same as above. Should audit internal consistency (INV-002), no info-dumping (INV-007), culture plausibility. |
| romantic-fantasy-writer-character-auditor | Same as above. Should audit character voice distinctness (INV-003), character agency (INV-008), relationship dynamics. |
| romantic-fantasy-writer-plotting-auditor | Same as above. Should audit Chekhov's gun (INV-006), pacing variation (INV-020), dual-arc alignment. |
| romantic-fantasy-writer-style-auditor | Same as above. Should audit prose quality floor (INV-017), voice consistency (INV-015), style guide compliance. |
| romantic-fantasy-writer-drafting-auditor | Same as above. Should audit outline compliance (INV-010), continuity (INV-011), sequential chapter (INV-012). |
| romantic-fantasy-writer-revision-auditor | Same as above. Should audit revision traceability (INV-014), multi-pass completeness (INV-013). |
| romantic-fantasy-writer-beta-reading-auditor | Same as above. Should audit synthesis quality, cross-lens agreement, chapter verdict accuracy. |

#### Non-Auditor Specialists (38 agents)

All 38 share the same systemic issues (BLOCK-1, BLOCK-2, BLOCK-3). Each is listed with what the prompt SHOULD contain:

| Agent | Phase | What's Missing |
|-------|-------|---------------|
| romantic-fantasy-writer-concept-developer | concept | Process for distilling story idea into concept with thematic pillars, premise, comp titles. Should reference INV-001. |
| romantic-fantasy-writer-craft-profile-selector | concept | How to select craft toolbox items, what the craft profile schema looks like, how to match story needs to tools. |
| romantic-fantasy-writer-geography-builder | worldbuilding | How to design geography/settings, map considerations, how setting intersects romance (meeting places, symbolic locations). |
| romantic-fantasy-writer-culture-builder | worldbuilding | Cultural norms, daily life, social hierarchies, how culture constrains/enables the romance. |
| romantic-fantasy-writer-history-builder | worldbuilding | Lore, historical events, prophecies, how history shapes current conflicts. |
| romantic-fantasy-writer-magic-system-designer | worldbuilding | Sanderson's Laws application, magic costs/limits, how magic intersects romance (INV-009). |
| romantic-fantasy-writer-political-structure-builder | worldbuilding | Political systems, power dynamics, how politics creates obstacles for romance. |
| romantic-fantasy-writer-protagonist-profiler | character | Detailed character profiling: backstory, wants/needs, flaws, arc, voice profile. INV-003, INV-008. |
| romantic-fantasy-writer-romance-arc-designer | character | Romance arc structure (meet-cute through HEA/HFN), chemistry beats, emotional milestones. INV-004. |
| romantic-fantasy-writer-supporting-cast-developer | character | Secondary characters, foils, mentor figures, antagonist development, relationship web. |
| romantic-fantasy-writer-character-voice-designer | character | Distinctive voice per character: vocabulary, rhythm, verbal tics, inner monologue style. INV-003. |
| romantic-fantasy-writer-dual-arc-builder | plotting | Interleaving fantasy and romance arcs, escalation patterns, convergence points. |
| romantic-fantasy-writer-structure-selector | plotting | Selecting story structure (3-act, hero's journey, romance beats), chapter count estimation. INV-026. |
| romantic-fantasy-writer-tension-mapper | plotting | Tension curve design, scene-level tension tracking, cliffhanger placement. INV-020. |
| romantic-fantasy-writer-chapter-outliner | plotting | Chapter-level outline with POV, scene goals, beats, conflict, arc advancement. INV-010. |
| romantic-fantasy-writer-scene-beat-designer | plotting | Granular scene beats within chapters: action, reaction, sequel pattern, emotional arcs. |
| romantic-fantasy-writer-style-analyzer | style | Analyze style samples (if provided), define prose calibration parameters. INV-028. |
| romantic-fantasy-writer-style-guide-writer | style | Write comprehensive style guide: tone, vocabulary level, sentence rhythm, POV rules. |
| romantic-fantasy-writer-chapter-drafter | drafting | Full chapter drafting with voice, continuity, beat adherence. INV-003,5,7,10,11,12,19,20. |
| romantic-fantasy-writer-pov-voice-maintainer | drafting | Post-draft voice consistency pass, voice drift correction, dialogue naturalism. INV-003, INV-019. |
| romantic-fantasy-writer-continuity-integrator | drafting | Post-draft continuity update: character locations, timeline, world-state changes. INV-011. |
| romantic-fantasy-writer-craft-enforcer | drafting | Apply craft profile rules: foreshadowing placement, symbolic motif tracking. INV-006. |
| romantic-fantasy-writer-developmental-editor | revision | Structural edit: arc pacing, scene necessity, character development gaps. |
| romantic-fantasy-writer-line-editor | revision | Line-level prose improvement: rhythm, clarity, show-don't-tell. INV-005, INV-017. |
| romantic-fantasy-writer-copy-editor | revision | Grammar, consistency, anachronism detection. INV-018. |
| romantic-fantasy-writer-chapter-reviser | revision | Integrate all edit notes into revised chapter. INV-014. |
| romantic-fantasy-writer-romance-beta-reader | beta-reading | Romance lens: chemistry believability, emotional beat strength, HEA satisfaction. INV-004. |
| romantic-fantasy-writer-fantasy-beta-reader | beta-reading | Fantasy lens: magic system consistency, worldbuilding immersion, plot logic. INV-002, INV-009. |
| romantic-fantasy-writer-craft-beta-reader | beta-reading | Craft lens: prose quality, pacing, voice, show-don't-tell compliance. INV-005, INV-017. |
| romantic-fantasy-writer-sensitivity-beta-reader | beta-reading | Sensitivity lens: representation, harmful tropes, consent dynamics, power balance. |
| romantic-fantasy-writer-originality-beta-reader | beta-reading | Originality lens: cliché detection, trope freshness, unique world elements. INV-017. |
| romantic-fantasy-writer-beta-synthesizer | beta-reading | Synthesize all beta-reader feedback into unified chapter verdict + prioritized revision notes. |
| romantic-fantasy-writer-polisher | polish | Final prose polish: rhythm, word choice, opening/closing hooks. |
| romantic-fantasy-writer-summary-generator | polish | Chapter summaries for series KB and reader reference. |
| romantic-fantasy-writer-delivery-assembler | polish | Assemble final manuscript package: all chapters, metadata, delivery report. |
| romantic-fantasy-writer-series-kb-manager | cross-cutting | Extract and store series-level knowledge for sequel continuity. |
| romantic-fantasy-writer-continuity-tracker | cross-cutting | Full-manuscript continuity verification pass. INV-011, INV-016. |
| romantic-fantasy-writer-craft-tracker | cross-cutting | Track foreshadowing, mystery boxes, emotional throughlines, symbolic motifs. INV-006. |

---

## Routing Table Verification (All 20 Routing Agents)

All 20 routing agents have routing tables that match routing.json:

| Agent | routing.json Entries | Prompt Entries | Match | Dispatch Order | Children Match |
|-------|---------------------|---------------|-------|----------------|----------------|
| romantic-fantasy-writer | 24 | 24 | ✅ | 12 agents | ✅ |
| concept-coordinator | 9 | 9 | ✅ | 3 agents | ✅ |
| worldbuilding-coordinator | 9 | 9 | ✅ | 3 agents | ✅ |
| character-coordinator | 9 | 9 | ✅ | 3 agents | ✅ |
| plotting-coordinator | 9 | 9 | ✅ | 3 agents | ✅ |
| style-coordinator | 9 | 9 | ✅ | 3 agents | ✅ |
| drafting-coordinator | 10 | 10 | ✅ | 3 agents | ✅ |
| revision-coordinator | 14 | 14 | ✅ | 5 agents | ✅ |
| beta-reading-coordinator | 10 | 10 | ✅ | 4 agents | ✅ |
| polish-coordinator | 8 | 8 | ✅ | 3 agents | ✅ |
| physical-world-coordinator | 7 | 7 | ✅ | 3 agents | ✅ |
| systems-world-coordinator | 5 | 5 | ✅ | 2 agents | ✅ |
| core-characters-coordinator | 5 | 5 | ✅ | 2 agents | ✅ |
| ensemble-coordinator | 5 | 5 | ✅ | 2 agents | ✅ |
| structural-design-coordinator | 7 | 7 | ✅ | 3 agents | ✅ |
| chapter-design-coordinator | 5 | 5 | ✅ | 2 agents | ✅ |
| creative-writing-coordinator | 5 | 5 | ✅ | 2 agents | ✅ |
| quality-integration-coordinator | 5 | 5 | ✅ | 2 agents | ✅ |
| genre-lens-coordinator | 3 | 3 | ✅ | 2 agents | ✅ |
| craft-lens-coordinator | 3 | 3 | ✅ | 3 agents | ✅ |

**No routing table mismatches found.** No fabricated entries. No missing entries.

---

## Result Code Verification

All agents have result codes matching roster.json:
- Orchestrator: delivered, delivered-with-gaps, failed ✅
- Coordinators: complete, blocked, revision-loop ✅
- Sub-coordinators: complete, blocked ✅
- Auditor specialists: passed, failed, blocked ✅
- Non-auditor specialists: completed, blocked ✅

---

## Artifact Assignment Verification

All agents have artifact read/write assignments matching roster.json. The artifact paths are correctly listed in the `## Artifact Assignments` section of each prompt. No missing artifacts, no fabricated artifacts.

---

## Feedback for Prompt-Writer (What To Fix)

### Priority 1: Specialist Work Instructions (46 agents)

For each specialist, replace the generic 4-bullet template with a **domain-specific Process section** containing:
1. **Specific numbered steps** describing what this agent actually does
2. **Artifact field-level instructions** — what fields to populate in the output JSON, referencing architecture.json schemas
3. **Relevant invariants by ID** from domain-model.json (INV-001 through INV-081), with the invariant text quoted
4. **Domain-specific quality criteria** — what makes this agent's output good vs. bad
5. **Input interpretation guidance** — how to read and use each input artifact
6. **Examples or templates** where appropriate (e.g., what a good romance arc design looks like)

### Priority 2: Auditor Specialization (8 agents)

For each auditor, add:
1. **Pass/fail gate checklist** — specific criteria that must all be met to pass
2. **Invariant enforcement** — which INV-xxx invariants this auditor specifically checks
3. **Audit report format** — what to write in the gate.json on pass vs. fail
4. **Remediation guidance format** — what to tell the upstream specialist to fix on failure
5. **Anti-laziness rules** (≥4 rules) preventing shallow/skipped checks

### Priority 3: Guide Interaction Protocol (1 agent)

For the guide, add:
1. **User interaction flow** — what questions to ask, in what order
2. **Input validation rules** — required vs. optional fields, minimum viable input (INV-067)
3. **Confirmation protocol** — must get user confirmation before launch (INV-080)
4. **story-config.json schema** — field-by-field population instructions referencing architecture.json
5. **Error handling** — what to do if user input is insufficient

---

## Statistics

- **Total agents reviewed:** 67
- **Approved:** 20 (29.9%)
- **Rejected:** 47 (70.1%)
- **Blocking findings:** 5 systemic patterns affecting 47 agents
- **Routing table accuracy:** 100% (161/161 entries verified across 20 routing agents)
- **Result code accuracy:** 100% (all agents match roster.json)
- **Artifact assignment accuracy:** 100% (all agents match roster.json)
- **Content quality (specialists):** 0% — all 46 are generic boilerplate
- **Content quality (routing agents):** 100% — all 20 are properly domain-specific
