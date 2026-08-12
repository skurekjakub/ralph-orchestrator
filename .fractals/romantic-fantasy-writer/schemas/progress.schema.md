# progress.json — Schema

## Purpose

Pipeline execution state tracking for the orchestrator. Tracks which creative phase is active, per-chapter progress, gate statuses, and the revision↔beta loop counter.

## Write Protocol

**read-modify-write** — Only the orchestrator writes. Read the current state, modify the relevant fields, write back.

## Writers

- `romantic-fantasy-writer` (orchestrator)

## Readers

- `romantic-fantasy-writer` (orchestrator) — for routing decisions
- All coordinators — to determine their phase status

## Schema

```json
{
  "storyId": "string — Active story identifier",
  "currentPhase": "string — Active creative phase (not-started|concept|worldbuilding|character|plotting|style|drafting|revision|beta-reading|polish|delivered)",
  "phaseStatuses": {
    "<phase-name>": {
      "status": "string — pending|in-progress|completed|blocked",
      "startedAt": "string|null — ISO-8601 timestamp",
      "completedAt": "string|null — ISO-8601 timestamp",
      "gateResult": "string|null — pass|revise|block"
    }
  },
  "chapterProgress": [
    {
      "chapterNum": "number",
      "drafted": "boolean",
      "revised": "boolean",
      "betaRead": "boolean",
      "polished": "boolean"
    }
  ],
  "currentChapter": "number|null — Chapter currently being processed (sequential per INV-012)",
  "gapCycles": "number — Number of gap-hunting cycles completed",
  "revisionBetaCycles": "number — Current revision↔beta loop count (max: 2)",
  "lastUpdated": "string — ISO-8601 timestamp"
}
```

## ID Scheme

N/A — Singleton per story. Located at `stories/{storyId}/progress.json`.

## Example

```json
{
  "storyId": "crimson-court-1",
  "currentPhase": "drafting",
  "phaseStatuses": {
    "concept":       { "status": "completed", "startedAt": "2025-01-15T10:05:00Z", "completedAt": "2025-01-15T10:12:00Z", "gateResult": "pass" },
    "worldbuilding": { "status": "completed", "startedAt": "2025-01-15T10:12:00Z", "completedAt": "2025-01-15T10:25:00Z", "gateResult": "pass" },
    "character":     { "status": "completed", "startedAt": "2025-01-15T10:25:00Z", "completedAt": "2025-01-15T10:40:00Z", "gateResult": "pass" },
    "plotting":      { "status": "completed", "startedAt": "2025-01-15T10:40:00Z", "completedAt": "2025-01-15T10:55:00Z", "gateResult": "pass" },
    "style":         { "status": "completed", "startedAt": "2025-01-15T10:55:00Z", "completedAt": "2025-01-15T11:02:00Z", "gateResult": "pass" },
    "drafting":      { "status": "in-progress", "startedAt": "2025-01-15T11:02:00Z", "completedAt": null, "gateResult": null },
    "revision":      { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "beta-reading":  { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "polish":        { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null }
  },
  "chapterProgress": [
    { "chapterNum": 1, "drafted": true, "revised": false, "betaRead": false, "polished": false },
    { "chapterNum": 2, "drafted": false, "revised": false, "betaRead": false, "polished": false }
  ],
  "currentChapter": 2,
  "gapCycles": 0,
  "revisionBetaCycles": 0,
  "lastUpdated": "2025-01-15T11:15:00Z"
}
```
