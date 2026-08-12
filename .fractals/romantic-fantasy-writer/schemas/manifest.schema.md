# manifest.json — Schema

## Purpose

Append-only audit trail of all agent actions. Every agent prepends an entry after completing work (newest first). Provides a complete history of the pipeline execution for debugging, delivery reporting, and re-entry decisions.

## Write Protocol

**prepend-entry** — Each agent reads the current array, prepends a new entry at index 0, writes back. Newest entries first.

## Writers

- All agents (each writes its own entry)

## Readers

- `romantic-fantasy-writer` (orchestrator) — for execution history
- `romantic-fantasy-writer-delivery-assembler` — for delivery report generation

## Schema

```json
[
  {
    "timestamp": "string — ISO-8601 timestamp",
    "agent": "string — Agent name that performed work",
    "task_id": "string — Phase/task identifier (e.g., 'concept/develop', 'drafting/chapter-003')",
    "artifacts": ["string — List of artifact paths written or modified"],
    "status": "string — completed|failed|blocked",
    "result": "string — Agent-specific result code (used in routing tables)",
    "iteration": "number — Iteration number (for multi-pass phases)"
  }
]
```

## ID Scheme

N/A — Array of entries. No ID field; entries are identified by timestamp + agent combination.

## Example

```json
[
  {
    "timestamp": "2025-01-15T11:15:00Z",
    "agent": "romantic-fantasy-writer-chapter-drafter",
    "task_id": "drafting/chapter-002",
    "artifacts": ["chapters/002/draft.md", "chapters/002/metadata.json"],
    "status": "completed",
    "result": "chapter-drafted",
    "iteration": 1
  },
  {
    "timestamp": "2025-01-15T11:02:00Z",
    "agent": "romantic-fantasy-writer-chapter-drafter",
    "task_id": "drafting/chapter-001",
    "artifacts": ["chapters/001/draft.md", "chapters/001/metadata.json"],
    "status": "completed",
    "result": "chapter-drafted",
    "iteration": 1
  },
  {
    "timestamp": "2025-01-15T10:55:00Z",
    "agent": "romantic-fantasy-writer-style-auditor",
    "task_id": "style/audit",
    "artifacts": ["audit-reports/style/GATE-style-001.json"],
    "status": "completed",
    "result": "gate-passed",
    "iteration": 1
  }
]
```
