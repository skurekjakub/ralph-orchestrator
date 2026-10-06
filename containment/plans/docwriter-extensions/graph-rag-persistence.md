# Docwriter Graph-RAG Meta-Knowledge Persistence

**Goal:** Replace the flat-file-only `.docwriter/meta/` convention with a tiered persistence model where meta-knowledge is **also gradually ingested** into the existing Ralphchives graph-RAG pipeline, giving the docwriter family cross-session semantic memory with entity relationship awareness.

## Landscape Summary (2025–2026)

| System | Stars | Core Idea | Relevance |
|---|---|---|---|
| **Microsoft GraphRAG** (v3.0.6) | 31k | Hierarchical: text units → entity extraction → Leiden clustering → community summaries → Global/Local/DRIFT search | Heavy indexing, designed for corpus-level analysis. Community summaries are the unique feature. Python-only. |
| **LightRAG** (v1.4.11, EMNLP 2025) | 29k | Lightweight: entity–relationship extraction → dual-level retrieval (graph + vector). Incremental `ainsert()`, workspace isolation, reranking, entity merging. Neo4j/PG/Milvus storage. | Close to what Ralphchives already does. Incremental insert pattern is relevant. Python. |
| **Mem0** (v1.0.5) | 50k | Agent memory layer: multi-level (user/session/agent), auto-extraction from conversations, `memory.add(messages)` → `memory.search()`. Neo4j graph memory backend. | Conceptually closest to what we need (persistent agent memory). Python + TypeScript SDKs. |
| **Cognee** | 14k | `.add` → `.cognify` (KG + embeddings) → `.search` (hybrid) → `.memify` (enrichment pipelines). Modular tasks/pipelines/datapoints. | `.memify` enrichment concept is interesting — derived knowledge from existing graph. |
| **Ralphchives** (existing) | — | NodeBB → sync daemon → Neo4j (entity extraction + bge-m3 embeddings). MCP tools for read/write. Per-profile isolation. | **Already running in this workspace.** Incremental sync every 5 min. Full MCP integration. |

### Key Takeaway

Ralphchives already implements the core pattern that LightRAG/Mem0/Cognee provide: incremental ingestion → graph projection → entity extraction → vector embedding → hybrid retrieval. **Building a new pipeline would be redundant.** The correct approach is to integrate the docwriter meta-knowledge loop with Ralphchives, adding docwriter-specific enrichments to the existing pipeline.

What Ralphchives currently lacks (deferred in its own architecture doc):
- Community detection + Leiden clustering (deferred until 100+ topics)
- LLM-generated community summaries (depends on community detection)
- Entity resolution / fuzzy dedup (Phase 2)
- `consult_the_archives` deep GraphRAG query (deferred until graph has enough data)

These become natural future enhancements as the docwriter accumulates entries.

---

## Three-Tier Persistence Architecture

```
                        ┌──────────────────────────────────────────────────────┐
 TIER 1 (working memory) │  .docwriter/meta/  (flat files, host-mounted volume) │
   Fast, local, session  │  knowledge-brief.json, index.json, entry files      │
                        └──────────────┬───────────────────────────────────────┘
                                       │ knowledge-integrator
                                       │ writes BOTH tiers
                        ┌──────────────▼───────────────────────────────────────┐
 TIER 2 (graph memory)  │  Ralphchives (NodeBB → Neo4j + vector indexes)       │
   Semantic, persistent, │  post_observation / post_task_report → sync daemon  │
   cross-session         │  → embedding + entity extraction → graph projection │
                        └──────────────┬───────────────────────────────────────┘
                                       │ sync daemon (5 min cadence)
                        ┌──────────────▼───────────────────────────────────────┐
 TIER 3 (future)        │  Community summaries, entity resolution, deep query  │
   Deferred until volume │  Leiden clustering → auto-generated "pattern guides" │
                        └──────────────────────────────────────────────────────┘
```

### Why Dual-Write (Tier 1 + Tier 2)?

- **Tier 1** = fast, no network, available immediately within the same session. The knowledge-curator reads flat files during Pass 0, before any MCP call latency. Works offline / without Ralphchives enabled.
- **Tier 2** = semantic search across ALL historical entries (not just the top 20 from index.json), entity relationships ("what concepts tend to co-occur with this API?"), survives repo checkouts and branch switches, queryable with natural language.
- **Degraded mode**: If `ralphchives.enabled === false` in config.json, the system falls back to Tier 1 only. No code path breaks.

---

## Integration Points

### 1. Knowledge-Integrator → Ralphchives Write (Tier 2 Ingestion)

After writing entries to `.docwriter/meta/` flat files (Tier 1), the `knowledge-integrator` calls Ralphchives MCP write tools to persist each new meta-knowledge entry as a NodeBB topic:

| MCP Tool | When Used | Content |
|---|---|---|
| `post_task_report` | End of synthesis pipeline | Structured task report: issue key, variant, completion status, PR URL, files changed + freeform synthesis commentary (patterns discovered, anti-patterns flagged, style decisions made) |
| `post_observation` | Per high-confidence meta-entry | Individual meta-knowledge entries as standalone observations: the pattern, its confidence level, supporting evidence, domain scope |

The sync daemon then automatically:
1. Fetches new NodeBB topics (5 min cadence)
2. MERGEs structural data into Neo4j graph
3. Generates bge-m3 embeddings (1024 dims)
4. Extracts entities via gemma3:8b (7 types: concept, product, error, feature, version, library, person)
5. Links entity co-occurrences via RELATED_TO edges

### 2. Knowledge-Curator → Ralphchives Read (Tier 2 Retrieval)

The knowledge-curator's 7-step curation process gains an additional pre-step:

**Step 0 (new): Graph memory retrieval**
Before scanning flat `index.json`, the curator calls `search_ralphchives` with a query derived from `{{ taskTitle }}` + `{{ taskDescription }}`. This returns semantically similar entries from ALL prior sessions (not limited to what's in the local meta/ directory). The curator merges these with local results, deduplicating by entry ID.

This gives the curator:
- **Breadth**: Entries from tasks that ran before this container's meta/ was initialized
- **Semantic relevance**: Vector similarity search instead of keyword matching on index.json
- **Relationship context**: "This API pattern was also seen with X and Y concepts" (from entity co-occurrence graph)

### 3. NodeBB Category Setup

Docwriter gets its own NodeBB category in the Ralphchives category tree:

```
Ralphchives/
  ralph-docs/         ← existing
    Task Reports/
    Observations/
  ralph-vscode/       ← existing
  ralph-docwriter/    ← NEW
    Task Reports/     ← knowledge-integrator writes here via post_task_report
    Observations/     ← knowledge-integrator writes individual entries via post_observation
```

Created by `scripts/sync-profiles.mjs` (existing script that handles incremental profile sync). Each variant gets its own API token via `NODEBB_TOKEN_RALPH_DOCWRITER_<VARIANT>` env var pattern (existing convention).

### 4. MCP Server Declarations

Add to `profile.json` `mcpServers` (profile-level, not variant-level — all variants get graph memory):

```json
{
  "name": "ralphchives-write",
  "env": {
    "NODEBB_CATEGORY_ID": "$variantEnv.DOCWRITER_CATEGORY_ID",
    "NODEBB_API_TOKEN": "$variantEnv.NODEBB_TOKEN"
  }
},
{
  "name": "ralphchives-read",
  "env": {
    "NODEBB_CATEGORY_ID": "$variantEnv.DOCWRITER_CATEGORY_ID",
    "NODEBB_API_TOKEN": "$variantEnv.NODEBB_TOKEN"
  }
}
```

### 5. Agent Template Changes

**`docwriter-knowledge-integrator.agent.md`** — New section:

```markdown
{% if mcpServers contains 'ralphchives-write' %}
## Graph Memory Persistence

After writing each meta-knowledge entry to `.docwriter/meta/`, ALSO persist it
to the graph memory via MCP tools:

- For the overall task synthesis → call `post_task_report` with structured summary
- For each HIGH or VERY_HIGH confidence entry → call `post_observation` with:
  - Title: `[{{ taskId }}] {category}: {entry title}`
  - Body: Entry content, confidence level, supporting evidence
  - Tags: `{{ taskId }}`, category name, domain concepts

This ensures the entry survives across sessions and becomes semantically searchable.
Skip graph persistence for LOW confidence entries (reduce noise in the graph).
{% endif %}
```

**`docwriter-knowledge-curator.agent.md`** — New pre-step:

```markdown
{% if mcpServers contains 'ralphchives-read' %}
## Step 0: Graph Memory Retrieval

Before scanning local `.docwriter/meta/index.json`, query the graph memory:

1. Call `search_ralphchives` with query: "{{ taskTitle }} {{ taskDescription | truncate: 200 }}"
2. Review returned entries for relevance to the current task
3. Merge relevant graph results with local meta/ entries
4. Deduplicate — if a graph entry matches a local entry (same issue key + category), prefer the local one (may be more recent)

This gives you cross-session context that may not exist in the local meta/ directory.
{% endif %}
```

### 6. Shared Liquid Partial

New partial: `shared/agent-includes/docwriter/docwriter-graph-memory.md`

Contains instructions for how agents interact with graph memory — included by both knowledge-curator and knowledge-integrator templates via `{% render 'docwriter/docwriter-graph-memory' %}`.

---

## Future Enhancements (Tier 3, Deferred)

These become viable once the docwriter has accumulated 50–100+ entries in Ralphchives:

| Enhancement | Trigger | Benefit |
|---|---|---|
| **Community detection** (Leiden clustering) | 100+ topics in docwriter category | Auto-discover clusters of related knowledge (e.g., "API reference patterns", "migration guide strategies") |
| **Community summaries** | After clustering | Auto-generated "pattern guides" that the knowledge-curator can use as high-level context |
| **Entity resolution** | Ongoing, improves with volume | Merge duplicate entities (e.g., "REST API" ↔ "RESTful API" ↔ "REST endpoint") |
| **Deep GraphRAG query** (`consult_the_archives`) | Enriched graph with entities + communities | LLM-powered graph traversal answering complex questions like "What writing patterns have been most effective for API migration docs?" |
| **Docwriter-specific entity types** | When 7 base types aren't enough | Add: `style-rule`, `architecture-pattern`, `anti-pattern`, `domain-term`, `doc-section-type` to the entity extractor config |
| **`.memify`-style enrichment** (Cognee concept) | When patterns start repeating | Derived knowledge: "Pattern X supersedes Y", "Anti-pattern Z correlates with reviewer rejection" |

---

## Task Graph Updates

### Modified Tasks

| Task | Change |
|---|---|
| **O-005** | Add `ralphchives-read` and `ralphchives-write` to `mcpServers` in profile.json definition |
| **O-006** | Rewrite: dual-write strategy (Tier 1 local files + Tier 2 Ralphchives). Conditional on `ralphchives.enabled`. Volume mount still needed for Tier 1. |
| **O-008** | Add `docwriter-graph-memory.md` to shared Liquid partials list |
| **O-015** | Add Step 0 (graph memory retrieval) to knowledge-curator template, conditional on `ralphchives-read` MCP availability |
| **O-017** | Add graph persistence instructions to knowledge-integrator template, conditional on `ralphchives-write` MCP availability |
| **O-023** | Add `ralphchives-read` and `ralphchives-write` as profile-level MCP servers with `$variantEnv.*` macros |

### New Tasks

| Task | Phase | Title | Prerequisites | Description |
|---|---|---|---|---|
| **O-038** | A | Configure Ralphchives NodeBB category for docwriter | O-005 | Run `sync-profiles.mjs` to create `ralph-docwriter` category + subcategories in NodeBB. Generate per-variant API tokens. Add `NODEBB_TOKEN_RALPH_DOCWRITER_*` and `DOCWRITER_CATEGORY_ID` to `.env`. |
| **O-039** | A | Create `docwriter-graph-memory.md` shared partial | O-008 | Liquid partial with graph memory read/write instructions, included by curator and integrator templates. Conditional on `ralphchives-read`/`ralphchives-write` MCP availability. |
| **O-040** | D | Dry-run: verify Ralphchives integration cycle | O-031, O-038 | Write a test observation via `ralphchives-write` MCP tool → wait for sync daemon cycle → query via `ralphchives-read` MCP tool → verify entry is returned with embedding + entities. |
| **O-041** | D | Dry-run: verify degraded mode (Ralphchives disabled) | O-031 | Set `ralphchives.enabled: false` → verify knowledge-curator skips Step 0, knowledge-integrator skips graph persistence, pipeline completes with Tier 1 only. |
