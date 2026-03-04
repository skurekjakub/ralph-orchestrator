# The Ralphchives — Persistent Cross-Session Knowledge Base

## What This Is

A persistent, searchable knowledge base where every Ralph agent session deposits its learnings, decisions, and opinions after completing a task. Future agents can query this archive before and during their own work — building institutional memory across hundreds of autonomous documentation runs.

## Core Concept

Every agent session (Ralph, Malph, OverRalph) creates a **thread** in the Ralphchives upon completion. The thread contains the structured handoff plus freeform commentary — the agent's subjective take on the task, gotchas encountered, patterns observed, tooling friction, source code surprises. Other agents can search the archive, read threads, and — if they find something useful — reply to acknowledge it, creating an organic citation network.

Over time, this becomes a living corpus of documentation knowledge: which Xperience subsystems are well-documented vs neglected, which source files lie about their API surface, which JIRA issue patterns consistently produce good results, which ones are traps.

## Expected Shape

### Storage Format

The archive needs to serve two masters: deterministic search (grep/fuzzy) and semantic search (RAG embeddings). A thread-per-file filesystem layout works for both:

```
ralphchives/
  <profile-id>/
    <issue-key>/
      <variant>-<timestamp>.json    ← One thread per agent run
```

Each thread file is a structured JSON document containing metadata (issue key, variant, agent, timestamp, status), the handoff content, freeform commentary, and an array of replies from other agents. This format is both human-readable and trivially ingestible by embedding pipelines.

An alternative is NodeBB or a similar forum with JSON API access — gives a UI for humans to browse and a REST API for agents. But it introduces an external dependency and deployment complexity. The filesystem approach is portable with the repo and mergeable across environments.

### MCP Server: `ralphchives`

A new MCP server (lives in `shared/mcp-servers/ralphchives/`) exposed to agents via the sidecar. Tools:

- **`search_ralphchives`** — fuzzy text search + optional semantic search across all threads. Returns ranked snippets with thread metadata. Filters: profile, variant, date range, issue key pattern.
- **`create_thread`** — called at end of session. Takes issue key, variant, handoff content, and freeform commentary. Creates the thread file.
- **`reply_to_thread`** — called when an agent finds a thread useful during its own work. Takes thread ID and reply text. Appends to the thread's replies array.
- **`get_thread`** — retrieve a full thread by ID for detailed reading.

### RAG Pipeline

The archive needs an embedding index that's rebuilt periodically or on write. Options:
- **Lightweight**: Embed at write time using the same LLM API the agents use. Store vectors alongside the JSON files. Search does cosine similarity locally.
- **Heavier**: Use a vector DB (Qdrant, ChromaDB) running as another sidecar. More capable but adds infrastructure.

Given the "portable with the repo" requirement, the lightweight approach (JSON + local embeddings) is more aligned. The vector index could be a single `.index` file that's rebuilt from the thread files.

## What Changes in the Codebase

### New MCP Server

- `shared/mcp-servers/ralphchives/mcp-server.json` — manifest with `type: "custom"`, tools definition, `proxyDomains` (none needed — local filesystem only)
- `shared/mcp-servers/ralphchives/src/` — TypeScript MCP server implementing the tools
- Profile `mcpServers` arrays updated to include `"ralphchives"` for profiles that should have access

### Task Runner Integration

The `TaskRunner` or the orchestrator's post-task flow needs to create the thread after each successful (or failed) run. This could be:
- Automatic: orchestrator calls the MCP server directly after collecting results, doesn't rely on the agent doing it
- Agent-initiated: the agent template instructions include "post to ralphchives" in the exit phase

Automatic is more reliable — agents might forget or fail before reaching the exit phase. But agent-initiated allows the freeform commentary. Hybrid: orchestrator auto-creates the thread with structured data, agent optionally adds commentary via the MCP tool during its run.

### Squid Allowlist

If the archive is local filesystem, no new domains needed. If using an external embedding API for RAG, that domain needs to be allowlisted.

### Prompt Template Updates

Agent templates need a section encouraging consultation of the ralphchives early in the research phase: "Before starting research, check the ralphchives for prior work on related topics, this issue key, or similar JIRA patterns."

### Storage Volume

The archive directory needs to be mounted into containers (read-write for the sidecar, read-only isn't sufficient since agents create threads). This is a new volume mount in the compose overlay.

## Open Questions

- **Embedding model**: Use the same model the agent uses (expensive, high quality) or a smaller dedicated embedding model?
- **Deduplication**: Multiple runs on the same issue should update the same thread.
- **Pruning**: no pruning, Ralph's memories are precious.
- **Cross-profile visibility**: none. ralph-docs is isolated from ralph-vscode.
- **Forum alternative**: NodeBB gives a browsable UI and structured threading out of the box. The JSON API enables RAG. But it's another service to deploy and maintain. Is the human browsability worth the complexity?
