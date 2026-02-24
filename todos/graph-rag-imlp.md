# Forum GraphRAG Infrastructure — Implementation Plan

**Stack:** Neo4j 5.x (graph + vector) · Python · FastMCP · LLM (Claude/OpenAI) · Ollama (embeddings)
**Data source:** NodeBB forum (JSON API)
**Pattern:** Neo4j-native GraphRAG — single database for graph storage + vector index

### Data Flow

```
                  writes                    syncs
Agent/Users  ──────────►  NodeBB Forum  ◄──────────  Sync Pipeline
                                                          │
                reads                                     ▼
Agent  ◄──── consult_the_archives ◄────────────────  Neo4j Graph
                  (MCP tool)                      (read-only projection)
```

The forum is the single source of truth. The graph is a read-only enriched projection. The agent writes by posting to the forum like any other user; those posts flow into the graph through the normal sync pipeline.

---

## Phase 0: Neo4j Schema & Constraints

### Core Node Labels

```
(:User {uid, username, reputation, joinDate, groupTitle})
(:Post {pid, content, timestamp, votes, embedding})
(:Topic {tid, title, timestamp, resolved, slug})
(:Category {cid, name, description, parentCid})
(:Tag {name})
```

### Semantic Layer (populated by LLM extraction — Phase 2)

```
(:Entity {name, type, description, embedding})
   type ∈ {concept, product, error, feature, version, library, person}

(:CommunitySummary {id, scope, scopeValue, summary, themes[], generatedAt})
```

### Relationships

```
Structural (deterministic from NodeBB JSON):
  (:User)-[:POSTED {at}]->(:Post)
  (:User)-[:CREATED {at}]->(:Topic)
  (:Post)-[:IN_TOPIC]->(:Topic)
  (:Post)-[:REPLIES_TO]->(:Post)
  (:Topic)-[:IN_CATEGORY]->(:Category)
  (:Category)-[:CHILD_OF]->(:Category)
  (:Topic)-[:TAGGED]->(:Tag)
  (:User)-[:UPVOTED]->(:Post)

Semantic (from LLM extraction):
  (:Post)-[:MENTIONS {confidence}]->(:Entity)
  (:Entity)-[:RELATED_TO {type, weight}]->(:Entity)
  (:Topic)-[:SUMMARIZED_BY]->(:CommunitySummary)
```

### Constraints & Indexes

```cypher
-- Uniqueness
CREATE CONSTRAINT FOR (u:User) REQUIRE u.uid IS UNIQUE;
CREATE CONSTRAINT FOR (p:Post) REQUIRE p.pid IS UNIQUE;
CREATE CONSTRAINT FOR (t:Topic) REQUIRE t.tid IS UNIQUE;
CREATE CONSTRAINT FOR (c:Category) REQUIRE c.cid IS UNIQUE;
CREATE CONSTRAINT FOR (tag:Tag) REQUIRE tag.name IS UNIQUE;
CREATE CONSTRAINT FOR (e:Entity) REQUIRE e.name IS UNIQUE;

-- Vector indexes
CREATE VECTOR INDEX post_embeddings
  FOR (p:Post) ON (p.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1024,
    `vector.similarity_function`: 'cosine'
  }};

CREATE VECTOR INDEX entity_embeddings
  FOR (e:Entity) ON (e.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1024,
    `vector.similarity_function`: 'cosine'
  }};

-- Full-text for fuzzy entity lookup
CREATE FULLTEXT INDEX entity_fulltext
  FOR (e:Entity) ON EACH [e.name, e.description];

-- Composite for filtered searches
CREATE INDEX post_timestamp FOR (p:Post) ON (p.timestamp);
CREATE INDEX topic_resolved FOR (t:Topic) ON (t.resolved);
```

**Deliverable:** A single Cypher script that creates the empty schema.

---

## Phase 1: Structural Ingestion Pipeline

Pure ETL. No LLM calls, no embeddings, no cost beyond compute.

### 1a. NodeBB Data Fetcher

```
nodebb_fetcher.py
  - Connects to NodeBB read API (or reads JSON export)
  - Paginates through /api/categories, /api/topics, /api/posts, /api/users
  - Yields normalized dicts per entity type
  - Tracks high-water marks (last seen timestamp per type)
  - Stores sync state in Neo4j: (:SyncState {entity, lastTimestamp, lastRun})
```

**Incremental strategy:** Fetch items with `timestamp > lastTimestamp`. For edits, use the greater of `timestamp` and `edited`.

### 1b. Graph Writer

```
graph_writer.py
  - Accepts normalized dicts from fetcher
  - Batches into transactions (500 items per tx)
  - Uses MERGE for idempotency
  - Nodes first, relationships second pass
```

Core pattern:

```cypher
UNWIND $posts AS p
MERGE (post:Post {pid: p.pid})
SET post.content = p.content,
    post.timestamp = p.timestamp,
    post.votes = p.votes
WITH post, p
MATCH (topic:Topic {tid: p.tid})
MERGE (post)-[:IN_TOPIC]->(topic)
WITH post, p
MATCH (author:User {uid: p.uid})
MERGE (author)-[:POSTED]->(post)
```

### 1c. Sync Runner

```
sync_runner.py
  - Orchestrates fetcher → writer
  - Two modes:
    1. --full : paginate everything (first run)
    2. default: incremental since last run
  - Optional: webhook listener for real-time
    NodeBB action:post.save → triggers single-post ingestion
  - Logs: items processed, errors, duration
```

**Schedule:** Cron every 5–15 min, or real-time via NodeBB webhooks.

**Deliverable:** `python sync_runner.py --full` populates the graph. Forum structure browsable in Neo4j.

---

## Phase 2: Semantic Enrichment Pipeline

Runs AFTER structural sync. Processes Post nodes that lack embeddings/entities.

### 2a. Embedding Service

```
embedder.py
  - Wraps Ollama (bge-m3, 1024 dims) or OpenAI
  - Batch interface: embed([text, ...]) → [vec, ...]
  - Posts < 512 tokens: embed as-is (vast majority)
  - Posts > 512 tokens: chunk with overlap, store as
    (:Chunk {content, embedding})-[:CHUNK_OF]->(:Post)
```

### 2b. Embedding Writer

```
embedding_writer.py
  - Query: MATCH (p:Post) WHERE p.embedding IS NULL RETURN p LIMIT 200
  - Embed in batches, write vectors back
  - Idempotent — skips posts with existing embeddings
```

### 2c. Entity Extractor

```
entity_extractor.py
  - Query posts missing entities:
    MATCH (p:Post) WHERE NOT (p)-[:MENTIONS]->() AND size(p.content) > 80
    RETURN p LIMIT 50
  - LLM prompt (structured JSON output):
    "Extract entities: [{name, type, description}]
     type ∈ {concept, product, error, feature, version, library, person}"
  - Use cheap model: Gemini Flash, GPT-4o-mini, or local Ollama
  - Skip very short posts (< 20 words)
```

### 2d. Entity Resolver

```
entity_resolver.py
  - Before creating an Entity node, check existing:
    1. Exact name match (case-insensitive)
    2. Full-text index search
    3. Embedding similarity (threshold > 0.92)
  - Merge duplicates: "neo4j" / "Neo4j" / "neo 4j" → one node
  - Maintain aliases: (:EntityAlias {alias})-[:ALIAS_OF]->(:Entity)
  - TARGET: >90% accuracy before trusting in retrieval
```

### 2e. Co-occurrence Linker

```
entity_linker.py
  - If two entities appear in the same post:
    MERGE (e1)-[:RELATED_TO]->(e2), increment weight
  - Run after each extraction batch
```

### 2f. Enrichment Orchestrator

```
enrichment_runner.py
  - Runs: embed → extract → resolve → link
  - Batched with rate limiting
  - Tracks progress: (:EnrichmentState {phase, lastPid})
  - Resumable after failure
  - Logs LLM token usage and cost
```

**Deliverable:** Posts have embeddings, entities are extracted/resolved, semantic layer exists.

---

## Phase 3: Community Detection & Summarization

### 3a. Community Detection

```
community_detector.py
  - Neo4j GDS Leiden algorithm on Entity co-occurrence graph
  - Also on User-replies-to-User network (expertise clusters)
  - Writes communityId property to Entity/User nodes
  - Schedule: weekly
```

### 3b. Community Summarizer

```
community_summarizer.py
  - Per community: gather entities, sample top/recent posts
  - LLM generates summary of themes, problems, solutions
  - Stores as (:CommunitySummary) linked to entities/categories
  - Refresh: weekly or when >N new posts in a community
```

**Deliverable:** Pre-computed summaries ready for the `deep` depth option.

---

## Phase 4: MCP Server — `consult_the_archives`

### 4a. Project Structure

```
mcp_server/
  ├── server.py            ← FastMCP app, tool + resource registration
  ├── config.py            ← Env vars, Neo4j connection
  ├── neo4j_client.py      ← Driver, query helpers, connection pool
  ├── embedder.py          ← Embedding client (reused from Phase 2)
  ├── retriever.py         ← The core retrieval engine
  ├── cypher/
  │   ├── vector_search.cypher
  │   ├── graph_context.cypher
  │   ├── entity_lookup.cypher
  │   └── community.cypher
  └── resources.py         ← forum:// resource handlers
```

### 4b. Retrieval Engine (the brains)

The `depth` parameter controls how much work the server does internally. The agent doesn't need to know about graph traversal vs vector search — it just picks a depth.

```python
# retriever.py

async def consult(query: str, filters: dict, depth: str) -> dict:
    query_vec = await embedder.embed(query)

    # ── QUICK: vector search only ───────────────────────
    posts = await vector_search(query_vec, filters, limit=3)

    if depth == "quick":
        return {"results": posts, "totalHits": len(posts)}

    # ── THOROUGH: + graph context + entities ────────────
    # Expand each result with its thread and mentioned entities
    for post in posts:
        post["thread"] = await get_thread_context(post["topic"]["tid"])
        post["mentionedEntities"] = await get_post_entities(post["post"]["pid"])

    # Find entities related to the query itself
    related = await entity_search(query, query_vec)

    if depth == "thorough":
        return {
            "results": posts,
            "relatedEntities": related,
            "totalHits": len(posts),
        }

    # ── DEEP: + community summaries + experts ───────────
    # Identify the most relevant category/community
    top_category = posts[0]["category"]["name"] if posts else None
    summary = await get_community_summary(top_category, related)
    experts = await find_experts(related, top_category)

    # Expand to more results for deep dives
    extra = await vector_search(query_vec, filters, limit=10, offset=3)
    posts.extend(extra)

    return {
        "results": posts,
        "relatedEntities": related,
        "communitySummary": summary,
        "experts": experts,
        "totalHits": len(posts),
    }
```

### 4c. Core Cypher Queries

**Vector search with filters:**

```cypher
CALL db.index.vector.queryNodes('post_embeddings', $limit, $vec)
YIELD node AS post, score
MATCH (post)-[:IN_TOPIC]->(topic)-[:IN_CATEGORY]->(cat)
MATCH (post)<-[:POSTED]-(author:User)
WHERE ($catName IS NULL OR cat.name = $catName)
  AND ($dateFrom IS NULL OR post.timestamp >= $dateFrom)
  AND ($dateTo IS NULL OR post.timestamp <= $dateTo)
  AND ($resolved IS NULL OR topic.resolved = $resolved)
OPTIONAL MATCH (topic)-[:TAGGED]->(tag:Tag)
WITH post, score, topic, cat, author, collect(tag.name) AS tags
WHERE ($filterTags IS NULL OR any(t IN tags WHERE t IN $filterTags))
  AND ($filterAuthor IS NULL OR author.username = $filterAuthor)
RETURN post, score, topic, cat, author, tags
ORDER BY score DESC
LIMIT $limit
```

**Thread context:**

```cypher
MATCH (topic:Topic {tid: $tid})<-[:IN_TOPIC]-(post:Post)
MATCH (post)<-[:POSTED]-(author:User)
OPTIONAL MATCH (post)-[:REPLIES_TO]->(parent:Post)
RETURN post, author, parent.pid AS replyTo
ORDER BY post.timestamp ASC
LIMIT 50
```

**Entity search (hybrid fulltext + vector fallback):**

```cypher
CALL db.index.fulltext.queryNodes('entity_fulltext', $query)
YIELD node AS entity, score WHERE score > 0.5
WITH entity, score ORDER BY score DESC LIMIT 5
OPTIONAL MATCH (entity)-[:RELATED_TO]-(related:Entity)
OPTIONAL MATCH (entity)<-[:MENTIONS]-(post:Post)
RETURN entity, score,
       count(DISTINCT post) AS postCount,
       collect(DISTINCT related.name)[..10] AS relatedNames
```

**Find experts for a topic area:**

```cypher
MATCH (e:Entity)<-[:MENTIONS]-(post:Post)<-[:POSTED]-(user:User)
WHERE e.name IN $entityNames OR e.type IN $entityTypes
WITH user, count(DISTINCT post) AS posts, sum(post.votes) AS totalVotes
ORDER BY totalVotes DESC, posts DESC
LIMIT 5
RETURN user.username, user.reputation, posts, totalVotes
```

### 4d. Resource Handlers

```python
@mcp.resource("forum://categories")
async def categories():
    # Cached 5 min
    return await neo4j_client.run(
        "MATCH (c:Category) "
        "OPTIONAL MATCH (c)<-[:IN_CATEGORY]-(t:Topic) "
        "RETURN c.name, c.description, count(t) AS topicCount "
        "ORDER BY c.name"
    )

@mcp.resource("forum://tags/popular")
async def popular_tags():
    # Cached 15 min
    return await neo4j_client.run(
        "MATCH (t:Tag)<-[:TAGGED]-(topic) "
        "RETURN t.name, count(topic) AS usage "
        "ORDER BY usage DESC LIMIT 50"
    )

@mcp.resource("forum://stats")
async def stats():
    # Cached 5 min — single query with multiple counts
    return await neo4j_client.run("""
        MATCH (p:Post) WITH count(p) AS posts
        MATCH (u:User) WITH posts, count(u) AS users
        MATCH (t:Topic) WITH posts, users, count(t) AS topics
        RETURN posts, users, topics
    """)
```

---

## Operational Infrastructure

### Pipeline Scheduling

| Job                     | Frequency         | Trigger              |
|-------------------------|-------------------|----------------------|
| Structural sync         | Every 5–15 min    | Cron or NodeBB hook  |
| Embedding backfill      | Continuous        | Chained after sync   |
| Entity extraction       | Continuous        | Chained after embed  |
| Entity resolution       | After extraction  | Pipeline chained     |
| Community detection     | Weekly            | Cron                 |
| Community summarization | Weekly            | After detection      |

### Pipeline Chain

```
Sync triggers automatically:
  sync_runner.py → on_complete → enrichment_runner.py
                                   ├── embed new posts
                                   ├── extract entities
                                   ├── resolve entities
                                   └── link co-occurrences

Weekly cron:
  community_detector.py → on_complete → community_summarizer.py
```

### Monitoring

- **Sync lag:** newest forum post timestamp vs newest Post node
- **Embedding coverage:** Posts with embeddings / total Posts
- **Entity resolution quality:** periodic manual sample review
- **Search latency:** p50/p95 of consult_the_archives calls
- **LLM cost:** tokens per pipeline phase per day

### Configuration

```env
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
NEO4J_DATABASE=forum

# Embeddings (local)
EMBED_PROVIDER=ollama
EMBED_MODEL=bge-m3
EMBED_URL=http://localhost:11434
EMBED_DIMS=1024

# LLM — extraction (cheap/fast)
EXTRACTION_LLM_PROVIDER=gemini
EXTRACTION_LLM_MODEL=gemini-2.5-flash-lite
EXTRACTION_LLM_KEY=...

# LLM — summarization (quality)
SUMMARY_LLM_PROVIDER=anthropic
SUMMARY_LLM_MODEL=claude-sonnet-4-20250514
SUMMARY_LLM_KEY=...

# NodeBB
NODEBB_API_URL=http://localhost:4567/api
NODEBB_API_TOKEN=...

# MCP Server
MCP_TRANSPORT=stdio
MCP_HOST=0.0.0.0
MCP_PORT=8081
```

---

## Build Order

```
Week 1  ► Phase 0 + Phase 1
          Schema + structural sync pipeline
          ✓ Full forum graph in Neo4j, browsable

Week 2  ► Phase 2a/2b + Phase 4 (server skeleton + vector search)
          Embeddings + basic MCP server with consult_the_archives (quick depth)
          ✓ Agent can search forum content via MCP

Week 3  ► Phase 2c/2d/2e + Phase 4 (thorough depth)
          Entity extraction pipeline + graph context in retrieval
          ✓ consult_the_archives returns entities and thread context

Week 4  ► Phase 3 + Phase 4 (deep depth)
          Community detection + summaries
          ✓ Full depth spectrum working

Week 5+ ► Tuning & hardening
          Entity resolution QA, Cypher optimization,
          latency profiling, cost monitoring
```