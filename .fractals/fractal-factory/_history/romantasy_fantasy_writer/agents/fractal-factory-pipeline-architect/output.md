# Pipeline Architect — Output Report

**Agent**: fractal-factory-pipeline-architect  
**Task**: pass2/pipeline-design  
**Domain**: fantasy-writer (romantic fantasy fiction production system)  
**Timestamp**: 2026-03-16T00:25:00Z  

---

## 1. Domain Characteristics Assessment

### Discovery Complexity: HIGH
- **14 subdomains**: 10 sequential creative phases + 4 cross-cutting concerns
- 7 subdomains rated high-complexity (worldbuilding, character-development, plotting-and-outlining, chapter-drafting, revision-and-editing, beta-reading-simulation, adversarial-consistency)
- 3 subdomains rated medium-complexity (concept-development, prose-style-calibration, polish-and-delivery, series-knowledge-management, continuity-tracking)
- Cross-cutting concerns (adversarial-consistency, series-knowledge, continuity-tracking, craft-knowledge) affect every sequential phase

### Analysis Depth: HIGH
- **81 invariants** across 4 classifications:
  - Behavioral: 21 (genre promise, emotional arcs, character agency)
  - Quality: 33 (prose standards, voice consistency, tension management)
  - Workflow: 13 (sequential ordering, artifact dependencies, review completeness)
  - Structural: 14 (directory layout, cross-reference format, artifact isolation)
- **26 "When selected" conditional invariants** requiring craft-profile-aware enforcement
- Invariant density per subdomain varies dramatically: SD-007 (chapter-drafting) has 47 invariant touches, SD-001 (user-guide) has only 9

### Planning Complexity: HIGH
- Strong sequential dependencies in the creative pipeline (worldbuilding → character → plotting → drafting)
- Cross-cutting concerns must integrate as sub-phase gates at every creative phase
- 80-agent budget with depth-3 hierarchy requires careful allocation across 14 subdomains
- Series production adds a parallel concern axis (standalone vs. sequel paths)

### Execution Pattern: Writer→Reviewer Loop
- Exemplar pattern: bounded coder→reviewer loop (maxRetries=10)
- Domain-specific: drafter→editor for chapters, worldbuilder→consistency-checker, character→voice-auditor
- Adversarial auditors act as quality gates between phases

### Verification Needs: HIGH
- 81 invariants require traceable enforcement paths through produced prompts
- Dual-perspective verification: structural checklist + architectural oracle
- Cross-cutting concerns create enforcement paths that span many agents

### Gap-Hunting Value: VERY HIGH
- 81 invariants × 14 subdomains = enormous enforcement surface area
- Conditional invariants ("When selected:") add a complexity dimension that's easy to miss
- Series production paths (sequel handling, KB management) are secondary flows likely under-specified on first pass
- 5 distinct beta reader lenses each need structured output schemas

---

## 2. Pipeline Pass Table

| Pass | Name | Display Name | Est. Agents | Parallel? | Status |
|------|------|-------------|-------------|-----------|--------|
| 0 | knowledge-curation | Meta-Knowledge Curation | 1 | N/A | ✅ Complete (cold-start) |
| 1 | discovery | Domain Discovery | 5 | ✅ Yes | ✅ Complete |
| 2 | analysis | Architecture Analysis | 4 | ✅ Yes | 🔄 In Progress |
| 3 | planning | Roster & Routing Planning | 4 | ❌ No | ⏳ Pending |
| 4 | execution | Prompt Writing & Infrastructure | 3 | ❌ No | ⏳ Pending |
| 5 | verification | Dual-Perspective Verification | 3 | ✅ Yes | ⏳ Pending |
| 6 | gapHunting | Gap Hunting & Convergence | 4 | ✅ Yes | ⏳ Pending |
| 7 | delivery | Packaging & Delivery | 4 | ❌ No | ⏳ Pending |

**Total estimated factory agents**: 28 (across all passes)

---

## 3. Pass Details

### Pass 0: Meta-Knowledge Curation
- **Purpose**: Curate craft-domain signals from prior runs into knowledge-brief.json
- **Entry**: Unconditional (always first)
- **Exit**: knowledge-brief.json written
- **This run**: Cold start — no prior signals. Minimal brief produced.
- **Future value**: Will accumulate prose patterns, worldbuilding consistency strategies, invariant enforcement lessons across runs

### Pass 1: Domain Discovery
- **Purpose**: Build comprehensive domain model from domain-brief.md, invariants.md, and exemplar families
- **Entry**: Pass 0 complete
- **Exit**: domain-model.json with all 4 sections (subdomains, invariants, existingAssets, exemplarPatterns)
- **Specialists**: domain-scanner, invariant-extractor, asset-auditor, exemplar-analyzer (parallel)
- **Results**: 14 subdomains, 81 invariants, 26 assets, 20 exemplar patterns discovered

### Pass 2: Architecture Analysis
- **Purpose**: Three independent architectural analyses — pipeline design, artifact schemas, hierarchy depth
- **Entry**: Pass 1 complete (domain-model.json exists)
- **Exit**: architecture.json fully populated
- **Specialists**: pipeline-architect (this agent), artifact-designer, depth-analyzer (parallel)
- **Key decisions**: Pipeline structure, re-entry rules, artifact contracts, depth-2 vs depth-3 per subdomain

### Pass 3: Roster & Routing Planning
- **Purpose**: Agent roster, routing tables, test scenarios
- **Entry**: Pass 2 complete (architecture.json populated)
- **Exit**: roster.json, routing tables, test scenarios all written
- **Specialists**: roster-planner → routing-planner → test-planner (sequential — each depends on prior)
- **Key challenge**: Allocating 80-agent budget across 14 subdomains with depth-3 hierarchy. Must balance creative specialists (many needed) against infrastructure agents (fewer but critical).

### Pass 4: Prompt Writing & Infrastructure
- **Purpose**: Write all ~80 agent prompts and infrastructure files
- **Entry**: Pass 3 complete (roster, routes, tests all exist)
- **Exit**: All prompts written and accepted (or max retries with best-effort)
- **Pattern**: prompt-writer → prompt-reviewer loop (maxRetries=10)
- **Key challenge**: Diverse agent types — creative specialists, adversarial auditors, structural trackers, simulation agents. Each needs domain-specific prompt content while following the universal template.

### Pass 5: Dual-Perspective Verification
- **Purpose**: Validate all artifacts from checklist and oracle perspectives
- **Entry**: Pass 4 complete
- **Exit**: Both verifiers report complete; findings logged for gap hunting
- **Specialists**: checklist-validator, audit-oracle (parallel)
- **Key focus**: 81-invariant traceability, routing DAG completeness, artifact producer/consumer matching

### Pass 6: Gap Hunting & Convergence
- **Purpose**: Systematic 9-category gap search → re-entry if gaps found
- **Entry**: Pass 5 complete
- **Exit**: gap-report.json with gaps-found flag
- **Specialists**: coverage-hunter, artifact-hunter, infrastructure-hunter (parallel, 3 categories each)
- **Expected triggers**: Invariant enforcement gaps, series production edge cases, craft-tool conditional routing

### Pass 7: Packaging & Delivery
- **Purpose**: Package, document, and report
- **Entry**: Convergence achieved or limit reached
- **Exit**: Complete fantasy-writer system in output directory with documentation
- **Specialists**: packager → documentation-writer → report-writer (sequential)

---

## 4. Re-Entry Rules

### RE-001: Analysis-Level Re-Entry
- **Trigger**: Gaps require architectural changes (missing artifact schemas, incorrect depth)
- **Re-entry at**: Pass 2 | **Resets**: Passes 2-6
- **Max re-entries**: 2
- **Rationale**: Heaviest reset — only triggered if fundamental assumptions were wrong. Should be very rare for this domain since the domain model is rich (14 subdomains, 81 invariants, 20 exemplar patterns provide strong guidance).

### RE-002: Planning-Level Re-Entry
- **Trigger**: Gaps require roster or routing changes (missing agents, incomplete routes)
- **Re-entry at**: Pass 3 | **Resets**: Passes 3-6
- **Max re-entries**: 3
- **Rationale**: Moderate reset. Most likely trigger: gap hunter finds a subdomain aspect needs a dedicated agent not in the original roster. Example: series sequel handling might need a dedicated `romantic-fantasy-writer-sequel-continuity-auditor` not initially planned.

### RE-003: Execution-Level Re-Entry
- **Trigger**: Gaps require only prompt rewrites or infrastructure updates
- **Re-entry at**: Pass 4 | **Resets**: Passes 4-6
- **Max re-entries**: 5
- **Rationale**: Lightest meaningful re-entry and the most common. With 81 invariants across 14 subdomains, some enforcement paths will be missed on first execution. The 26 "When selected" conditional invariants are particularly likely to need prompt-level fixes (auditor prompts must load craft-profile.md and check only selected tools).

### RE-004: Verification-Triggered Re-Entry
- **Trigger**: Critical structural violations found during verification
- **Re-entry at**: Pass 4 | **Resets**: Passes 4-5
- **Max re-entries**: 2
- **Rationale**: Short-circuit re-entry — fixes critical issues without consuming a gap-hunting cycle. Only triggers on critical findings (routing references to non-existent agents, producer/consumer mismatches). Gap hunting runs fresh after the fix.

---

## 5. Convergence Strategy

- **Max gap cycles**: 10 (from context.json)
- **Expected cycles**: 2-4
- **Convergence signal**: Zero new items across all 9 gap categories
- **Limit behavior**: Proceed to delivery with outstanding items documented

### Expected Convergence Timeline
1. **Cycle 1**: Catches invariant enforcement gaps (high surface area), series production edge cases, and missing beta reader schemas. Likely triggers RE-003 (prompt-level fixes).
2. **Cycle 2**: Catches cross-reference integrity issues introduced by Cycle 1 fixes, plus any routing gaps from new agent additions. May trigger RE-002 or RE-003.
3. **Cycle 3**: Should be clean for most categories. Remaining items likely in craft-tool conditional invariants.
4. **Cycle 4**: Insurance cycle — if reached, likely converges. The 26 conditional invariants are the last frontier.

### Convergence Accelerators
- Declining item counts signal approaching convergence (< 5 new items → likely clean next cycle)
- RE-003 preferred over RE-002 to minimize blast radius
- RE-004 handles critical issues inline without consuming gap-hunting cycles

---

## 6. Passes Skipped

**None.** All 7 user-requested passes are included, plus Pass 0 (knowledge curation). The domain complexity fully justifies every pass:
- Discovery (14 subdomains, 81 invariants — too much for ad-hoc scanning)
- Analysis (depth-3 hierarchy decisions, 30+ artifact types — needs structured analysis)
- Planning (80-agent budget allocation — needs systematic roster planning)
- Execution (80 agent prompts with diverse types — needs bounded writer→reviewer)
- Verification (81-invariant traceability — needs dual-perspective checking)
- Gap Hunting (enormous enforcement surface area — needs systematic gap search)
- Delivery (complex output structure — needs packaging, docs, and report)

---

## 7. Estimated Total Agent Count

| Category | Count | Notes |
|----------|-------|-------|
| Pass 0 (knowledge curator) | 1 | Single agent, no coordinator |
| Pass 1 (discovery) | 5 | 1 coordinator + 4 specialists |
| Pass 2 (analysis) | 4 | 1 coordinator + 3 specialists |
| Pass 3 (planning) | 4 | 1 coordinator + 3 specialists |
| Pass 4 (execution) | 3 | 1 coordinator + writer + reviewer |
| Pass 5 (verification) | 3 | 1 coordinator + 2 specialists |
| Pass 6 (gap hunting) | 4 | 1 coordinator + 3 hunters |
| Pass 7 (delivery) | 4 | 1 coordinator + 3 specialists |
| **Total factory agents** | **28** | Per-pass; some agents re-invoked on re-entry |

Note: These are **factory agents** (agents that build the fantasy-writer system), not the **produced agents** (agents in the fantasy-writer system itself). The produced system targets up to 80 agents within the maxAgents budget.

---

## 8. Domain-Specific Pipeline Considerations

### Creative Pipeline Sequential Dependencies
The produced fantasy-writer system has strict phase ordering: concept → worldbuilding → character → plotting → style calibration → drafting → revision → beta reading → polish. This is reflected in the factory's execution pass, which must write agent prompts that enforce these dependencies via artifact preconditions (each phase's agents check for upstream artifacts before proceeding).

### Cross-Cutting Concern Integration
Four cross-cutting subdomains (adversarial-consistency, series-knowledge, continuity-tracking, craft-knowledge) don't map to single pipeline phases — they integrate as sub-phase gates, background services, or shared infrastructure. The planning pass must carefully assign these to coordinator scopes and ensure routing tables handle the integration points.

### Series Production Architecture
The produced system must support both standalone and sequel production from day one. This means: series/ directory alongside book-N/ directories, series KB lifecycle management (create for book 1, update for sequels), unresolved-threads.md tracking, and sequel-aware concept phase that checks thread disposition. These requirements add routing complexity that gap hunting is likely to catch.

### Craft Toolbox Conditional Enforcement
26 of 81 invariants are conditional ("When selected:") — they only apply when a specific craft tool is selected in concept/craft-profile.md. This creates a two-tier enforcement system: 55 non-negotiable invariants that always apply, plus 26 conditional invariants whose enforcement depends on runtime configuration. Every adversarial auditor must be craft-profile-aware, which is a unique complexity for this domain that standard factory patterns don't address.
