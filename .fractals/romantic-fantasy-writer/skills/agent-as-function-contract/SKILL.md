# Agent-as-Function Contract — Romantic Fantasy Writer

## Purpose

Every agent in the romantic-fantasy-writer system operates as a **pure function**: it reads input artifacts from the filesystem, performs its creative or routing work, writes output artifacts, and writes its own `status.json`. No agent communicates with another agent directly — all coordination happens through filesystem artifacts and status-based routing.

## Contract Rules

### Input Contract
- **Read only what your prompt specifies.** A geography-builder reads `story-config.json` and `story-concept.json` — never character files.
- **Fail explicitly if inputs are missing.** If `story-config.json` is absent, write `status.json` with `result: "blocked"` and a clear `summary` explaining what's missing. Never fabricate input data.
- **Respect write protocols.** Before reading a `read-modify-write` artifact, check that it exists. For `create-once` artifacts, verify no prior version exists before writing.

### Output Contract
- **Write exactly the artifacts your prompt specifies.** A chapter-drafter writes `chapters/{N}/draft.md` and `chapters/{N}/metadata.json` — nothing else.
- **Write your status.json last.** Status is the routing signal. Writing it prematurely (before output artifacts are complete) creates a race condition where the coordinator dispatches the next agent before your work is available.
- **Never modify another agent's status.json.** Only the agent itself writes its own status. The sole exception is coordinators deleting subordinate statuses on retry (`resetOnRetry` pattern).

### Status Contract
Every agent writes to `agents/{agent-name}/status.json`:

```json
{
  "agent": "romantic-fantasy-writer-geography-builder",
  "status": "completed",
  "result": "completed",
  "summary": "Created geography.json with 3 regions, 7 landmarks, climate system.",
  "artifactsWritten": ["world-bible/geography.json"],
  "artifactsRead": ["story-config.json", "story-concept.json"],
  "iteration": 1,
  "timestamp": "2026-03-16T10:00:00Z"
}
```

### Result Codes Used in This System

| Code | Meaning | Used By |
|------|---------|---------|
| `completed` | Work done successfully | All specialists |
| `complete` | All children done, phase gate passed | All coordinators |
| `blocked` | Cannot proceed (missing input or max retries hit) | Any agent |
| `failed` | Auditor: work does not meet quality bar | All auditors |
| `passed` | Auditor: work meets quality bar | All auditors |
| `delivered` | Full pipeline success | Orchestrator |
| `delivered-with-gaps` | Pipeline completed but non-critical issues remain | Orchestrator |
| `revision-required` | Beta synthesis determined chapters need another revision pass | beta-synthesizer (data field in synthesis output, surfaced by beta-reading-coordinator) |
| `revision-loop` | Coordinator routes back to revision phase from beta | All phase coordinators (8) — orchestrator consumes this code for cross-phase routing |

### Retry Pattern
When an auditor returns `failed`, the coordinator:
1. Deletes all `resetOnRetry` status files (all writers under that coordinator)
2. Passes the auditor's feedback artifact path to the writers
3. Re-dispatches the writers
4. Re-dispatches the auditor

This is the fundamental quality loop. It applies to every creative phase: concept, worldbuilding, character, plotting, style, drafting, revision, and beta-reading.

### Artifact Path Conventions
All paths are relative to the per-story root: `.romantic-fantasy-writer/stories/{story-id}/`

- Agent statuses: `agents/{agent-name}/status.json`
- World artifacts: `world-bible/{subcategory}.json`
- Character artifacts: `characters/{CHAR-NNN}.json`
- Chapter artifacts: `chapters/{NNN}/draft.md`, `chapters/{NNN}/revised.md`, `chapters/{NNN}/final.md`
- Audit reports: `audit-reports/{phase}/gate.json`
- Cross-cutting trackers: `continuity/`, `craft-tracking/`

### No Silent Failures (INV-030)
Every agent must report failures explicitly via status.json. No agent may silently swallow errors, skip work, or report `completed` when `blocked`. If an agent encounters an error it cannot recover from, it must write `blocked` with a descriptive summary.
