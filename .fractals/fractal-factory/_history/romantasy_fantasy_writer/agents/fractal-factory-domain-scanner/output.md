# Domain Scanner — Output Report

**Domain**: fantasy-writer
**Scan Date**: 2026-03-15T23:02:00Z
**Primary Input**: `.fractal-factory/domain-brief.md` (474 lines)
**Supporting Docs**: None (domainDocs is null)

## Summary

The domain brief describes an **autonomous multi-agent system for writing romantic fantasy fiction** — covering the entire creative lifecycle from a user's story idea through fully drafted, multi-pass-revised, beta-read, and polished story chapters. The system is designed for series production from day one, with a shared series knowledge base enabling seamless sequel creation.

The brief is exceptionally detailed (474 lines) and covers:
- 9 distinct pipeline phases (concept → worldbuilding → character → plotting → style → drafting → revision → beta reading → polish)
- A user-facing guide agent as the sole human interaction point
- Adversarial consistency gates as sub-phases within every creative phase
- Series-level knowledge management with subcategorized artifact directories
- 6 advanced craft dimensions that cut across multiple phases
- Explicit scope boundaries (non-goals clearly stated)

## Subdomains Identified (14)

| ID | Name | Complexity | Est. Agents | Description |
|----|------|-----------|-------------|-------------|
| SD-001 | user-guide-and-input | low | 1 | Guide agent: gathers inputs, validates, writes story-config.json, launches pipeline |
| SD-002 | concept-development | medium | 2 | Phase 1: idea distillation, theme extraction, premise refinement, comp titles, craft profile selection |
| SD-003 | worldbuilding | high | 3 | Phase 2: geography, magic system, politics, history, culture, fauna/flora — deeply subcategorized |
| SD-004 | character-development | high | 3 | Phase 3: protagonist profiles, romance arc, supporting cast, antagonist, voice guides, relationship web |
| SD-005 | plotting-and-outlining | high | 4 | Phase 4: structural framework selection, per-chapter outlines, tension mapping, dual-arc interleave, foreshadowing ledger |
| SD-006 | prose-style-calibration | medium | 2 | Phase 5: reference analysis, style guide, tone palette, voice calibration matrix |
| SD-007 | chapter-drafting | high | 3 | Phase 6: per-chapter prose generation with voice/style/continuity maintenance |
| SD-008 | revision-and-editing | high | 4 | Phase 7: developmental edit, line edit, copy edit — three distinct passes |
| SD-009 | beta-reading-simulation | high | 6 | Phase 8: five independent reader lenses + synthesis coordinator |
| SD-010 | polish-and-delivery | medium | 2 | Phase 9: final proofread, summaries, series KB promotion, delivery packaging |
| SD-011 | adversarial-consistency | high | 2 | Cross-cutting: per-phase auditors with kill-your-darlings mandate |
| SD-012 | series-knowledge-management | medium | 2 | Cross-cutting: series KB lifecycle, artifact organization, sequel contracts, cross-book consistency |
| SD-013 | continuity-tracking | medium | 2 | Cross-cutting: running tracker, character knowledge matrix, reader promises, information asymmetry |
| SD-014 | craft-knowledge-systems | high | 3 | Cross-cutting: foreshadowing/symbolism, emotional resonance, dialogue craft, thematic architecture, reader experience design |

**Total Estimated Agent Count: ~39**

## Cross-Cutting Concerns Identified

### 1. Adversarial Consistency Gates (SD-011)
The most pervasive cross-cutting concern. Every creative phase (1–6) MUST include an adversarial auditor sub-phase before the phase is considered complete. The auditor pattern is consistent (receive artifacts → challenge consistency → cross-reference all prior artifacts → produce severity-rated findings → block on criticals) but the **focus areas differ significantly per phase** (detailed table in brief). This will likely be implemented as a shared auditor template/skill with per-phase configuration.

### 2. Series Knowledge Management (SD-012)
Affects concept (sequel must load series KB), worldbuilding (must not contradict series), character (voice guides carry across books), plotting (must address unresolved threads), and delivery (must promote facts into series KB). The append-mostly rule and no-silent-retcon policy are invariants that every creative phase must respect.

### 3. Continuity Tracking (SD-013)
Maintained primarily during drafting but consumed by adversarial auditors, beta readers (especially the craft lens), and revision passes. The character knowledge matrix (who knows what when) is critical for both plot consistency and romantic tension (dramatic irony requires precise asymmetry tracking).

### 4. Craft Knowledge Systems (SD-014)
Six advanced craft dimensions that are NOT standalone phases but integrated throughout:
- **Foreshadowing & Symbolism** → primarily plotting + drafting
- **Multi-POV Engineering** → plotting + drafting + beta reading
- **Emotional Resonance** → plotting + drafting + beta reading
- **Reader Experience Design** → plotting + drafting
- **Dialogue Craft** → plotting + drafting
- **Thematic Architecture** → concept + plotting + drafting

These are best delivered as shared skills/knowledge artifacts that multiple phase agents consume.

### 5. Craft Toolbox Selection (SD-002 → all subsequent phases)
The Story Craft Profile produced during concept/plotting selects which tools from the craft toolbox apply to this story. All subsequent adversarial auditors verify against the **selected** toolset, not the full toolbox — making the craft profile a critical control artifact that flows downstream.

## Coverage Verification

| Brief Section | Mapped To |
|--------------|-----------|
| Purpose | Overall system scope |
| Genre Focus: Romantic Fantasy | SD-002 (concept), SD-009 (beta/romance lens) |
| Input Types | SD-001 (user-guide-and-input) |
| System Architecture: Guide Agent | SD-001 |
| Adversarial Consistency Gates | SD-011 |
| Phase 1: Concept Development | SD-002 |
| Phase 2: Worldbuilding | SD-003 |
| Phase 3: Character Development | SD-004 |
| Phase 4: Plotting & Outlining | SD-005 |
| Phase 5: Prose Style Development | SD-006 |
| Phase 6: Drafting | SD-007 |
| Phase 7: Self-Editing & Revision | SD-008 |
| Phase 8: Beta Reading Simulation | SD-009 |
| Phase 9: Polish & Delivery | SD-010 |
| Series Architecture & Sequel Production | SD-012 |
| Craft Toolbox Selection | SD-002 (initiated) + SD-011 (enforced) |
| Output Artifacts | SD-010 (delivery) + SD-012 (series) |
| Quality Expectations | SD-008, SD-009, SD-011 (enforcement) |
| Foreshadowing & Symbolism Architecture | SD-014 |
| Multi-POV Craft Engineering | SD-014 |
| Emotional Resonance Engineering | SD-014 |
| Reader Experience Design | SD-014 |
| Dialogue Craft System | SD-014 |
| Thematic Architecture | SD-014 |
| Non-Goals | Scope exclusion (no agents needed) |

**No gaps identified.** Every section of the domain brief maps to at least one subdomain.

## Gaps & Ambiguities

1. **Pipeline orchestration**: The brief describes 9 sequential phases with adversarial gates, but doesn't specify a top-level orchestrator beyond the guide. The produced system will need a session orchestrator (analogous to fractal-factory's own session orchestrator) that sequences the phases and handles auditor retries. This is implicit, not a gap in domain coverage.

2. **Craft toolbox content**: The brief references `invariants.md Part 2` for the full craft toolbox. The invariant extractor (next agent) will need to extract these into the domain model. The domain scanner notes this dependency but doesn't block on it.

3. **Parallelism opportunities**: Several phases could potentially run in parallel (e.g., worldbuilding and character development could overlap), but the brief implies sequential execution. The pipeline architect should evaluate whether any phases can be parallelized.

4. **Chapter count variability**: The system must handle variable-length stories (different chapter counts). The drafting, revision, and beta-reading phases need to scale with chapter count. This is an operational concern, not a domain gap.

5. **Heat level handling**: The brief mentions "fade-to-black through explicit" as a constraint range but doesn't deeply specify how this affects prose generation. The craft-knowledge-systems and chapter-drafting subdomains will need to handle this parametrically.
