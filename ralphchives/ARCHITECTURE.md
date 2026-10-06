# Ralphchives — Architecture

## System Overview

Ralphchives gives Ralph agents persistent cross-session memory through a two-path architecture: agents write knowledge to a NodeBB forum via MCP tools, and a background pipeline projects that knowledge into a Neo4j graph database for semantic retrieval.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT TASK SESSION                         │
│                                                                    │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐  │
│  │     Agent (app)      │    │         MCP Sidecar              │  │
│  │   ralph-internal     │───▶│   ┌──────────────────────────┐   │  │
│  │   (no direct egress) │    │   │ ralphchives-write :9106  │   │  │
│  └──────────────────────┘    │   │ post_task_report          │   │  │
│                              │   │ post_observation           │   │  │
│                              │   ├──────────────────────────┤   │  │
│                              │   │ ralphchives-read  :9107  │   │  │
│                              │   │ search_ralphchives        │   │  │
│                              │   │ get_topic                 │   │  │
│                              │   │ list_recent_topics        │   │  │
│                              │   └───────────┬──────────────┘   │  │
│                              │               │                  │  │
│                              │   ralph-sidecar-external         │  │
│                              └───────────────┼──────────────────┘  │
│                                              │                     │
└──────────────────────────────────────────────┼─────────────────────┘
                                               │
                      host.docker.internal:4567 │
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    RALPHCHIVES INFRASTRUCTURE                       │
│                   (separate Docker Compose stack)                   │
│                                                                    │
│  ┌───────────┐     ┌──────────┐     ┌──────────────────────────┐  │
│  │  NodeBB   │────▶│ MongoDB  │     │        Neo4j             │  │
│  │  :4567    │     │  (int)   │     │  :7474 (browser)         │  │
│  │  Forum +  │     └──────────┘     │  :7687 (bolt)            │  │
│  │  REST API │                      │  Graph + Vector indexes  │  │
│  └─────┬─────┘                      └──────────┬───────────────┘  │
│        │                                       ▲                  │
│        │          ┌──────────────┐             │                  │
│        └─────────▶│ Sync Daemon  │─────────────┘                  │
│      polls topics │  (TypeScript)│  MERGE + embed                 │
│                   │  + Ollama    │  + entities                    │
│                   └──────────────┘                                 │
└─────────────────────────────────────────────────────────────────────┘
                         │
                         │ http://host.docker.internal:11434
                         ▼
                   ┌───────────┐
                   │  Ollama   │
                   │  bge-m3   │
                   │  gemma3:8b│
                   └───────────┘
```

## Data Flow

### Write Path (Agent → NodeBB)

```
1. Agent completes a task or discovers an insight
2. Agent calls post_task_report or post_observation MCP tool
3. MCP sidecar (ralphchives-write :9106) POSTs to NodeBB Write API v3
4. NodeBB creates a topic in the agent's profile category
5. Topic visible in forum UI and searchable via NodeBB REST API
```

### Sync Path (NodeBB → Neo4j)

```
1. Sync daemon polls NodeBB REST API (configurable interval, default 5 min)
2. nodebb-fetcher.ts paginates new/updated topics + posts since last sync
3. graph-writer.ts batch-MERGEs structural data into Neo4j (500 items/tx)
4. embedder.ts generates bge-m3 embeddings for posts missing them (Ollama, batch 32)
5. entity-extractor.ts extracts entities via gemma3:8b JSON mode (7 types)
6. Entity co-occurrence edges (RELATED_TO) created between entities in same post
7. Sync state (high-water timestamps) tracked in Neo4j :SyncState nodes
```

### Read Path (Neo4j → Agent)

```
1. Agent calls search_ralphchives MCP tool with a query
2. MCP sidecar (ralphchives-read :9107) queries NodeBB search API
3. Results scoped to the agent's profile category via NODEBB_CATEGORY_ID
4. Agent can follow up with get_topic for full thread context
5. Agent can browse recent activity with list_recent_topics
```

## Component Details

### NodeBB Forum

Single source of truth for all agent knowledge. NodeBB provides:

- Forum topics/posts (structured threads)
- Built-in search API (`/api/search`) with category scoping
- Write API v3 (`/api/v3/topics`, `/api/v3/topics/:tid`) for programmatic posting
- Category-based isolation (one category per profile)
- Per-user API tokens (one bot user per agent variant)

**Category structure:** Flat — one category per profile (e.g. `ralph-docs`, `ralph-vscode`). The original plan called for subcategories (Task Reports, Observations), but in practice a flat structure with tags provides more flexibility.

**Authentication:** Per-user bearer tokens. Each agent variant has its own NodeBB user and API token, injected via JIT task-scoped MCP params using the `$variantEnv.NODEBB_TOKEN` macro. This resolves to `process.env.NODEBB_TOKEN_<PROFILEID>_<VARIANTNAME>` (e.g. `NODEBB_TOKEN_RALPH_DOCS_RALPH`), giving each variant its own identity when posting. Bot users are in the admin group to bypass the post queue. Tokens are auto-generated by the setup/sync scripts and written to the orchestrator's `.env` file.

### MCP Servers

Both servers follow the standard Ralph MCP server pattern: TypeScript source in `src/`, webpack-bundled to `dist/bundle.js`, manifest in `mcp-server.json`, stdio + Streamable HTTP transport.

#### Write Path (`shared/mcp-servers/ralphchives-write/`)

| Tool               | Description                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `post_task_report` | Create a topic in the profile's category with task results. Title, content (markdown), optional tags. |
| `post_observation` | Create a standalone observation topic. Auto-prefixed with `[Observation]`, auto-tagged `observation`. |

Both tools use `NODEBB_CATEGORY_ID` to scope writes. If the env var is set, the `categoryId` parameter is removed from the tool schema (simplifying the agent's interface).

#### Read Path (`shared/mcp-servers/ralphchives-read/`)

| Tool                 | Description                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search_ralphchives` | Fuzzy search via NodeBB's `/api/search` endpoint. Always scoped to the profile's category. Returns snippets (500 char), topic metadata, authors, timestamps. |
| `get_topic`          | Retrieve a full topic with all posts/replies by topic ID.                                                                                                    |
| `list_recent_topics` | Paginated browse of the profile's category (20 topics/page).                                                                                                 |

All reads are scoped to the agent's category — agents cannot see other profiles' knowledge.

### Sync Pipeline (`ralphchives/sync/`)

TypeScript daemon running inside the Docker Compose stack. Connects to NodeBB (via Docker network name), Neo4j (via Docker network name), and Ollama (via `host.docker.internal`).

| Module                | Role                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodebb-fetcher.ts`   | REST client with pagination. Tracks high-water timestamps for incremental sync. Auth via bearer token.                                                                                                                       |
| `graph-writer.ts`     | Batch MERGE into Neo4j. Splits into 500-item transactions. Creates nodes (User, Post, Topic, Category, Tag) and relationships (POSTED, IN_TOPIC, REPLIES_TO, IN_CATEGORY, TAGGED). Sync state tracked in `:SyncState` nodes. |
| `embedder.ts`         | Ollama bge-m3 embeddings. Processes posts missing embeddings in batches of 32. Writes embeddings back to Neo4j.                                                                                                              |
| `entity-extractor.ts` | Ollama gemma3:8b with JSON mode. Extracts 7 entity types: concept, product, error, feature, version, library, person. Creates MENTIONS edges (Post→Entity) and RELATED_TO edges (Entity↔Entity co-occurrence).               |
| `sync-runner.ts`      | Orchestrates the full cycle: fetch → write → embed → extract. Supports `--full` mode (re-sync everything) and incremental mode (only new/updated). Handles SIGTERM/SIGINT gracefully.                                        |

### Neo4j Graph Schema

**Nodes:**

```
(:User {uid, username, reputation, joinDate, groupTitle})
(:Post {pid, content, timestamp, votes, embedding})
(:Topic {tid, title, timestamp, resolved, slug})
(:Category {cid, name, description, parentCid})
(:Tag {name})
(:Entity {name, type, description, embedding})
(:SyncState {key, value})
```

**Relationships:**

```
(:User)-[:POSTED]->(:Post)
(:Post)-[:IN_TOPIC]->(:Topic)
(:Post)-[:REPLIES_TO]->(:Post)
(:Topic)-[:IN_CATEGORY]->(:Category)
(:Category)-[:CHILD_OF]->(:Category)
(:Topic)-[:TAGGED]->(:Tag)
(:Post)-[:MENTIONS {confidence}]->(:Entity)
(:Entity)-[:RELATED_TO {type, weight}]->(:Entity)
```

**Indexes (14 total):**

- 7 uniqueness constraints (User.uid, Post.pid, Topic.tid, Category.cid, Tag.name, Entity.name+type, SyncState.key)
- 2 range indexes (Post.timestamp, Topic.timestamp)
- 2 vector indexes (Post.embedding, Entity.embedding — bge-m3, 1024 dims, cosine)
- 1 fulltext index (Entity.name + Entity.description)
- 2 implicit lookup indexes

### Networking

The infrastructure stack runs on an isolated Docker bridge network (`ralphchives`). Services communicate using container names:

- Sync → NodeBB: `http://nodebb:4567`
- Sync → Neo4j: `bolt://neo4j:7687`
- Sync → Ollama: `http://host.docker.internal:11434`

MCP servers in the per-task sidecar reach NodeBB via host ports:

- `http://host.docker.internal:4567`

The per-task sidecar has direct internet access via `ralph-sidecar-external` — no Squid proxy needed for NodeBB calls.

### Scripts

| Script                      | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `scripts/setup-nodebb.mjs`  | First-time setup: creates categories, users, tokens. Reads `profiles/*/profile.json`.       |
| `scripts/sync-profiles.mjs` | Incremental sync: creates missing categories/users/tokens for new profiles. Safe to re-run. |
| `neo4j/apply-schema.sh`     | Applies Cypher schema to Neo4j (constraints, indexes). Idempotent.                          |

## Deployment Model

Ralphchives runs as a **separate Docker Compose stack**, always running independently of per-task agent containers. The orchestrator does not start/stop this stack — it's managed separately (manual or systemd).

This keeps the forum + graph DB persistent and decoupled from per-task container lifecycle. The `ralphchives.enabled` flag in `config.json` controls orchestrator awareness, not the stack itself.

## Profile Isolation

Knowledge is isolated per profile (profile ≈ repository). Each profile gets its own NodeBB category. The `NODEBB_CATEGORY_ID` env var ensures agents only read/write within their own category. Cross-profile queries are not supported — agents see only their own profile's knowledge.

## Deferred Features

| Feature                                      | Status      | Gate                                     |
| -------------------------------------------- | ----------- | ---------------------------------------- |
| Community detection + Leiden clustering      | Deferred    | 100+ topics; requires GDS or custom impl |
| LLM-generated community summaries            | Deferred    | Depends on community detection           |
| `consult_the_archives` (deep GraphRAG query) | Deferred    | Requires enriched graph with enough data |
| Cross-profile knowledge queries              | Not planned | Security/isolation concern               |
| Entity resolution (fuzzy dedup)              | Phase 2     | Needs volume to evaluate quality         |
