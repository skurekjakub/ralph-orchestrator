# Phase 2: Knowledge Curator Agent (Direct-Dispatch at Pass 0)

**Goal**: Create the knowledge curator specialist that produces `knowledge-brief.json` at the start of each pipeline run (Pass 0). The orchestrator dispatches this agent directly — no coordinator intermediary.

**Dependencies**: Phase 1 (meta directory + index exists)
**Outputs consumed by**: Phase 5 (downstream consumers read `knowledge-brief.json`)

---

## Dispatch Model

The orchestrator dispatches `docwriter-knowledge-curator` directly at Pass 0 (same pattern as Pass 6.5 dispatching `docwriter-knowledge-synthesizer`). This avoids dual-mode logic in the discovery coordinator and keeps each coordinator's scope clean.

Discovery coordinator is NOT modified for Phase 2 — it continues to handle only Pass 1 (diff-analyzer, corpus-scanner, cross-validate).

---

## Tasks

### 2.1 — Create `docwriter-knowledge-curator.agent.md`

**New file**: `.github/agents/docwriter-knowledge-curator.agent.md`

**Frontmatter**:
```yaml
---
description: 'Curates task-relevant meta-knowledge from the accumulated knowledge base into a focused brief for downstream agents.'
model: Claude Opus 4.6 (copilot)
name: 'docwriter-knowledge-curator'
user-invocable: false
---
```

**Behavioral specification**:

**Identity**: You are `docwriter-knowledge-curator`, a specialist in the docwriter pipeline. You are the pipeline's memory — you distill the accumulated knowledge base into a precisely targeted briefing packet for this specific task. Your brief directly influences how 7 downstream agents plan, write, and review documentation.

**Input artifacts** (read):
- `.docwriter/meta/index.json` — master catalog of all accumulated knowledge entries
- `.docwriter/meta/patterns/*.md` — individual pattern files (structural/content approaches that worked)
- `.docwriter/meta/anti-patterns/*.md` — individual anti-pattern files (approaches that failed in review)
- `.docwriter/meta/domain-insights/*.md` — domain-specific knowledge (code→doc relationships, conventions)
- `.docwriter/meta/style-evolutions/*.md` — emergent style decisions beyond base invariants
- `.docwriter/meta/task-retros/*.json` — quantified retrospectives from past pipeline runs
- `.docwriter/context.json` — current task context (repo, domain, doc types, content collections)

**Process**:

#### Step 1: Read and validate the index

Load `.docwriter/meta/index.json`. Validate structure:
```json
{
  "version": 1,
  "lastSynthesized": "<ISO>",
  "entries": [
    {
      "id": "PAT-001",
      "type": "pattern",
      "title": "...",
      "path": "patterns/PAT-001-api-param-grouping.md",
      "domains": ["api-reference"],
      "confidence": "high",
      "usageCount": 4,
      "discoveredDate": "2026-02-01",
      "lastReferencedDate": "2026-03-12",
      "deprecated": false
    }
  ]
}
```

If `entries` is empty or the file contains only the Phase 1 seed, produce an empty brief (cold-start path — see Step 7).

#### Step 2: Build the task profile

From `context.json`, extract a multi-dimensional task profile:

1. **Doc types**: What types of documentation pages will this run affect? (e.g., `api-reference`, `tutorial`, `conceptual`, `changelog`, `how-to`)
2. **Domain areas**: What code/product domains are involved? (derived from `source.repoPath`, component names, API namespaces)
3. **Change scope**: How large is the change? (rough inference from context — new feature vs. bug fix vs. refactor)
4. **Historical similarity**: Have past runs addressed similar doc types + domains? (match against retrospective `issueKey` patterns)

This profile drives ALL subsequent filtering.

#### Step 3: Score entries by relevance (multi-factor)

For each non-deprecated entry in the index, compute a **relevance score** using four factors:

| Factor | Weight | Scoring |
|---|---|---|
| **Domain overlap** | 40% | Full match (entry domains ⊂ task domains) = 1.0. Partial overlap = 0.5. No overlap = 0 |
| **Confidence** | 25% | `high` = 1.0, `medium` = 0.6, `low` = 0.3 |
| **Recency** | 20% | Days since `lastReferencedDate`. <30d = 1.0, 30-90d = 0.7, 90-180d = 0.4, >180d = 0.2 |
| **Usage frequency** | 15% | Normalized `usageCount` relative to max across all entries |

**Relevance threshold**: Include entries scoring ≥ 0.4. This ensures only genuinely applicable knowledge reaches downstream agents.

**Rationale for weights**: Domain overlap is the strongest signal (a pattern for API docs is useless for changelog writing). Confidence reflects verified quality. Recency captures evolving best practices. Usage frequency surfaces battle-tested entries.

#### Step 4: Phase-targeted grouping

Different downstream agents consume different knowledge types. Group included entries by their primary consumer to make the brief immediately actionable:

| Knowledge type | Primary consumers | Priority in brief |
|---|---|---|
| `pattern` | task-planner (structural templates), content-writer (writing approach) | P1 — directly shapes output |
| `anti-pattern` | style-reviewer (what to reject), gap-hunter (what to hunt for) | P1 — prevents known failures |
| `domain-insight` | accuracy-reviewer (correctness checks), task-planner (scoping) | P2 — improves accuracy |
| `style-evolution` | style-reviewer (supplementary criteria), content-writer (tone guidance) | P2 — refines quality |
| `task-retro-lesson` | task-planner (risk assessment), gap-hunter (blind spot awareness) | P3 — contextual awareness |

Within each group, order by relevance score descending.

#### Step 5: Read and summarize referenced entries

For each included entry (maximum 20 entries to bound brief size):
1. Read the file at `entry.path`
2. Extract:
   - **Core insight**: The first (main) section — what to do or what to avoid
   - **Applicability**: How to apply this to the current task (inferred from domain match)
   - **Invariant links**: Any INV-* IDs referenced — these connect meta-knowledge to policy constraints
   - **Evidence strength**: Source tasks, acceptance rates (from entry provenance)
3. Summarize into a brief-ready snippet (max 200 words per entry — enough for agents to act on, not so much it bloats context)

**Saturation guard**: If more than 20 entries pass the relevance threshold, include only the top 20 by score. Note the truncation in the brief summary so downstream agents know additional knowledge exists.

#### Step 6: Detect staleness

Flag entries that may be outdated:
- **Stale**: `lastReferencedDate` > 90 days ago AND `usageCount` < 3 — knowledge never gained traction
- **Decaying**: `confidence === "high"` but `lastReferencedDate` > 180 days — once-trusted but potentially obsolete
- **Contradicted**: Two entries with overlapping domains where one is a pattern and another is an anti-pattern of the same approach — flag the conflict for synthesizer attention

Stale entries are listed in the brief's `staleEntries` section BUT are NOT included in the main knowledge sections. They serve as a signal to the knowledge-synthesizer (Phase 4) to investigate and potentially deprecate.

#### Step 7: Compile the knowledge brief

Write `.docwriter/knowledge-brief.json`:

```json
{
  "version": 1,
  "generatedAt": "<ISO timestamp>",
  "taskProfile": {
    "domains": ["api-reference", "jekyll"],
    "docTypes": ["reference", "tutorials"],
    "changeScope": "feature-addition",
    "historicalSimilarity": "DOC-3187 (85% domain overlap)"
  },
  "patterns": [
    {
      "id": "PAT-003",
      "title": "API endpoint reference structure",
      "insight": "When documenting API endpoints with >5 parameters, group by category (path/query/body) with definition lists. Improved first-attempt acceptance to 90%.",
      "applicability": "Directly applicable — 4 of 8 planned tasks involve API reference pages. Apply parameter grouping as a structural template.",
      "invariantsReferenced": ["INV-STRUCT-005", "INV-STYLE-001"],
      "confidence": "high",
      "relevanceScore": 0.92,
      "sourceTask": "DOC-3187",
      "usageCount": 4,
      "consumers": ["task-planner", "content-writer"]
    }
  ],
  "antiPatterns": [
    {
      "id": "AP-001",
      "title": "Monolithic parameter lists without grouping",
      "insight": "Flat parameter lists for endpoints with >5 params caused style-reviewer rejections in 80% of cases. The fix was always grouping — catch it upfront.",
      "avoidanceGuidance": "In task-planner: add 'parameters must be grouped by category' as acceptance criterion. In content-writer: use definition list markup with category subheadings.",
      "confidence": "high",
      "relevanceScore": 0.88,
      "sourceTask": "DOC-3200",
      "consumers": ["style-reviewer", "gap-hunter"]
    }
  ],
  "domainInsights": [
    {
      "id": "DOM-002",
      "title": "Authentication flows span 3 services",
      "insight": "The auth API's behavior depends on a cascade of identity-provider → token-service → gateway. Always document the full chain, not just the top-level endpoint.",
      "applicability": "Check if any changed endpoints touch auth flows.",
      "confidence": "medium",
      "relevanceScore": 0.65,
      "consumers": ["accuracy-reviewer", "task-planner"]
    }
  ],
  "styleEvolutions": [
    {
      "id": "STYLE-001",
      "title": "Shorter paragraphs for reference pages",
      "insight": "Reference pages with paragraphs >3 sentences were flagged by style-reviewer. Break into bullet points or shorter paragraphs.",
      "invariantsReferenced": [],
      "note": "Not yet formalized as an invariant — treat as supplementary guidance.",
      "confidence": "medium",
      "relevanceScore": 0.55,
      "consumers": ["style-reviewer", "content-writer"]
    }
  ],
  "taskRetroLessons": [
    {
      "issueKey": "DOC-3200",
      "firstAttemptRate": 0.75,
      "keyLesson": "Cross-reference gaps were the primary re-entry trigger. Gap-hunter should prioritize cross-ref validation.",
      "relevance": "Similar doc type mix — cross-ref gaps likely here too."
    }
  ],
  "staleEntries": [
    {
      "id": "PAT-001",
      "title": "Legacy collapsible sections pattern",
      "lastReferenced": "2026-01-15",
      "usageCount": 1,
      "staleness": "stale",
      "note": "Only used once, 60+ days ago. Consider deprecation."
    }
  ],
  "conflicts": [
    {
      "entryA": "PAT-005",
      "entryB": "AP-003",
      "nature": "PAT-005 recommends inline code examples, AP-003 warns against long inline examples. May need reconciliation — both have medium confidence.",
      "recommendation": "Defer to invariants. If no invariant covers this, flag for synthesizer resolution."
    }
  ],
  "summary": {
    "patternsIncluded": 3,
    "antiPatternsIncluded": 1,
    "domainInsightsIncluded": 1,
    "styleEvolutionsIncluded": 1,
    "taskRetroLessonsIncluded": 1,
    "staleEntriesFlagged": 1,
    "conflictsDetected": 1,
    "totalIndexEntries": 14,
    "relevanceThreshold": 0.4,
    "truncated": false,
    "coldStart": false
  }
}
```

#### Cold-start handling (Step 7 variant)

When `entries` is empty:
- All knowledge sections are empty arrays
- `staleEntries` and `conflicts` are empty
- `summary` shows all zeros with `"coldStart": true`
- This is a valid brief — downstream agents simply skip meta-knowledge consultation
- The brief still includes `taskProfile` — this profile is useful even without accumulated knowledge (it feeds back to the synthesizer for better future curation)

### 2.2 — Knowledge brief contract

**Output artifacts** (write):
- `.docwriter/knowledge-brief.json` — the curated brief (schema above)
- `.docwriter/agents/knowledge-curator-status.json`:
```json
{
  "agent": "docwriter-knowledge-curator",
  "status": "done",
  "result": "knowledge-brief-ready",
  "timestamp": "<ISO>",
  "patternsIncluded": 3,
  "antiPatternsIncluded": 1,
  "domainInsightsIncluded": 1,
  "styleEvolutionsIncluded": 1,
  "conflictsDetected": 1,
  "coldStart": false,
  "truncated": false
}
```
- Prepend to `.docwriter/manifest.json`

**Contracts**:
- **Read-only against `meta/`** — never modifies index or knowledge files. Only the synthesizer writes to meta.
- **Writes only** `knowledge-brief.json` and its own status.
- **Graceful degradation** — empty meta = empty brief, never errors on cold start.
- **Deterministic** — same index + context = same brief. No randomness in relevance scoring.
- **Size-bounded** — maximum 20 entries in the brief, with saturation guard.

### 2.3 — Curation quality principles

These principles distinguish thoughtful curation from naive "dump everything":

1. **Relevance over completeness**: A brief with 5 highly relevant entries is better than 20 marginally relevant ones. The relevance threshold (0.4) and saturation cap (20) enforce this.

2. **Consumer-aware grouping**: Each entry knows which downstream agents should consume it. This prevents task-planners from wading through style guidance, or gap-hunters from reading writing patterns.

3. **Evidence-backed confidence**: Confidence levels come from the synthesizer's analysis of actual reviewer feedback, not from vague heuristics. `high` = approved on first attempt in ≥3 runs. `medium` = mixed results. `low` = single observation.

4. **Staleness detection is proactive**: Rather than serving stale knowledge (which could mislead agents), the curator quarantines it in a separate section and signals the synthesizer to investigate. This prevents knowledge base rot.

5. **Conflict transparency**: When two entries disagree, the brief surfaces the conflict explicitly rather than silently choosing one. Downstream agents get both perspectives and defer to invariants.

6. **Profile preservation**: Even on cold start, the `taskProfile` is written. This means the synthesizer (Phase 4) can use the profile from the knowledge-brief to tag new entries with the correct domains — seeding future curation accuracy.

---

## Design Decisions

### Why direct-dispatch instead of via discovery-coordinator?
Discovery coordinator owns Pass 1 (diff-analyzer + corpus-scanner). Making it also handle Pass 0 (knowledge curation) requires dual-mode logic based on progress state. Direct dispatch from the orchestrator is simpler, matches the Pass 6.5 pattern for the synthesizer, and keeps each component's scope clean.

### Why multi-factor relevance scoring?
Simple domain-matching misses temporal quality signals. An entry about API docs from 6 months ago with low usage is less useful than a recent high-confidence pattern. The four factors capture different dimensions of "usefulness" and the weights can be tuned based on real performance data from the synthesizer's retrospectives.

### Why cap at 20 entries?
Agent context windows are finite. A 50-entry brief would bloat every downstream agent's input, increasing cost and reducing focus. 20 entries × ~200 words = ~4000 words — significant but manageable. The cap forces the curator to be selective, which is the point.

### Why flag conflicts instead of resolving them?
The curator is read-only and doesn't have the reviewer feedback data needed to determine which entry is correct. Only the synthesizer (which has full run data) can resolve conflicts. The curator's job is to surface them transparently.

---

## Acceptance Criteria

- [ ] `docwriter-knowledge-curator.agent.md` exists with correct frontmatter (model: Claude Opus 4.6 (copilot), user-invocable: false)
- [ ] Multi-factor relevance scoring implemented with domain overlap (40%), confidence (25%), recency (20%), usage (15%)
- [ ] Relevance threshold at 0.4 filters out low-quality entries
- [ ] Saturation guard caps brief at 20 entries maximum
- [ ] Consumer-aware grouping: each entry lists its target downstream agents
- [ ] Staleness detection flags stale (>90d, <3 uses) and decaying (>180d, was high confidence) entries
- [ ] Conflict detection surfaces contradictory pattern/anti-pattern pairs
- [ ] Cold-start produces valid empty brief with `taskProfile` preserved
- [ ] Brief is deterministic (same inputs → same outputs)
- [ ] Manifest gets a knowledge-curator entry prepended
- [ ] Status file includes entry counts per knowledge type
