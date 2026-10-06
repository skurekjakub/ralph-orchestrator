# Phase 4: Knowledge Synthesis Coordinator + Subagents + Dual-Write

**Goal**: Create a synthesis coordinator and 4 subagents that together extract knowledge signals from the current pipeline run, integrate them into the persistent meta-knowledge base, and regenerate the `docwriter-meta` skill. The decomposition splits the work by input scope — no single agent needs to hold all 15+ run artifacts in context.

**Dependencies**: Phase 1 (meta directory + skill scaffold), Phase 2 (knowledge-brief consumed — enables before/after comparison), Phase 3 (research-brief — enables source effectiveness tracking)
**Outputs consumed by**: Phase 2 (next run's curator reads updated index + entries), Phase 5 (skill reference files consumed by specialists)

---

## Architecture: Synthesis Team

```
docwriter-synthesis-coordinator (Pass 6.5, direct orchestrator dispatch)
├── Step 1: docwriter-task-signal-analyzer      → synthesis-signals/task-signals.json
├── Step 2: docwriter-context-signal-analyzer   → synthesis-signals/context-signals.json
├── Step 3: docwriter-knowledge-integrator      → meta entries, index, retro, research-sources
└── Step 4: docwriter-skill-rebuilder           → skill reference files + SKILL.md
```

**Sequential dispatch** — each step depends on the previous. The coordinator dispatches one at a time and validates each output before proceeding.

**Input scope split** (the reason for decomposition):
- **Task signal analyzer**: reads N-task × 5 files (the heaviest input set — potentially 40+ files for a large issue)
- **Context signal analyzer**: reads 7 global artifacts + knowledge-brief + research-brief (moderate)
- **Knowledge integrator**: reads 2 signal files + meta index + existing entries (focused)
- **Skill rebuilder**: reads meta index + entry files (focused)

---

## Tasks

### 4.1 — Create `docwriter-synthesis-coordinator.agent.md`

**New file**: `.github/agents/docwriter-synthesis-coordinator.agent.md`

**Frontmatter**:
```yaml
---
description: 'Coordinates the knowledge synthesis pipeline after verification converges. Dispatches signal analyzers, knowledge integrator, and skill rebuilder.'
model: claude-opus-4.6
name: 'docwriter-synthesis-coordinator'
agents: ["docwriter-task-signal-analyzer", "docwriter-context-signal-analyzer", "docwriter-knowledge-integrator", "docwriter-skill-rebuilder"]
user-invocable: false
---
```

**Behavioral specification**:

**Identity**: You are `docwriter-synthesis-coordinator`, the coordinator for the knowledge synthesis pipeline (Pass 6.5). You dispatch 4 subagents in sequence to extract, analyze, integrate, and publish knowledge from the current run.

**Timing**: You run ONLY when Pass 5-6 verification has converged. You do NOT run during re-entry cycles. The orchestrator guarantees this via the compound routing condition (`pass65 !== "done" AND pass6 === "done" AND gapHunting.reEntryTarget === null`).

**Dispatch sequence**:

1. **Dispatch `docwriter-task-signal-analyzer`**
   - Wait for status file: `.docwriter/agents/task-signal-analyzer-status.json`
   - Validate: `synthesis-signals/task-signals.json` exists and has non-empty `tasks` array
   - On failure: log warning, create empty `task-signals.json` with `"tasks": []`, continue (degraded)

2. **Dispatch `docwriter-context-signal-analyzer`**
   - Wait for status file: `.docwriter/agents/context-signal-analyzer-status.json`
   - Validate: `synthesis-signals/context-signals.json` exists
   - On failure: log warning, create empty `context-signals.json`, continue (degraded)

3. **Dispatch `docwriter-knowledge-integrator`**
   - Wait for status file: `.docwriter/agents/knowledge-integrator-status.json`
   - Validate: `meta/index.json` has been updated (`lastSynthesized` timestamp is fresh)
   - On failure: mark synthesis as failed, skip skill rebuild, write error status

4. **Dispatch `docwriter-skill-rebuilder`**
   - Wait for status file: `.docwriter/agents/skill-rebuilder-status.json`
   - Validate: all 5 reference files exist in `.github/skills/docwriter-meta/references/`
   - On failure: log warning, skill files may be stale (non-fatal)

**Output**: Write `.docwriter/agents/synthesis-coordinator-status.json`:
```json
{
  "agent": "docwriter-synthesis-coordinator",
  "status": "done",
  "result": "knowledge-synthesized",
  "timestamp": "<ISO>",
  "steps": {
    "taskSignals": "done",
    "contextSignals": "done",
    "integration": "done",
    "skillRebuild": "done"
  },
  "degraded": false
}
```

Prepend to `.docwriter/manifest.json`.

---

### 4.2 — Create `docwriter-task-signal-analyzer.agent.md`

**New file**: `.github/agents/docwriter-task-signal-analyzer.agent.md`

**Frontmatter**:
```yaml
---
description: 'Analyzes per-task artifacts from the pipeline run to extract knowledge signals — first-attempt successes, multi-cycle failures, and pattern effectiveness.'
model: claude-opus-4.6
name: 'docwriter-task-signal-analyzer'
user-invocable: false
---
```

**Identity**: You are `docwriter-task-signal-analyzer`, a specialist in the synthesis pipeline. You read all per-task artifacts and produce a condensed signal file that the downstream integrator uses to create knowledge entries.

**Input artifacts** (read — per-task scope):
- `.docwriter/task-graph.json` — task list with acceptance criteria, pattern/recommendation citations
- `.docwriter/tasks/*/review-feedback.md` — reviewer feedback per task per cycle
- `.docwriter/tasks/*/writer-output.json` — writer output (docFacts, invariants applied, patterns used, recommendations cited)
- `.docwriter/tasks/*/style-review.json` — style reviewer verdicts per cycle
- `.docwriter/tasks/*/accuracy-review.json` — accuracy reviewer verdicts per cycle
- `.docwriter/tasks/*/persona-review.json` — persona reviewer verdicts per cycle
- `.docwriter/progress.json` — pipeline execution counts

**Process**:

#### Signal A1: First-attempt success analysis (→ candidate patterns)

Identify tasks where ALL 3 reviewers (style, accuracy, persona) approved on the first cycle:

For each first-attempt success:
1. Read the task's `writer-output.json`:
   - What structural approach was used? (headings, lists, code blocks placement)
   - What invariants were explicitly applied?
   - Were any meta-knowledge patterns cited (`patternsUsed` array)?
   - Were any research recommendations cited (`researchRecommendationsCited` array)?
2. Read the task graph entry for this task:
   - What acceptance criteria were set by the planner?
   - Were pattern-derived criteria present? (These came from the curator's brief)
3. Correlate: If a specific structural approach + invariant combination consistently produces first-attempt acceptance, flag as **candidate pattern**.

**Signal strength**: First-attempt success across a single task = `low`. Across 2+ tasks in the same run with the same approach = `medium`. If it also matches a meta-knowledge pattern that was cited = `confirm-existing`.

#### Signal A2: Multi-cycle failure analysis (→ candidate anti-patterns)

Identify tasks requiring 2+ reviewer cycles before acceptance:

For each multi-cycle task:
1. Read ALL `review-feedback.md` files for this task (one per cycle)
2. Identify the **root cause** of the first rejection:
   - **Structural**: Wrong section order, missing subsections, incorrect heading levels
   - **Accuracy**: Incorrect API behavior description, wrong parameter types, missing edge cases
   - **Tone/persona**: Wrong audience register, too casual/formal, inconsistent voice
   - **Coverage**: Missing cross-references, incomplete parameter documentation, no examples
   - **Style**: Paragraph too long, passive voice, unclear antecedents
3. Identify what the writer changed between the rejected cycle and the accepted cycle — this is the **fix**.
4. Formulate: "Doing X led to rejection because of Y. Doing Z instead got acceptance." → candidate **anti-pattern**.

**Signal strength**: Single rejection = `low`. Same root cause across 2+ tasks = `medium`. Same root cause already in meta-knowledge = `confirm-existing`.

#### Signal A3: Style evolution detection (→ candidate style evolutions)

From style-review feedback across ALL tasks:
1. Identify style decisions that reviewers enforced but that aren't in `invariant-inventory.json`:
   - "Reviewer flagged paragraph length >3 sentences in reference pages" → if this happened 2+ times, it's an emergent style evolution
2. Identify style patterns that passed without issue — potential positive style evolutions.

**Output**: Write `.docwriter/synthesis-signals/task-signals.json`:
```json
{
  "version": 1,
  "timestamp": "<ISO>",
  "runStats": {
    "totalTasks": 8,
    "firstAttemptAcceptance": 6,
    "multiCycleAcceptance": 1,
    "blocked": 1,
    "totalReviewCycles": 12
  },
  "tasks": [
    {
      "taskId": "T-003",
      "result": "first-attempt",
      "structuralApproach": "parameter-grouping-by-category",
      "invariantsApplied": ["INV-STRUCT-005", "INV-STYLE-001"],
      "metaPatternsUsed": ["PAT-003"],
      "researchRecommendationsUsed": ["REC-002"],
      "acceptanceCriteria": ["group parameters by category", "include code examples"],
      "signal": {
        "type": "candidate-pattern",
        "strength": "medium",
        "description": "Parameter grouping by category achieved first-attempt acceptance in 3/8 tasks"
      }
    },
    {
      "taskId": "T-005",
      "result": "multi-cycle",
      "cyclesRequired": 2,
      "rootCause": "accuracy",
      "rootCauseDetail": "Missing edge case for null parameter handling",
      "fix": "Added null handling section with code example from unit tests",
      "signal": {
        "type": "candidate-anti-pattern",
        "strength": "low",
        "description": "Omitting null/edge case documentation for nullable params causes accuracy rejection"
      }
    }
  ],
  "styleEvolutions": [
    {
      "observation": "Reviewer enforced ≤3 sentences per paragraph in reference pages (2 tasks)",
      "occurrences": 2,
      "strength": "low",
      "description": "Reference page paragraphs should be ≤3 sentences — not in current invariants"
    }
  ]
}
```

Write status file: `.docwriter/agents/task-signal-analyzer-status.json`
Prepend to `.docwriter/manifest.json`.

---

### 4.3 — Create `docwriter-context-signal-analyzer.agent.md`

**New file**: `.github/agents/docwriter-context-signal-analyzer.agent.md`

**Frontmatter**:
```yaml
---
description: 'Analyzes global pipeline artifacts (gap analysis, impact matrix, research brief, knowledge brief) to extract domain insights, research effectiveness, and gap signals.'
model: claude-opus-4.6
name: 'docwriter-context-signal-analyzer'
user-invocable: false
---
```

**Identity**: You are `docwriter-context-signal-analyzer`, a specialist in the synthesis pipeline. You read global pipeline artifacts (not per-task files — task-signal-analyzer handles those) and extract domain insights, research effectiveness, and gap analysis signals.

**Input artifacts** (read — global scope):
- `.docwriter/gap-analysis.json` — gap hunter findings
- `.docwriter/verification-matrix.json` — cross-reference verification results
- `.docwriter/code-analysis.json` — behavioral complexity data
- `.docwriter/impact-matrix.json` — impact assessment data
- `.docwriter/research-brief.json` — research recommendations (if available)
- `.docwriter/knowledge-brief.json` — what meta-knowledge was available at run start
- `.docwriter/meta/research-sources.json` — curated source list
- `.docwriter/synthesis-signals/task-signals.json` — task signal analyzer output (for cross-referencing)

**Process**:

#### Signal B1: Gap-hunter findings analysis (→ candidate anti-patterns or domain insights)

From `gap-analysis.json`:
1. What gaps were discovered? Categorize:
   - **Predictable gaps**: Were they in the risk register? If yes, why weren't they caught earlier? → candidate anti-pattern ("risk-register blind spot")
   - **Novel gaps**: Not in risk register → candidate domain insight ("this code area has non-obvious doc requirements")
2. What re-entry targets were set? Track which pass (2? 3? 4?) needed re-work — reveals systematic weaknesses.
3. Cross-reference with knowledge-brief: Were there anti-patterns that SHOULD have prevented this gap? If yes, note for entry quality improvement.

#### Signal B2: Domain-specific insight extraction (→ candidate domain insights)

From `code-analysis.json` + `impact-matrix.json`:
1. Identify non-obvious code→doc relationships:
   - APIs with hidden dependencies (service chains, configuration prerequisites)
   - Behavioral differences between environments (dev vs. prod)
   - Code paths that affect documentation structure (polymorphic APIs, feature flags)
2. Identify domain conventions not captured in invariants:
   - Naming patterns specific to this codebase
   - Architecture-specific documentation needs (e.g., event-driven systems need event catalog pages)

**Signal strength**: Always `low` on first discovery. Upgrade via subsequent runs only.

#### Signal B3: Research recommendation effectiveness (→ source quality feedback)

If `research-brief.json` exists:
1. Cross-reference with `task-signals.json` to check which recommendations were actually cited:
   - For each approved recommendation (REC-NNN):
     - Cited by content-writer AND task passed first-attempt → recommendation was useful
     - Cited but task failed review → potentially misleading
     - NOT cited despite being applicable → overlooked or irrelevant
2. Per source (SRC-NNN in `sourcesConsulted`):
   - Count recommendations originated vs. recommendations actually used
   - Compute effectiveness ratio: `used / originated`

#### Signal B4: Meta-knowledge effectiveness analysis

From `knowledge-brief.json` + `task-signals.json`:
1. Which patterns from the brief were actually cited by the task signal analyzer's tasks?
2. Which anti-patterns from the brief were violated? (Tasks that hit the same anti-pattern despite it being in the brief)
3. Which entries were in the brief but neither used nor relevant? (Over-inclusion by curator)

**Output**: Write `.docwriter/synthesis-signals/context-signals.json`:
```json
{
  "version": 1,
  "timestamp": "<ISO>",
  "gapSignals": [
    {
      "gapType": "cross-reference-missing",
      "predictable": false,
      "reEntryTarget": "pass4",
      "signal": {
        "type": "candidate-domain-insight",
        "strength": "low",
        "description": "API endpoints in the payments module have cross-service refs that aren't auto-detected"
      }
    }
  ],
  "domainInsights": [
    {
      "observation": "Event-driven endpoints require event catalog cross-references",
      "source": "code-analysis",
      "evidence": "3 endpoints in events/ module had hidden event-trigger dependencies",
      "strength": "low"
    }
  ],
  "researchEffectiveness": {
    "sourcesEvaluated": 4,
    "sources": {
      "SRC-001": { "originated": 3, "used": 2, "effectiveness": "high" },
      "SRC-002": { "originated": 2, "used": 0, "effectiveness": "low" }
    },
    "newSourceCandidates": []
  },
  "metaKnowledgeEffectiveness": {
    "patternsFromBrief": 3,
    "patternsActuallyUsed": 2,
    "antiPatternsFromBrief": 1,
    "antiPatternsViolated": 0,
    "overIncluded": 1,
    "overIncludedEntries": ["DOM-002"]
  }
}
```

Write status file: `.docwriter/agents/context-signal-analyzer-status.json`
Prepend to `.docwriter/manifest.json`.

---

### 4.4 — Create `docwriter-knowledge-integrator.agent.md`

**New file**: `.github/agents/docwriter-knowledge-integrator.agent.md`

**Frontmatter**:
```yaml
---
description: 'Integrates extracted signals into the persistent meta-knowledge base with deduplication, confidence calibration, quality gating, and task retrospective generation.'
model: claude-opus-4.6
name: 'docwriter-knowledge-integrator'
user-invocable: false
---
```

**Identity**: You are `docwriter-knowledge-integrator`, the knowledge writer in the synthesis pipeline. You take the condensed signal files from the two analyzers and integrate their findings into the persistent meta-knowledge base with rigorous deduplication, confidence calibration, and quality gating.

**Input artifacts** (read — focused scope):
- `.docwriter/synthesis-signals/task-signals.json` — from task-signal-analyzer
- `.docwriter/synthesis-signals/context-signals.json` — from context-signal-analyzer
- `.docwriter/knowledge-brief.json` — what meta-knowledge was available at run start
- `.docwriter/meta/index.json` — existing meta-knowledge catalog
- `.docwriter/meta/{patterns,anti-patterns,domain-insights,style-evolutions}/*.md` — existing entry files (read as needed during dedup)
- `.docwriter/meta/research-sources.json` — curated source list
- `.docwriter/progress.json` — pipeline timeline

**Process**:

#### Step 1 — Confidence Calibration

Every candidate entry from the signal files needs a calibrated confidence level following a strict ladder:

| Level | Criteria | Upgrade path |
|---|---|---|
| `low` | Single observation in one run. No corroboration. | If confirmed in next run → `medium` |
| `medium` | Observed in 2+ tasks within one run, OR confirmed across 2 runs. | If confirmed across 3+ runs with consistent evidence → `high` |
| `high` | Confirmed across 3+ runs. First-attempt acceptance rate >80% when pattern is applied (or rejection rate >80% when anti-pattern is committed). | Stays `high` unless contradicted |

**Downgrade rules**:
- If a `high` confidence pattern is applied but leads to failure → investigate; if the pattern is the root cause → downgrade to `medium` and add a note.
- If an entry hasn't been referenced for 3+ consecutive runs where it was relevant → downgrade one level.
- **Never** auto-downgrade to `deprecated`. Deprecation is informed by staleness signals from the curator's brief.

Apply the confidence ladder to each candidate signal. Where a signal has `strength: "confirm-existing"`, find the matching entry and apply upgrade logic.

#### Step 2 — Deduplication and Merge

For each candidate entry:

1. **Search for duplicates** in `index.json`:
   - Match by `type` FIRST (pattern can only match pattern)
   - Then fuzzy-match by `title` (are the core topics the same?)
   - Then check `domains` overlap (≥50% domain overlap = potential duplicate)
   - If both title similarity AND domain overlap are high → likely duplicate

2. **If duplicate found** (existing entry):
   - Increment `usageCount`
   - Update `lastReferencedDate`
   - Apply confidence ladder: if the new evidence supports the entry, potentially upgrade
   - Read the existing entry file and check if the new run adds nuance:
     - New domain applicability? → add to `domains` array
     - New evidence? → append to Evidence section
     - New "How to apply" guidance? → enrich that section
   - Write the updated entry file

3. **If no duplicate** (new entry):
   - Assign next ID in sequence (`PAT-NNN`, `AP-NNN`, `DOM-NNN`, `STYLE-NNN`)
   - Create the entry file
   - Append to `index.json`

#### Step 3 — Quality Gate

Only persist entries that pass ALL three checks:
- **Reusability**: Does the insight apply to future tasks with similar domain/doc type? If it starts with "In task T-003 of DOC-3200..." it's too specific — discard.
- **Actionability**: Can a future agent change their behavior based on this? The entry must include a "How to Apply" section mapping to specific agent actions.
- **Non-redundancy**: Not already covered by an existing invariant. Check `invariant-inventory.json`. (Exception: if the entry adds context BEYOND the invariant, it's supplementary, not redundant.)

#### Step 4 — Write Entry Files

Each new entry is a markdown file in the appropriate subdirectory:

```markdown
# PAT-007: API parameter grouping by category

**Type**: pattern
**Discovered**: 2026-03-13 (DOC-3200)
**Confidence**: medium (observed in 3/8 tasks within single run)
**Domains**: api-reference
**Invariants referenced**: INV-STRUCT-005, INV-STYLE-001
**Usage count**: 1
**Last referenced**: 2026-03-13

## Pattern

When documenting API endpoints with >5 parameters, group them by category
(path, query, body, header) with a definition list per group. Each group
gets a level-3 heading. Within each group, list parameters alphabetically.

This approach achieved first-attempt acceptance for all 3 tasks where it was
applied (T-003, T-007, T-011 in DOC-3200), compared to 40% first-attempt
rate for tasks using flat parameter lists.

## Evidence

| Run | Tasks applied | First-attempt rate | Notes |
|---|---|---|---|
| DOC-3200 | T-003, T-007, T-011 | 100% (3/3) | Initial discovery |

## How to Apply

**Task planner**: Add "group parameters by category (path/query/body/header)" as
an acceptance criterion for endpoint docs with >5 parameters.

**Content writer**: Use definition list markup with category subheadings. Alphabetize.

**Style reviewer**: Check that parameter grouping is consistent across all endpoint pages.

## Provenance

- First observed: DOC-3200, 2026-03-13
- Confirmed by: (pending future runs)
```

#### Step 5 — Update `index.json`

For each new or modified entry, update the index:
```json
{
  "id": "PAT-007",
  "type": "pattern",
  "title": "API parameter grouping by category",
  "path": "patterns/PAT-007-api-parameter-grouping.md",
  "domains": ["api-reference"],
  "confidence": "medium",
  "usageCount": 1,
  "discoveredDate": "2026-03-13",
  "lastReferencedDate": "2026-03-13",
  "deprecated": false,
  "provenance": ["DOC-3200"]
}
```

Set `lastSynthesized` timestamp on the index root.

#### Step 6 — Write Task Retrospective

Write `.docwriter/meta/task-retros/RETRO-<issue-key>.json`:
```json
{
  "issueKey": "DOC-3200",
  "date": "2026-03-13",
  "pipeline": {
    "tasksPlanned": 8,
    "firstAttemptAcceptance": 6,
    "multiCycleAcceptance": 1,
    "blocked": 1,
    "gapHuntingCycles": 1,
    "totalReviewCycles": 12
  },
  "knowledge": {
    "patternsFromBrief": 3,
    "patternsActuallyUsed": 2,
    "antiPatternsFromBrief": 1,
    "antiPatternsViolated": 0,
    "researchRecommendationsApproved": 5,
    "researchRecommendationsUsed": 3,
    "newPatternsDiscovered": 2,
    "newAntiPatternsDiscovered": 1,
    "existingEntriesReinforced": 1,
    "confidenceUpgrades": 0
  },
  "research": {
    "sourcesConsulted": 4,
    "sourceEffectiveness": {
      "SRC-001": { "originated": 3, "used": 2, "effectiveness": "high" },
      "SRC-002": { "originated": 2, "used": 0, "effectiveness": "low" }
    }
  },
  "failures": {
    "rootCauses": {
      "structural": 0,
      "accuracy": 1,
      "tone": 0,
      "coverage": 1,
      "style": 0
    },
    "gapTypes": ["cross-reference-missing", "parameter-description-incomplete"]
  },
  "keyLesson": "API parameter grouping significantly reduced reviewer cycles. Cross-reference gaps remain the primary re-entry trigger."
}
```

#### Step 7 — Update `research-sources.json`

For each source in the context-signals' `researchEffectiveness`:
- Increment `usageCount`, update `lastUsed`
- Set `effectiveness` from evaluator data:
  - `"high"`: >50% of the source's approved recommendations cited by content-writer
  - `"medium"`: 20-50% cited
  - `"low"`: <20% cited
  - `"none"`: 0% cited
- **Deprecation heuristic**: If a source has `effectiveness: "low"` or `"none"` for 3 consecutive runs, set `deprecated: true`. Do not remove — the integrator is additive-only.
- Add high-effectiveness new sources from `newSourceCandidates`.

**Output**: Write status file `.docwriter/agents/knowledge-integrator-status.json`:
```json
{
  "agent": "docwriter-knowledge-integrator",
  "status": "done",
  "result": "integrated",
  "timestamp": "<ISO>",
  "extraction": {
    "candidatePatterns": 4,
    "candidateAntiPatterns": 2,
    "candidateDomainInsights": 1,
    "candidateStyleEvolutions": 1
  },
  "merged": {
    "newEntries": 3,
    "updatedEntries": 2,
    "filteredByQualityGate": 3,
    "confidenceUpgrades": 1
  },
  "research": {
    "sourceEffectivenessUpdated": true,
    "sourcesDeprecated": 0,
    "sourcesAdded": 0
  }
}
```

Prepend to `.docwriter/manifest.json`.

**Contracts**:
- **Additive only**: Never deletes entries. Can set `deprecated: true` but never removes files.
- **Quality-gated**: Only persists entries meeting reusability + actionability + non-redundancy.
- **Confidence-calibrated**: All assignments follow the strict ladder (Step 1).
- **Evidence-linked**: Every entry includes Provenance and Evidence sections.
- **Deterministic**: Same signal inputs → same entries.

---

### 4.5 — Create `docwriter-skill-rebuilder.agent.md`

**New file**: `.github/agents/docwriter-skill-rebuilder.agent.md`

**Frontmatter**:
```yaml
---
description: 'Regenerates all meta-skill reference files from the persistent knowledge base. Full rebuild from source of truth — never incremental.'
model: claude-opus-4.6
name: 'docwriter-skill-rebuilder'
user-invocable: false
---
```

**Identity**: You are `docwriter-skill-rebuilder`, the final step in the synthesis pipeline. You read the updated meta-knowledge index and all entry files, then regenerate the skill's consolidated reference files from scratch. Downstream specialist agents consume these files during future runs.

**Input artifacts** (read):
- `.docwriter/meta/index.json` — the updated catalog (post-integration)
- `.docwriter/meta/{patterns,anti-patterns,domain-insights,style-evolutions}/*.md` — all non-deprecated entry files
- `.docwriter/meta/task-retros/*.json` — all task retrospectives (for effectiveness table)

**Process**: Full rebuild of ALL 5 reference files + SKILL.md header. This is a compile step: structured data → consumable knowledge.

#### File 1: `references/patterns.md`

Read ALL non-deprecated `type: "pattern"` entries. For each:
1. Read entry file, extract: ID, title, core summary, confidence, usage count, domains, "How to Apply"
2. Group by domain (entries in multiple domains appear in each)
3. Within each domain, order by confidence (high first), then usage count

```markdown
# Documentation Patterns

> Auto-generated by docwriter-skill-rebuilder. Do not edit manually.
> Last regenerated: 2026-03-13T14:30:00Z | Entry count: 5

## API Reference Patterns

### PAT-007: API parameter grouping by category ⭐ high (4 uses)
When documenting API endpoints with >5 parameters, group by category (path/query/body/header).
**Apply in**: task-planner (acceptance criteria), content-writer (structure), style-reviewer (consistency)
**Invariants**: INV-STRUCT-005, INV-STYLE-001

### PAT-003: ...

## Tutorial Patterns

### PAT-001: ...
```

#### File 2: `references/anti-patterns.md`

Same structure, for `type: "anti-pattern"` entries:

```markdown
# Documentation Anti-Patterns

> Auto-generated. Do not edit manually.

## API Reference Anti-Patterns

### AP-001: Monolithic parameter lists ⚠️ high (3 uses)
Flat parameter lists for endpoints with >5 params caused style-reviewer rejections in 80% of cases.
**Avoid by**: Adding "group parameters by category" constraint in task-planner.
**Watch for**: style-reviewer, gap-hunter
```

#### File 3: `references/domain-knowledge.md`

For `type: "domain-insight"` entries, grouped by domain area.

#### File 4: `references/style-decisions.md`

For `type: "style-evolution"` entries. Each includes which invariant it supplements (if any) and rationale.

#### File 5: `references/task-effectiveness.md`

Table synthesized from ALL `task-retros/*.json` files:

```markdown
# Task Effectiveness History

> Auto-generated. Tracks pipeline performance across runs.

| Issue | Date | Tasks | 1st attempt | Cycles | Gaps | Key lesson |
|---|---|---|---|---|---|---|
| DOC-3200 | 2026-03-13 | 8 | 75% (6/8) | 12 | 1 | Parameter grouping worked |
| DOC-3187 | 2026-03-10 | 5 | 60% (3/5) | 9 | 2 | Persona voice needs explicit guidance |

## Trends
- First-attempt acceptance trending upward (60% → 75%)
- Cross-reference gaps are the most persistent failure mode
- Research recommendations used at ~60% rate
```

#### SKILL.md header update

```markdown
# Docwriter Meta-Knowledge Skill

**Last synthesized**: 2026-03-13T14:30:00Z
**Knowledge base size**: 14 entries (5 patterns, 3 anti-patterns, 4 domain insights, 2 style decisions)
**Runs synthesized**: 4
**Avg first-attempt acceptance**: 68%

This skill provides accumulated meta-knowledge from past docwriter pipeline runs.
Specialist agents consult these references for proven patterns, known pitfalls,
domain insights, and emergent style guidance.

## References

- `references/patterns.md` — Structural and content patterns
- `references/anti-patterns.md` — Approaches that consistently fail
- `references/domain-knowledge.md` — Non-obvious code→doc relationships
- `references/style-decisions.md` — Emergent style guidance beyond invariants
- `references/task-effectiveness.md` — Historical pipeline performance
```

**Key constraint**: Full rebuild from `meta/index.json` + entry files. Never incremental. This prevents drift.

**Output**: Write status file `.docwriter/agents/skill-rebuilder-status.json`:
```json
{
  "agent": "docwriter-skill-rebuilder",
  "status": "done",
  "result": "skill-rebuilt",
  "timestamp": "<ISO>",
  "filesRegenerated": 6,
  "totalEntriesInSkill": 14,
  "entriesByType": {
    "patterns": 5,
    "anti-patterns": 3,
    "domain-insights": 4,
    "style-evolutions": 2
  }
}
```

Prepend to `.docwriter/manifest.json`.

---

## Design Decisions

### Why decompose into coordinator + 4 subagents?
The old single-agent synthesizer needed to hold 15+ files in context (N-task × 5 files + 7 global artifacts + existing meta). For an 8-task issue, that's 47+ files. Splitting by input scope ensures each agent has a focused context:
- Task signal analyzer: N-task files (heaviest, but focused on one artifact type per task)
- Context signal analyzer: 7 global files (moderate, distinct artifacts)
- Knowledge integrator: 2 signal files + meta index (small, merge-logic focused)
- Skill rebuilder: meta index + entry files (read-heavy but simple transform)

### Why sequential dispatch (not parallel)?
Each step depends on the previous: signal analyzers produce signals → integrator needs signals → rebuilder needs updated index. The context-signal-analyzer reads task-signals.json for cross-referencing, so even the two analyzers are sequential.

### Why split signals into task vs. context?
Per-task artifacts (review feedback, writer output) are numerous and repetitive (same schema per task). Global artifacts (gap analysis, impact matrix, research brief) are singular and diverse. Different reading strategies — the task analyzer iterates over tasks, the context analyzer reads distinct files.

### Why a separate skill rebuilder?
The integrator's job is merge logic + confidence calibration — complex work. The rebuilder's job is a pure compile step (read index → write markdown). Separating them means the rebuilder can be re-run independently if skill files need regeneration without re-running the full integration.

### Why full-rebuild for skills?
Incremental append would accumulate ordering inconsistencies, duplicate entries, and formatting drift. Full-rebuild from the canonical `index.json` guarantees consistency. Cost is trivial (6 file writes).

### Why not run during re-entry cycles?
Re-entry means the pipeline hasn't converged — intermediate reviewer feedback from incomplete cycles would produce misleading patterns. Only the FINAL state tells the true story.

### Why strict confidence ladder?
Without calibrated confidence, knowledge inflates — everything becomes "high confidence" after a few runs. Strict criteria (`high` = confirmed across 3+ runs with >80% acceptance) prevent confidence inflation.

### Why track source effectiveness?
Without effectiveness metrics, the curated source list grows but never improves. Deprecating low-effectiveness sources (3 consecutive runs of no value) keeps research-scout focused.

---

## Acceptance Criteria

- [ ] `docwriter-synthesis-coordinator.agent.md` exists with agents array of 4 subagents
- [ ] `docwriter-task-signal-analyzer.agent.md` exists, reads per-task artifacts, writes `task-signals.json`
- [ ] `docwriter-context-signal-analyzer.agent.md` exists, reads global artifacts, writes `context-signals.json`
- [ ] `docwriter-knowledge-integrator.agent.md` exists, implements confidence ladder + dedup + quality gate
- [ ] `docwriter-skill-rebuilder.agent.md` exists, full-rebuilds all 6 skill files from index
- [ ] Coordinator dispatches 4 subagents sequentially with validation between each
- [ ] Coordinator handles degraded mode (signal analyzer failure → empty signals → continue)
- [ ] Entry files include Provenance and "How to Apply" sections
- [ ] Task retrospective includes pipeline, knowledge, research, and failure breakdowns
- [ ] Source effectiveness updated with deprecation heuristic (3 consecutive low/none runs)
- [ ] Confidence assignments follow the strict ladder — no arbitrary levels
- [ ] Additive-only: no entries deleted, only deprecated
- [ ] Quality gate filters non-reusable / non-actionable / redundant entries
- [ ] All 6 skill files fully regenerated from index (full rebuild, never incremental)
