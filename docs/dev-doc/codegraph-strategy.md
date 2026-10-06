# CodeGraphContext: Graph Index Strategy for Ralph Agent Containers

This document analyzes how to maintain a code graph index for target repositories where Ralph agents run — covering database choice, index lifecycle, persistence, and container integration.

## Context

CodeGraphContext (CGC) indexes source code into a graph database using Tree-sitter AST parsing. Ralph agents run inside Docker containers with network isolation. Each task targets a specific repository checkout, and the agent benefits from structural code intelligence (call graphs, dead code detection, complexity analysis).

**Key constraint:** agent containers are ephemeral — they start, execute a task, and stop. Any in-process state is lost between tasks.

## Database Options

### FalkorDB Lite (Embedded)

- **Pros:** Zero-config, no external services, works with `pip install codegraphcontext` alone
- **Cons:** In-process only — graph dies with the process. Requires Python 3.12+. Not suitable for repos >100k LOC (memory pressure)
- **Persistence:** None. Graph must be rebuilt on every container start.

### Neo4j (External)

- **Pros:** Persistent across container restarts. Handles large repos. Supports concurrent access. Mature query engine.
- **Cons:** Requires a running Neo4j instance (Docker service or external). Adds infrastructure complexity. Network access needed from sidecar.
- **Persistence:** Full — survives container lifecycle.

## Recommended Strategy: FalkorDB Lite with Startup Indexing

For Ralph's use case, FalkorDB Lite with per-task indexing is the pragmatic choice. Here's why:

### Why not Neo4j?

1. **Infrastructure overhead.** Adding Neo4j means another Docker service in the compose stack — plus backups, monitoring, and credential management.
2. **Index staleness.** Target repos change between tasks (different branches, new commits). A persistent index from a prior task would be stale or misleading.
3. **Multi-repo complexity.** Ralph serves multiple profiles, each targeting different repos. A shared Neo4j would need per-repo graph isolation.
4. **Network plumbing.** The sidecar (where CGC MCP runs) would need network access to Neo4j, adding another compose overlay concern.

### Why FalkorDB Lite works

1. **Fresh index per task.** Every task sees a clean, accurate graph of the current repo state. No stale data.
2. **Zero infrastructure.** No additional Docker services, databases, or credentials.
3. **Repo size fits.** Ralph's target repos (documentation, SDKs, samples) are well under 100k LOC. FalkorDB Lite handles these comfortably.
4. **Indexing speed.** A ~250-file TypeScript repo indexes in ~90 seconds. Most target repos are smaller. This is acceptable as a one-time startup cost.

## Implementation Plan

### Phase 1: Startup Indexing (Recommended)

Index the target repo at the start of each task, before the agent begins work. This happens inside the sidecar container where CGC runs.

**Flow:**

```
Task start → sidecar receives gateway.json with CGC config
           → CGC MCP server starts (cgc mcp start)
           → Agent's first action: call add_code_to_graph for /workspace
           → Agent queries the graph throughout the task
           → Task ends → container stops → graph discarded
```

**Agent template integration:** Add an instruction to the agent template telling it to index the repo before starting structural analysis:

```markdown
## Code Graph

A CodeGraphContext MCP server is available. Before using structural queries
(call chains, dead code, complexity), index the workspace:

1. Call `add_code_to_graph` with `directory_path: "/workspace"`
2. Wait for the job to complete via `check_job_status`
3. Then use `find_code`, `analyze_code_relationships`, etc.
```

**Pros:** Simple. Agent controls when indexing happens. No sidecar lifecycle hooks needed.
**Cons:** Agent must remember to index. Consumes ~60-120s of the agent's task time.

### Phase 2: Sidecar Auto-Index (Future Enhancement)

Move indexing into the sidecar startup, so the graph is ready before the agent starts.

**Approach:** Add a startup script in the sidecar that:

1. Checks if `/workspace` is mounted
2. Runs `cgc index /workspace` before launching the gateway process
3. Optionally starts `cgc watch /workspace` for live updates during the task

**Sidecar entrypoint change:**

```bash
#!/bin/bash
# Index workspace if present
if [ -d /workspace ]; then
  cgc index /workspace 2>&1 | tail -5
fi
# Start the gateway
exec node /opt/mcp/gateway/dist/gateway.js /opt/mcp/config/gateway.json
```

**Pros:** Agent gets a pre-built graph. No wasted agent time. Transparent.
**Cons:** Adds to container startup time. Sidecar needs workspace mount. Indexing failures shouldn't block the gateway.

### Phase 3: Cached Index Bundles (Future, Large Repos Only)

For repos that don't change frequently, pre-build graph bundles and restore them at startup.

**Approach:**

1. CI pipeline runs `cgc index` and exports the FalkorDB data directory
2. Artifact stored as a tarball (per-branch or per-commit)
3. Sidecar startup restores the cached index, then does incremental update for any new changes

**When this matters:** Only if indexing time becomes a bottleneck (>5 min) for large repos. Not needed for current Ralph target repos.

## Configuration for Sidecar Deployment

When CGC runs inside the MCP sidecar, configure via environment variables in the sidecar's env:

```json
{
  "name": "codegraphcontext",
  "env": {
    "DEFAULT_BACKEND": "falkordb",
    "IGNORE_TESTS": "true",
    "PARALLEL_WORKERS": "2",
    "MAX_FILE_SIZE_MB": "5",
    "CACHE_ENABLED": "false"
  }
}
```

Notes:

- `CACHE_ENABLED=false` — no point caching in ephemeral containers
- `IGNORE_TESTS=true` — reduces indexing time, focuses on production code structure
- `PARALLEL_WORKERS=2` — conservative for container resource limits (4 CPU cap)
- No Neo4j env vars needed (FalkorDB Lite is the default)

## .cgcignore for Target Repos

Each target repo should have a `.cgcignore` to exclude irrelevant files:

```
node_modules/
dist/
.build/
*.min.js
*.generated.*
*.d.ts
docs/
```

This can be:

- Committed to the target repo (preferred — repo owner controls it)
- Injected by the sidecar at startup (write to `/workspace/.cgcignore` from a template)

## Resource Impact

| Metric                 | Value (250-file TS repo) |
| ---------------------- | ------------------------ |
| Indexing time          | ~90 seconds              |
| Memory (FalkorDB Lite) | ~200-400 MB              |
| Disk                   | Minimal (in-memory)      |

Within Ralph's container limits (8G memory, 4 CPU). The MCP sidecar has no explicit resource cap, so memory is not a concern for the sidecar.

## Decision Summary

| Decision         | Choice                              | Rationale                                          |
| ---------------- | ----------------------------------- | -------------------------------------------------- |
| Database backend | FalkorDB Lite                       | Zero-config, ephemeral matches container lifecycle |
| Index timing     | Per-task, agent-initiated (Phase 1) | Simplest, no sidecar changes needed                |
| Persistence      | None (re-index each task)           | Avoids stale data from prior tasks                 |
| .cgcignore       | In target repo                      | Repo owner controls exclusions                     |
| Future path      | Sidecar auto-index (Phase 2)        | When CGC is proven and startup cost matters        |
