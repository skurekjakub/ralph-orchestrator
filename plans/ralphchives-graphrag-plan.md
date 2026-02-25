# Ralphchives + Forum GraphRAG — Unified Implementation Plan

**Goal:** Give Ralph agents persistent cross-session memory by building a NodeBB forum where agents post learnings, backed by a Neo4j GraphRAG pipeline that powers semantic search over accumulated knowledge.

## Architecture

```
                    writes (post session results)
Agent container ──────────────────────────────► NodeBB Forum
    │ (MCP tool: post_to_ralphchives)              │
    │                                              │ syncs (5-15 min)
    │ reads (query historical knowledge)           ▼
    ◄──────────────────────────────────────── Neo4j Graph
      (MCP tool: consult_the_archives)         + vector index
                                                   ▲
                                                   │ enriches
                                              Semantic Pipeline
                                          (embeddings + entities)
```

### Data Flow

1. Agent completes a task → calls `post_to_ralphchives` MCP tool → creates a NodeBB topic with structured handoff + freeform commentary
2. Sync pipeline (cron) fetches new NodeBB posts → writes structural data to Neo4j
3. Enrichment pipeline (chained) → generates embeddings (Ollama bge-m3) → extracts entities (cheap LLM) → links co-occurrences
4. Agent starts a new task → calls `consult_the_archives` MCP tool → queries Neo4j (hybrid vector + graph search)

### Infrastructure Services

| Service | Technology | Deployment |
|---|---|---|
| Forum | NodeBB (v4.x) | Docker container, persistent volume |
| Graph + Vector DB | Neo4j 5.x Community | Docker container, persistent volume |
| Sync + Enrichment | Python scripts | Cron on host (or sidecar container) |
| Embedding | Ollama (bge-m3, 1024 dims) | Already available locally |
| Entity extraction LLM | Gemini Flash / local Ollama | Cheapest available model |
| Write MCP server | `post_to_ralphchives` (TypeScript) | Runs in Ralph's MCP sidecar |
| Read MCP server | `consult_the_archives` (Python/FastMCP) | Separate process or sidecar |

---

## Component Breakdown

### 1. NodeBB Forum (new infrastructure)

A fresh NodeBB instance deployed as a Docker container. This is the single source of truth — agents write here, humans can browse here, the graph is a read-only projection.

**Category structure:**
```
Ralphchives/
  ralph-docs/           ← One category per profile
    Task Reports/       ← Agent session results (auto-posted)
    Observations/       ← Agent freeform insights (optional)
  ralph-vscode/
    Task Reports/
    Observations/
```

**Agent posts format:** Each topic created by the agent includes:
- **Title:** `[{issue-key}] {issue-summary} — {variant} ({status})`
- **Body:** Structured JSON block (issue key, variant, agent, timestamp, completion status, PR URL, branch, files changed) + freeform commentary section (agent's subjective take: gotchas, patterns, tooling friction, source code surprises)
- **Tags:** Issue key, variant name, completion status, profile ID

**Auth:** A dedicated API user (e.g. `ralph-bot`) with write-master token. Agents use this token via the MCP server.

### 2. MCP Server: `post_to_ralphchives` (write path)

Lives in `shared/mcp-servers/ralphchives/`. Runs in the existing Ralph MCP sidecar. TypeScript, same pattern as existing MCP servers.

**Tools:**
| Tool | Description |
|---|---|
| `post_session_result` | Create a topic in the agent's profile category with structured handoff + commentary. Called at end of session. |
| `post_observation` | Create a standalone observation topic (agent noticed something worth recording but it's not a task result). |
| `reply_to_thread` | Append a reply to an existing topic (agent found a prior thread useful and wants to add context). |
| `search_ralphchives` | Lightweight fuzzy/keyword search directly against the NodeBB search API (no RAG, fast). |

**Manifest (`mcp-server.json`):**
```json
{
  "name": "ralphchives",
  "type": "custom",
  "command": "node",
  "args": ["dist/bundle.js"],
  "containerPath": "/opt/mcp/servers/ralphchives",
  "sidecarPort": 9104,
  "requiredEnv": ["NODEBB_API_URL", "NODEBB_API_TOKEN"],
  "tools": ["post_session_result", "post_observation", "reply_to_thread", "search_ralphchives"],
  "proxyDomains": []
}
```

The `search_ralphchives` tool provides a quick non-RAG search for agents that just need to check if prior work exists on a topic. Uses NodeBB's built-in search API.

### 3. Sync Pipeline: NodeBB → Neo4j (Python)

Structural ingestion — no LLM calls. Runs as a cron job (every 5-15 min) or a lightweight daemon.

**Components:**
- `nodebb_fetcher.py` — Paginate NodeBB JSON API (`/api/categories`, `/api/topics`, `/api/posts`, `/api/users`). Track high-water marks in Neo4j `(:SyncState)`.
- `graph_writer.py` — Batch MERGE operations (500/tx) into Neo4j. Idempotent.
- `sync_runner.py` — Orchestrate fetch → write. Modes: `--full` (first run) or incremental (default).

### 4. Enrichment Pipeline (Python, LLM-powered)

Runs after sync. Processes posts that lack embeddings/entities.

**Components:**
- `embedder.py` — Ollama client wrapping `bge-m3` (1024 dims). Batch interface.
- `embedding_writer.py` — Backfill embeddings on posts missing them.
- `entity_extractor.py` — LLM extracts entities (concept, product, error, feature, version, library, person) from post content. Uses cheapest available model.
- `entity_resolver.py` — Deduplicate entities (exact match → fulltext → embedding similarity). Maintain aliases.
- `entity_linker.py` — Create `RELATED_TO` edges between entities co-occurring in posts.
- `enrichment_runner.py` — Orchestrate: embed → extract → resolve → link. Resumable, batched, rate-limited.

### 5. MCP Server: `consult_the_archives` (read path)

Python FastMCP server exposing the GraphRAG retrieval engine. Queries Neo4j.

**Single primary tool with depth parameter:**
| Depth | What it does |
|---|---|
| `quick` | Vector similarity search only. Returns top 3 posts with metadata. |
| `thorough` | Vector + full thread context + mentioned entities + related entities. |
| `deep` | All of thorough + community summaries + expert users + expanded results (10 posts). |

**Additional tools:**
| Tool | Description |
|---|---|
| `get_thread` | Retrieve a full topic with all replies |
| `find_related_topics` | Given a topic ID, find related via graph connections |
| `entity_lookup` | Look up an entity and find all posts mentioning it |

**Integration question:** This server is Python (FastMCP), not TypeScript like existing Ralph MCP servers. Options:
- A. Run as a standalone service (its own container, own port), add to sidecar compose
- B. Bundle as an npm MCP server via `supergateway` (bridges stdio→HTTP, but it's Python, not Node)
- C. Run as a sidecar to Neo4j in the infrastructure compose stack, agents connect via URL

### 6. Community Detection & Summarization (Phase 3)

Weekly batch job:
- **Leiden algorithm** on entity co-occurrence graph (Neo4j GDS)
- **LLM summarization** of each community (themes, problems, solutions)
- Stored as `(:CommunitySummary)` nodes

---

## Neo4j Schema

### Core Nodes
```
(:User {uid, username, reputation, joinDate, groupTitle})
(:Post {pid, content, timestamp, votes, embedding})
(:Topic {tid, title, timestamp, resolved, slug})
(:Category {cid, name, description, parentCid})
(:Tag {name})
```

### Semantic Layer (Phase 2)
```
(:Entity {name, type, description, embedding})
(:CommunitySummary {id, scope, scopeValue, summary, themes[], generatedAt})
```

### Relationships
```
Structural:
  (:User)-[:POSTED]->(:Post)
  (:Post)-[:IN_TOPIC]->(:Topic)
  (:Post)-[:REPLIES_TO]->(:Post)
  (:Topic)-[:IN_CATEGORY]->(:Category)
  (:Category)-[:CHILD_OF]->(:Category)
  (:Topic)-[:TAGGED]->(:Tag)

Semantic:
  (:Post)-[:MENTIONS {confidence}]->(:Entity)
  (:Entity)-[:RELATED_TO {type, weight}]->(:Entity)
```

### Indexes
```cypher
-- Vector
CREATE VECTOR INDEX post_embeddings FOR (p:Post) ON (p.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1024, `vector.similarity_function`: 'cosine'}};
CREATE VECTOR INDEX entity_embeddings FOR (e:Entity) ON (e.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1024, `vector.similarity_function`: 'cosine'}};

-- Fulltext
CREATE FULLTEXT INDEX entity_fulltext FOR (e:Entity) ON EACH [e.name, e.description];

-- Structural
CREATE INDEX post_timestamp FOR (p:Post) ON (p.timestamp);
```

---

## Embedding Model: `bge-m3`

Already referenced in the existing plan. Available via Ollama:

```bash
ollama pull bge-m3    # 1024 dims, 567M params, multilingual, MTEB competitive
```

**Why bge-m3 over alternatives:**
- 1024 dimensions (good quality/index-size balance)
- Strong MTEB scores for retrieval tasks
- Multilingual (future-proof if forum content mixes languages)
- Runs well on local GPU via Ollama

---

## Build Order

### Phase 0 — Infrastructure Bootstrap
- [ ] Docker Compose stack for NodeBB + MongoDB (NodeBB's default DB) + Neo4j 5.x
- [ ] NodeBB initial setup: categories (per-profile), ralph-bot API user, JSON API enabled
- [ ] Neo4j schema script (constraints, indexes, vector indexes)
- [ ] Pull bge-m3 into Ollama (`ollama pull bge-m3`)
- **Deliverable:** Forum running, Neo4j empty but schema ready, Ollama embedding model loaded

### Phase 1 — Write Path (MCP `ralphchives` server)
- [ ] `shared/mcp-servers/ralphchives/` — manifest, TypeScript server, tools: `post_session_result`, `post_observation`, `reply_to_thread`, `search_ralphchives`
- [ ] Profile updates: add `"ralphchives"` to `mcpServers` arrays
- [ ] Agent template updates: add "post to ralphchives" instructions in exit phase
- [ ] Test: agent posts a session result → visible in NodeBB
- **Deliverable:** Agents can write to the forum

### Phase 2 — Structural Sync Pipeline
- [ ] Python project: `ralphchives-pipeline/` (or similar)
- [ ] `nodebb_fetcher.py`, `graph_writer.py`, `sync_runner.py`
- [ ] Test: `python sync_runner.py --full` → forum data in Neo4j, browsable
- [ ] Cron or daemon setup (5-15 min interval)
- **Deliverable:** Neo4j mirrors forum structure in near-real-time

### Phase 3 — Semantic Enrichment
- [ ] `embedder.py` (Ollama bge-m3 wrapper)
- [ ] `embedding_writer.py` (backfill embeddings)
- [ ] `entity_extractor.py` + `entity_resolver.py` + `entity_linker.py`
- [ ] `enrichment_runner.py` (orchestrator, chained after sync)
- [ ] Test: embeddings + entities populated for all posts
- **Deliverable:** Posts have vector embeddings, entity graph exists

### Phase 4 — Read Path (MCP `consult_the_archives` server)
- [ ] Python FastMCP server with `consult_the_archives` tool (3 depth levels)
- [ ] Additional tools: `get_thread`, `find_related_topics`, `entity_lookup`
- [ ] Integration with Ralph's compose stack (standalone service or sidecar)
- [ ] Profile updates: add to `mcpServers` arrays
- [ ] Agent template updates: add "consult the archives" instructions in research phase
- [ ] Test: agent queries archives → gets relevant prior work
- **Deliverable:** Agents can search historical knowledge via RAG

### Phase 5 — Community Detection & Summarization
- [ ] `community_detector.py` (Neo4j GDS Leiden)
- [ ] `community_summarizer.py` (LLM generates summaries)
- [ ] `deep` depth option in retrieval engine
- [ ] Weekly cron
- **Deliverable:** Full depth spectrum working

### Phase 6 — Hardening
- [ ] Entity resolution QA (manual sampling)
- [ ] Cypher query optimization + caching
- [ ] Latency profiling (p50/p95 per depth level)
- [ ] LLM cost monitoring dashboard
- [ ] Seed existing handoff files into the forum (backfill)

---

## Open Questions

### Infrastructure Deployment

1. **Where does the NodeBB + Neo4j stack run?** Same machine as the orchestrator? Separate compose stack? The Ralph sidecar has resource limits (4G memory, 1 CPU) — Neo4j alone may need more than that.

2. **Compose isolation:** Should this be a completely separate docker-compose stack (always running, independent of agent task cycles), or integrated into the per-profile compose merge? Leaning toward separate — the forum and graph DB should persist across agent runs, not start/stop with each task.

3. **Network access from sidecar:** The `post_to_ralphchives` MCP server runs in the existing sidecar (has `ralph-sidecar-external` direct internet). Does NodeBB run on the host or in a separate Docker network? The sidecar would need to reach it — either via `host.docker.internal` or by connecting to the forum's Docker network.

### Read Path Integration

4. **How does the `consult_the_archives` Python server connect to agents?** Options:
   - A. Run as a standalone HTTP service (own container), agents connect via URL in `mcp-config.json`
   - B. Use supergateway to bridge Python stdio→Streamable HTTP, run in the Ralph sidecar
   - C. Run alongside Neo4j in the infrastructure compose stack

5. **Should `consult_the_archives` be available to all profiles or opt-in?** (Same least-privilege model as other MCP servers — profiles declare which servers they need.)

### Content Strategy

6. **Backfill:** Should existing handoff files (in `output/handoffs/`) be imported into the forum as seed content?

7. **Cross-profile visibility:** The ralphchives doc says "none — ralph-docs isolated from ralph-vscode." Should the `consult_the_archives` tool enforce this (only return posts from the querying profile's category), or should agents see all profiles' knowledge?

8. **Orchestrator vs agent posting:** Should the orchestrator auto-create the forum thread after each task (reliable, structured data only), and the agent *optionally* add freeform commentary via the MCP tool during its run? (Hybrid approach from the ralphchives doc.)

### Embedding & Extraction

9. **Entity extraction model:** Use local Ollama (e.g. gemma-3 8B) or cloud API (Gemini Flash)? Local is cheaper/private but potentially lower quality.

10. **Neo4j GDS:** Community edition of Neo4j doesn't include GDS (Graph Data Science). Options: use Neo4j Enterprise (license), self-implement Leiden in Python, or skip community detection initially.
