# Phase 3: Research Scout Agent + Analysis Coordinator Wiring

**Goal**: Create the research scout specialist that fetches internet documentation best practices and filters them through policy invariants, producing `research-brief.json`. Wire it into the analysis coordinator to run parallel with code-analyzer during Pass 2.

**Dependencies**: Phase 1 (research-sources.json seed exists)
**Outputs consumed by**: Phase 5 (downstream consumers read `research-brief.json`)

---

## Tasks

### 3.1 — Create `docwriter-research-scout.agent.md`

**New file**: `.github/agents/docwriter-research-scout.agent.md`

**Frontmatter**:
```yaml
---
description: 'Researches latest documentation best practices from curated internet sources and filters recommendations through policy invariants.'
model: Claude Opus 4.6 (copilot)
name: 'docwriter-research-scout'
user-invocable: false
---
```

**Behavioral specification**:

**Identity**: You are `docwriter-research-scout`, a specialist in the docwriter pipeline. You consult external documentation best practice sources to surface actionable recommendations for the current task, while rigorously filtering everything through the project's policy invariants.

**Input artifacts** (read):
- `.docwriter/change-inventory.json` — what code areas are changing
- `.docwriter/doc-index.json` — what doc types/pages are affected
- `.docwriter/invariant-inventory.json` — policy constraints (the supreme authority)
- `.docwriter/context.json` — domain/product context
- `.docwriter/meta/research-sources.json` — curated source list

**Process**:

1. **Derive research queries**. Analyze the change inventory and doc index to identify:
   - Doc types being written/updated (API reference, tutorials, how-to, conceptual, changelog)
   - Technical domains (e.g., authentication, routing, content management)
   - Cross-cutting concerns (accessibility, internationalization, progressive disclosure)
   - Formulate 3-8 targeted queries (not too broad, not too narrow)

2. **Fetch sources**. For each query:
   - First consult curated sources from `research-sources.json` — use `fetch` tool against listed URLs
   - If curated sources lack coverage for a doc type, derive supplementary queries for general best practice search
   - Extract actionable content — skip marketing pages, product pitches, paywalled content
   - Record: URL, title, date fetched, content summary

3. **Extract recommendations**. From fetched content, identify:
   - Structural patterns (how to organize sections, heading hierarchy)
   - Content patterns (what to include/exclude for this doc type)
   - Readability practices (sentence length, active voice, progressive disclosure)
   - Accessibility practices (alt text, heading structure, link text)
   - Each recommendation gets a unique `REC-NNN` ID

4. **Invariant gate** (CRITICAL STEP). For EVERY recommendation:
   a. Load `.docwriter/invariant-inventory.json` fully
   b. Cross-reference the recommendation against ALL invariants
   c. Classify:
      - **`approved`**: Compatible with all relevant invariants. List compatible INV-* IDs.
      - **`blocked`**: Directly contradicts one or more invariants. Tag with `blockedBy: "INV-xxx"` and explain the conflict. **Do NOT include blocked recommendations in the downstream-facing list.**
      - **`adapted`**: Partially compatible — the core insight is valid but the specific implementation conflicts. Describe the required adaptation that makes it invariant-compliant.
   d. When in doubt, classify as `blocked`. **Invariants always win.**

5. **Produce research brief**. Write `.docwriter/research-brief.json`:

```json
{
  "version": 1,
  "timestamp": "<ISO>",
  "queriesExecuted": [
    "API reference page structure best practices",
    "tutorial writing methodology Diátaxis",
    "changelog writing standards semantic versioning"
  ],
  "sourcesConsulted": [
    {
      "url": "https://developers.google.com/style/api-reference-comments",
      "title": "API reference comments — Google developer documentation style guide",
      "sourceId": "SRC-001",
      "retrievedAt": "<ISO>",
      "useful": true
    }
  ],
  "recommendations": [
    {
      "id": "REC-001",
      "topic": "API reference parameter documentation",
      "recommendation": "List all parameters in a definition list with type, required/optional status, default value, and description. Group by category (path, query, body).",
      "source": "https://developers.google.com/style/api-reference-comments",
      "sourceId": "SRC-001",
      "status": "approved",
      "applicableTo": ["api-reference"],
      "invariantCheck": {
        "compatible": ["INV-STRUCT-005", "INV-STYLE-001"],
        "noConflict": true
      }
    },
    {
      "id": "REC-002",
      "topic": "Use second person throughout",
      "recommendation": "Always address the reader as 'you' in tutorials and guides.",
      "source": "https://developers.google.com/style/person",
      "sourceId": "SRC-001",
      "status": "blocked",
      "blockedBy": "INV-PERSONA-002",
      "blockReason": "Persona voice guidelines require third-person for architect audience segments. Cannot universally mandate second person."
    },
    {
      "id": "REC-003",
      "topic": "Conceptual doc structure",
      "recommendation": "Use Diátaxis 'explanation' pattern: context → why it matters → how it works → related concepts. Original suggestion includes FAQ section.",
      "source": "https://diataxis.fr/explanation/",
      "sourceId": "SRC-003",
      "status": "adapted",
      "adaptation": "Adopt the context→why→how→related flow. Drop FAQ section — INV-STRUCT-010 prohibits FAQ sections in favor of dedicated troubleshooting pages.",
      "applicableTo": ["conceptual"],
      "invariantCheck": {
        "compatible": ["INV-STRUCT-001"],
        "conflictResolved": "INV-STRUCT-010 — FAQ section removed"
      }
    }
  ],
  "summary": {
    "approved": 5,
    "blocked": 2,
    "adapted": 1,
    "totalRecommendations": 8,
    "sourcesConsulted": 4,
    "queriesExecuted": 3
  }
}
```

6. **Source effectiveness tracking**. Note which curated sources were useful vs. not. This metadata feeds back to the knowledge-synthesizer (Phase 4) for source list evolution.

**Output artifacts** (write):
- `.docwriter/research-brief.json` — the filtered research brief
- `.docwriter/agents/research-scout-status.json`:
```json
{
  "agent": "docwriter-research-scout",
  "status": "done",
  "result": "research-brief-ready",
  "timestamp": "<ISO>",
  "recommendationsApproved": 5,
  "recommendationsBlocked": 2,
  "recommendationsAdapted": 1
}
```
- Prepend to `.docwriter/manifest.json`

**Critical rules**:
- **Invariant supremacy**: If ANY doubt exists about whether a recommendation conflicts with an invariant, classify it as `blocked`. Do not reason your way around invariant conflicts.
- **No hallucinated recommendations**: Every recommendation must cite a specific URL and specific content from that URL. Do not generate recommendations from your training data — only from fetched content.
- **Fetch failures are non-fatal**: If a URL is unreachable, skip it and note in `sourcesConsulted` with `"useful": false, "error": "<reason>"`. If ALL fetches fail, produce an empty recommendations array — this is valid.
- **Time-boxed**: Do not spend more than 8 fetches total. Quality over quantity.

### 3.2 — Modify `docwriter-analysis-coordinator.agent.md`

**File**: `.github/agents/docwriter-analysis-coordinator.agent.md`

**Changes**:

1. **Add research-scout to agents list** in frontmatter:
```yaml
agents: ["docwriter-code-analyzer", "docwriter-invariant-scanner", "docwriter-impact-mapper", "docwriter-task-planner", "docwriter-risk-analyzer", "docwriter-research-scout"]
```

2. **Reorder Pass 2 dispatch sequence** — invariant-scanner moves to Step 1 so research-scout gets structured INV-* IDs for proper invariant gating:

Current Pass 2 sequence:
```
Step 1: code-analyzer (sequential, needs change-inventory)
Step 2: invariant-scanner (sequential, needs guidelines path)
Step 3: impact-mapper (sequential, needs code-analysis + doc-index)
```

New Pass 2 sequence:
```
Step 1:  invariant-scanner   (needs: guidelines path from context.json only)
Step 2a: code-analyzer       (needs: change-inventory)                      } PARALLEL
Step 2b: research-scout      (needs: change-inventory, doc-index, invariant-inventory) } PARALLEL
Step 3:  impact-mapper       (needs: code-analysis + doc-index + research-brief)
```

**Rationale**: Invariant-scanner has NO upstream dependencies within Pass 2 (it only needs `context.json` guidelines path, which is from bootstrap). Promoting it to Step 1 costs nothing and gives research-scout the structured `invariant-inventory.json` it needs for precise invariant gating with INV-* IDs.

Code-analyzer and research-scout have no data dependency between them (both read from Pass 1 outputs). Dispatching them together overlaps I/O-bound work (URL fetches) with CPU-bound work (code analysis).

3. **Add research-scout failure handling**: Research-scout failure is non-blocking. If it fails:
   - Log a warning
   - Set `researchBriefAvailable: false` in coordinator status
   - Proceed with pipeline (downstream agents check for brief existence before reading)

4. **Update Pass 2 completion** to include research-scout stats in `progress.json`:
```json
"counts": {
  "researchRecommendationsApproved": 5
}
```

### 3.3 — Research-sources.json schema

**File**: `.docwriter/meta/research-sources.json` (seeded in Phase 1)

Schema for source entries — documenting for future evolution by knowledge-synthesizer:

```json
{
  "id": "SRC-NNN",
  "name": "Human-readable source name",
  "url": "https://...",
  "domains": ["style", "api-reference", ...],
  "addedBy": "bootstrap | knowledge-synthesizer",
  "addedDate": "<ISO>",
  "usageCount": 0,
  "lastUsed": null,
  "effectiveness": null,
  "deprecated": false
}
```

`effectiveness` is updated by knowledge-synthesizer after observing whether recommendations from this source were actually useful downstream.

---

## Design Decisions

### Why parallel with code-analyzer and not sequential?
Research scout fetches external URLs which has latency. Running it parallel with code-analyzer (which does filesystem reads) overlaps I/O-bound work with CPU-bound work. Neither depends on the other's output.

### Why invariant-scanner before research-scout?
The research scout's core value proposition is invariant-filtered recommendations. Using raw guidelines (Option B) would produce less precise filtering — the invariant-scanner's structured `INV-*` IDs enable exact conflict identification. Worth the slight reorder.

### Why non-blocking?
Internet fetches can fail (network issues, URL changes, rate limiting). The pipeline must work without internet access — research recommendations are an enhancement, not a requirement.

### Why cap at 8 fetches?
Token budget and latency constraint. Each fetch → extract → filter cycle costs tokens. 8 fetches provide good coverage across doc types without bloating the agent's context.

---

## Acceptance Criteria

- [ ] `docwriter-research-scout.agent.md` exists with correct frontmatter
- [ ] Research scout reads from `research-sources.json` + derives queries from change-inventory/doc-index
- [ ] Every recommendation has an `invariantCheck` with explicit compatible/blocked/adapted status
- [ ] Blocked recommendations are excluded from downstream-facing list
- [ ] Analysis coordinator dispatches invariant-scanner BEFORE code-analyzer + research-scout
- [ ] Code-analyzer and research-scout dispatched in parallel by analysis coordinator
- [ ] Research-scout failure is non-blocking (pipeline continues with warning)
- [ ] `progress.json` tracks `researchRecommendationsApproved` count
- [ ] Fetch failures produce valid empty brief, not errors
