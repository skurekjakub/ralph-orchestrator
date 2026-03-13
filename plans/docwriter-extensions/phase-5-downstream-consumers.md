# Phase 5: Downstream Consumer Modifications

**Goal**: Modify the 8 existing specialist agents to consume `knowledge-brief.json` and/or `research-brief.json`, add invariant supremacy rules, and wire in meta-skill references.

**Dependencies**: Phase 2 (knowledge-brief.json contract defined), Phase 3 (research-brief.json contract defined)
**Outputs consumed by**: Phase 6 (orchestrator needs to know the updated data flow for routing)

---

## Overview

8 existing agents need modifications. These are additive changes — each agent gains new input artifacts and additional processing steps, but none lose existing behavior.

| Agent | Reads `knowledge-brief.json` | Reads `research-brief.json` | Reads meta-skill | Notes |
|---|---|---|---|---|
| `docwriter-task-planner` | Yes | Yes | `patterns.md`, `anti-patterns.md` | Apply patterns to decomposition, inline recommendations as acceptance criteria |
| `docwriter-content-writer` | Yes | Yes | `patterns.md` | Consult patterns before writing, cite REC-NNN IDs |
| `docwriter-style-reviewer` | Yes | No | `anti-patterns.md` | Check style-evolution entries as supplementary criteria |
| `docwriter-accuracy-reviewer` | Yes | Yes | — | Reference domain-insights, verify against research sources |
| `docwriter-gap-hunter` | Yes | No | `task-effectiveness.md` | Cross-reference anti-patterns and known blind spots |
| `docwriter-impact-mapper` | No | Yes | — | Factor approved recommendations into impact assessment |
| `docwriter-risk-analyzer` | No | Yes | — | Factor research recommendations into risk scoring |
| `docwriter-persona-reviewer` | No | No | — | No changes (persona invariants are sufficient) |

---

## Tasks

### 5.1 — Modify `docwriter-task-planner.agent.md`

**File**: `.github/agents/docwriter-task-planner.agent.md`

**Add to input artifacts section**:
```markdown
### Additional inputs (if available)

- `.docwriter/knowledge-brief.json` — curated meta-knowledge from past runs (may not exist on first run)
- `.docwriter/research-brief.json` — invariant-filtered best practice recommendations (may not exist if research-scout was skipped)
```

**Add new processing step** (before task decomposition):

```markdown
### Pre-planning: Consult accumulated knowledge

Before decomposing tasks:

1. **Read `.github/skills/docwriter-meta/references/patterns.md`** if it exists. Identify patterns applicable to the doc types in this task set. For each applicable pattern:
   - Consider it as a structural template for the relevant tasks
   - Add pattern-derived acceptance criteria (cite PAT-NNN IDs)

2. **Read `.github/skills/docwriter-meta/references/anti-patterns.md`** if it exists. For each relevant anti-pattern:
   - Add an explicit avoidance criterion to affected tasks
   - Escalate risk factor for tasks matching the anti-pattern profile

3. **Check `knowledge-brief.json`** if it exists. For each included pattern/anti-pattern:
   - Verify alignment with task-graph structure
   - Include applicability notes in task descriptions

4. **Check `research-brief.json`** if it exists. For each `"approved"` or `"adapted"` recommendation:
   - If applicable to a task's doc type, inline as an acceptance criterion
   - Cite the REC-NNN ID so reviewers can trace the source
   - For `"adapted"` recommendations, inline the adaptation note alongside the recommendation

**Invariant supremacy**: If ANY research recommendation appears to conflict with an inlined invariant from `invariant-inventory.json`, discard the recommendation. Invariants always win. Note the discard in the task description.
```

**Add to task-graph.json schema** — extend each task entry:
```json
{
  "patternsApplied": ["PAT-003"],
  "antiPatternsAvoided": ["AP-001"],
  "researchRecommendationsInlined": ["REC-001", "REC-003"]
}
```

### 5.2 — Modify `docwriter-content-writer.agent.md`

**File**: `.github/agents/docwriter-content-writer.agent.md`

**Add to input artifacts section**:
```markdown
### Additional inputs (if available)

- `.docwriter/knowledge-brief.json` — curated meta-knowledge
- `.docwriter/research-brief.json` — invariant-filtered best practices
- `.github/skills/docwriter-meta/references/patterns.md` — consolidated pattern catalog
```

**Add new processing step** (before writing):

```markdown
### Pre-writing: Pattern application

Before writing content for any task:

1. If the task's `patternsApplied` array is non-empty, read the cited patterns from `knowledge-brief.json` (or the skill's `patterns.md`). Follow the pattern's structural guidance.

2. If the task's `researchRecommendationsInlined` array is non-empty, apply those recommendations. Cite recommendation IDs in your `writer-output.json` under `researchRecommendationsCited`.

3. Consult `.github/skills/docwriter-meta/references/patterns.md` directly for any patterns relevant to this doc type that weren't already in the task graph.

**Invariant supremacy**: All invariants from the task's inlined invariants take absolute priority. If applying a pattern or research recommendation would violate an invariant, skip it and note the skip in `writer-output.json`.
```

**Extend `writer-output.json` schema**:
```json
{
  "patternsUsed": ["PAT-003"],
  "researchRecommendationsCited": ["REC-001"],
  "recommendationsSkipped": [
    {
      "id": "REC-005",
      "reason": "Conflicts with INV-STYLE-012"
    }
  ]
}
```

### 5.3 — Modify `docwriter-style-reviewer.agent.md`

**File**: `.github/agents/docwriter-style-reviewer.agent.md`

**Add to input artifacts section**:
```markdown
### Additional inputs (if available)

- `.docwriter/knowledge-brief.json` — curated meta-knowledge (focus on `styleEvolutions` and `antiPatterns`)
- `.github/skills/docwriter-meta/references/anti-patterns.md` — known documentation mistakes to watch for
```

**Add new review criterion**:

```markdown
### Meta-knowledge-informed review

In addition to invariant-based style review:

1. If `knowledge-brief.json` exists and has `styleEvolutions` entries, apply them as supplementary style criteria. These represent style decisions that emerged across runs but haven't been formalized as invariants.

2. Cross-reference **docwriter-meta** skill's `anti-patterns.md`. If the content matches a known anti-pattern (e.g., AP-003: "wall of text in API parameter descriptions"), flag it even if base invariants don't explicitly cover it.

**Priority order**: Invariants > style evolutions > anti-pattern warnings. If a style evolution conflicts with an invariant, the invariant wins.
```

### 5.4 — Modify `docwriter-accuracy-reviewer.agent.md`

**File**: `.github/agents/docwriter-accuracy-reviewer.agent.md`

**Add to input artifacts section**:
```markdown
### Additional inputs (if available)

- `.docwriter/knowledge-brief.json` — curated meta-knowledge (focus on `domainInsights`)
- `.docwriter/research-brief.json` — research recommendations with source URLs
```

**Add new review criterion**:

```markdown
### Research-informed accuracy checks

If `research-brief.json` exists and the task cited research recommendations (`researchRecommendationsInlined` in task-graph):

1. For each cited recommendation, verify the content actually follows it (not just claims to).
2. If a recommendation was cited but the implementation diverges, flag as an accuracy concern.
3. For adapted recommendations (status: "adapted"), verify the adaptation was applied correctly and the original conflict is avoided.

### Domain-insight-informed review

If `knowledge-brief.json` has `domainInsights` entries relevant to this task's domain:
1. Cross-reference domain insights with content accuracy claims
2. Flag any content that contradicts a proven domain insight

**Invariant supremacy**: All accuracy checks are subordinate to invariants. If domain insights or research recommendations conflict with invariants, invariants win.
```

### 5.5 — Modify `docwriter-gap-hunter.agent.md`

**File**: `.github/agents/docwriter-gap-hunter.agent.md`

**Add to input artifacts section**:
```markdown
### Additional inputs (if available)

- `.docwriter/knowledge-brief.json` — curated meta-knowledge (focus on `antiPatterns` and `taskRetroLessons`)
- `.github/skills/docwriter-meta/references/task-effectiveness.md` — historical task success/failure data
```

**Add new hunting criterion**:

```markdown
### History-informed gap hunting

If meta-knowledge is available:

1. Read `.github/skills/docwriter-meta/references/task-effectiveness.md`. Check historical failure modes:
   - If past runs had gaps in cross-references, scrutinize cross-references more carefully
   - If past runs had persona tone issues, specifically audit persona alignment
   - If past runs had accuracy gaps in specific domains, deep-check those domains

2. Read `knowledge-brief.json` anti-patterns. For each anti-pattern:
   - Actively hunt for instances in the current output
   - Anti-patterns are "proven failure modes" — their presence is a strong signal of a real gap

3. Read `knowledge-brief.json` task retro lessons. Apply key lessons from past runs as specific checks.
```

### 5.6 — Modify `docwriter-impact-mapper.agent.md`

**File**: `.github/agents/docwriter-impact-mapper.agent.md`

**Add to input artifacts section**:
```markdown
### Additional inputs (if available)

- `.docwriter/research-brief.json` — invariant-filtered best practice recommendations
```

**Add new processing step**:

```markdown
### Research-informed impact assessment

If `research-brief.json` exists:

1. For each `"approved"` recommendation applicable to a doc type in the impact matrix:
   - Check if existing doc pages already follow the recommendation
   - If not, this is an additional impact: the page should be updated to follow the best practice
   - Add a `researchDriven: true` flag to these impact entries
   - Priority: `medium` for research-driven impacts (lower than code-driven impacts)

2. Do NOT create impacts for `"blocked"` recommendations — they failed invariant checks.

3. For `"adapted"` recommendations, create impacts only for the adapted version.
```

### 5.7 — Modify `docwriter-risk-analyzer.agent.md`

**File**: `.github/agents/docwriter-risk-analyzer.agent.md`

**Add to input artifacts section**:
```markdown
### Additional inputs (if available)

- `.docwriter/research-brief.json` — research recommendations
```

**Add new risk dimension**:

```markdown
### Research alignment risk

Assess whether the documentation task aligns with or diverges from external best practices:

- Low risk: Task approach matches approved research recommendations
- Medium risk: Task has no relevant research recommendations (no external validation)
- High risk: Task approach was flagged by an adapted recommendation requiring workaround

This is an informational dimension — it surfaces tasks where the project's conventions deliberately diverge from industry norms (which is fine, but worth noting for reviewer awareness).
```

### 5.8 — Add invariant supremacy rule to ALL modified agents

For every agent modified in 5.1–5.7, add this rule in a prominent position:

```markdown
## Invariant Supremacy

**Policy invariants ALWAYS take precedence over meta-knowledge and internet-sourced recommendations.** This is non-negotiable.

- If a pattern from `knowledge-brief.json` conflicts with an invariant → discard the pattern
- If a research recommendation from `research-brief.json` conflicts with an invariant → discard the recommendation
- If a style evolution conflicts with an invariant → discard the style evolution
- The research-brief's invariant gate should catch most conflicts, but some may slip through — you are the second line of defense

When discarding, note the discard with the conflicting INV-* ID in your output artifacts for audit trail purposes.
```

---

## Graceful Degradation Rules

All modifications must handle missing briefs/skill files:

```markdown
### Missing artifact handling

- If `.docwriter/knowledge-brief.json` does not exist → skip all meta-knowledge steps, proceed normally
- If `.docwriter/research-brief.json` does not exist → skip all research recommendation steps, proceed normally
- If `.github/skills/docwriter-meta/references/*.md` contain placeholder text → skip skill consultation, proceed normally
- **Never error on missing optional artifacts** — these are enhancements, not requirements
```

This rule is added to every modified agent.

---

## Acceptance Criteria

- [ ] All 7 agents modified with additional input artifact references
- [ ] Task-planner inlines patterns + research recommendations as acceptance criteria
- [ ] Content-writer cites pattern IDs and REC-NNN IDs in writer-output.json
- [ ] Style-reviewer checks anti-patterns and style evolutions as supplementary criteria
- [ ] Accuracy-reviewer verifies research recommendation compliance
- [ ] Gap-hunter uses historical failure modes as hunting criteria
- [ ] Impact-mapper creates research-driven impacts (at medium priority)
- [ ] Risk-analyzer includes research alignment dimension
- [ ] Invariant supremacy rule present in ALL modified agents
- [ ] Graceful degradation: all agents work normally when briefs/skills are missing
- [ ] No existing agent behavior is broken — all changes are additive
