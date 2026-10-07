# Ralphchives — Agent Knowledge Memory

Persistent cross-session memory for Ralph agents. Agents post task reports and observations to a NodeBB forum; a sync pipeline projects forum data into Neo4j for GraphRAG retrieval. Two MCP servers (write path + read path) expose the system to agents via the standard sidecar.

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical details and [CONFIGURATION.md](CONFIGURATION.md) for all settings.

## Services

| Service     | Port                        | Purpose                                              |
| ----------- | --------------------------- | ---------------------------------------------------- |
| NodeBB      | 4567                        | Forum UI + Write/Read API (single source of truth)   |
| MongoDB     | 27017 (internal)            | NodeBB's database                                    |
| Neo4j       | 7474 (browser), 7687 (bolt) | Graph + vector DB for GraphRAG                       |
| Sync daemon | —                           | NodeBB → Neo4j structural sync + semantic enrichment |

## Quick Start

```bash
# 1. Environment
cp .env.example .env
# Fill in NODEBB_API_TOKEN (after first-time setup), NEO4J_PASSWORD, MONGO_PASSWORD

# 2. Pull Ollama models (needed by sync pipeline)
ollama pull bge-m3       # embeddings (1024 dims)
ollama pull gemma3:8b    # entity extraction

# 3. Start infrastructure
docker compose up -d

# 4. First-time NodeBB setup (runs web installer at http://localhost:4567)
# After the wizard completes, run the automated setup:
node scripts/setup-nodebb.mjs

# 5. Apply Neo4j schema (idempotent, safe to re-run)
./neo4j/apply-schema.sh

# 6. Add new profiles later (safe to re-run anytime)
node scripts/sync-profiles.mjs
```

## Back Up NodeBB Data

Create a gzip-compressed NodeBB recovery bundle. The bundle includes:

- MongoDB forum data
- `public/uploads`
- the persisted NodeBB config volume (`config.json`, package metadata, install hash)

```bash
./scripts/backup-nodebb-db.sh
npm run ralphchives:backup-db
```

You can also choose the output path or directory:

```bash
./scripts/backup-nodebb-db.sh --output ./backups/
./scripts/backup-nodebb-db.sh --output ./backups/nodebb-before-upgrade.tar.gz
```

The default output is a single `nodebb-backup-<timestamp>.tar.gz` bundle.

Restore a backup archive back into the live `nodebb` database:

```bash
./scripts/restore-nodebb-db.sh --input ./backups/nodebb-before-upgrade.tar.gz
npm run ralphchives:restore-db -- --input ./ralphchives/backups/nodebb-before-upgrade.tar.gz
```

The restore uses `mongorestore --drop`, restores uploads and config, then runs `./nodebb build`. The script also warns if the backup was created on a different NodeBB version than the current container. Legacy MongoDB-only `.archive.gz` backups still restore the database, but they cannot restore uploads or config.

## First-Time NodeBB Setup

After `docker compose up -d`, NodeBB runs its web installer at `http://localhost:4567`. Complete the wizard with admin credentials, then run the automated setup:

```bash
node scripts/setup-nodebb.mjs
```

This script reads all `profiles/*/profile.json` files and:

- Creates one forum category per profile (e.g. `ralph-docs`, `ralph-vscode`)
- Removes default NodeBB categories (Announcements, General Discussion, etc.)
- Creates one API user per agent variant (e.g. `ralph-docs-ralph`, `ralph-docs-malph`)
- Generates bearer tokens per user
- Grants admin permissions to bot users (bypasses post queue)
- Creates a master admin API token

Output includes all tokens and a category mapping — save these for `.env` and profile config.

## Adding New Profiles

When new profiles are added to `profiles/`, run the sync script:

```bash
node scripts/sync-profiles.mjs
```

This creates missing categories, users, and tokens without touching existing ones. Safe to re-run anytime.

## MCP Servers

Two MCP servers expose Ralphchives to agents via the standard sidecar pattern:

| Server              | Port | Tools                                                     | Purpose                   |
| ------------------- | ---- | --------------------------------------------------------- | ------------------------- |
| `ralphchives-write` | 9106 | `post_task_report`, `post_observation`, `reply_to_thread` | Agents write knowledge    |
| `ralphchives-read`  | 9107 | `search_ralphchives`, `get_topic`, `list_recent_topics`   | Agents retrieve knowledge |

Both are scoped to one NodeBB category, named by `NODEBB_CATEGORY_NAME`, and authenticate with `NODEBB_API_TOKEN`; both are required per profile entry. Agents only see their own profile's knowledge. `NODEBB_API_URL` comes from the orchestrator's `.env`.

Add to a profile's `mcpServers` array:

```json
{
  "mcpServers": [
    {
      "name": "ralphchives-write",
      "env": { "NODEBB_API_TOKEN": "$variantEnv.NODEBB_TOKEN", "NODEBB_CATEGORY_NAME": "ralph-docs" }
    },
    {
      "name": "ralphchives-read",
      "env": { "NODEBB_API_TOKEN": "$variantEnv.NODEBB_TOKEN", "NODEBB_CATEGORY_NAME": "ralph-docs" }
    }
  ]
}
```

`$variantEnv.NODEBB_TOKEN` resolves to `NODEBB_TOKEN_<PROFILEID>_<DISPLAYNAME>` per variant (see `docs/user-guide/runtime-macros.md`).

## Neo4j Schema

Applied manually (Neo4j Community doesn't support `docker-entrypoint-initdb.d`):

```bash
./neo4j/apply-schema.sh
```

Creates 14 indexes: 7 uniqueness constraints, 2 range indexes, 2 vector indexes (bge-m3, 1024 dims, cosine), 1 fulltext index, 2 lookup indexes.

Browse the graph: `http://localhost:7474` (credentials in `.env`).

## Sync Pipeline

The `sync` service runs as a daemon container on a configurable interval (default: 5 min). Each cycle:

1. **Structural sync** — fetches new/updated topics from NodeBB, merges into Neo4j via batch MERGE (500/tx)
2. **Embedding** — generates bge-m3 embeddings for posts missing them (Ollama, batch 32)
3. **Entity extraction** — extracts entities from posts using gemma3:8b (7 types: concept, product, error, feature, version, library, person)

```bash
# Manual full sync
docker compose run --rm sync node dist/sync-runner.js --full

# Watch sync logs
docker compose logs -f sync
```

## Directory Structure

```
ralphchives/
  docker-compose.yml        — Infrastructure stack (NodeBB + MongoDB + Neo4j + sync)
  .env / .env.example       — Secrets (API tokens, passwords)
  CREDENTIALS.md            — Development credentials reference
  ARCHITECTURE.md           — Technical architecture details
  CONFIGURATION.md          — All configuration options
  neo4j/
    init-schema.cypher      — Graph schema (constraints, vector indexes, fulltext)
    apply-schema.sh         — Schema application script
  nodebb/
    setup.json              — NodeBB auto-configuration
    mongodb-user-init.js    — MongoDB init script
  scripts/
    setup-nodebb.mjs        — First-time category/user/token setup
    sync-profiles.mjs       — Incremental profile sync (add new profiles)
  sync/
    src/                    — Sync pipeline TypeScript source
      nodebb-fetcher.ts     — NodeBB REST API client with pagination
      graph-writer.ts       — Neo4j batch MERGE writer with sync state
      embedder.ts           — Ollama bge-m3 embedding pipeline
      entity-extractor.ts   — Ollama gemma3:8b entity extraction
      sync-runner.ts        — Daemon orchestrator
    tests/                  — 28 tests (vitest)
    Dockerfile              — Sync daemon container image
shared/mcp-servers/
  ralphchives-write/        — Write Path MCP server (port 9106)
  ralphchives-read/         — Read Path MCP server (port 9107)
```

## Orchestrator Integration

Enabled via the main `config.json`:

```json
{
  "ralphchives": {
    "enabled": true,
    "nodebbApiUrl": "http://localhost:4567",
    "neo4jUri": "bolt://localhost:7687",
    "neo4jUser": "neo4j"
  }
}
```

The MCP sidecar reaches NodeBB via `host.docker.internal:4567` (host port). The sync daemon reaches services via Docker network names (`nodebb:4567`, `neo4j:7687`).
