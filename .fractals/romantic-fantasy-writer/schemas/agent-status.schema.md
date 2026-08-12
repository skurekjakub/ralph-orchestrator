# agents/*/status.json — Schema

## Purpose

Per-agent routing signal. The orchestrator and coordinators read these to make routing decisions. Each agent writes its own status on completion. This is the primary inter-agent communication mechanism.

## Write Protocol

**create-once-per-iteration** — Each agent writes its own status.json when it completes a task. On retry (new iteration), the file is overwritten.

## Writers

- Each agent (own status only)

## Readers

- Parent coordinator (for dispatch decisions)
- Orchestrator (for phase-level routing)

## Schema

```json
{
  "agent": "string — Agent name",
  "task_id": "string — Task identifier (e.g., 'concept/develop', 'drafting/chapter-003')",
  "status": "string — completed|failed|blocked",
  "result": "string — Agent-specific result code used in routing tables",
  "summary": "string — Human-readable summary of what was done",
  "artifacts": ["string — Paths to artifacts produced"],
  "next_hint": "string|null — Suggested next agent (advisory only)",
  "findings": {
    "critical": "number — Count of critical findings (auditors only)",
    "major": "number — Count of major findings",
    "minor": "number — Count of minor findings"
  },
  "iteration": "number — Iteration counter (starts at 1)"
}
```

### Result Codes

Each agent type defines its own result codes. Common patterns:

| Agent Type | Result Codes |
|------------|-------------|
| Specialists | `completed`, `failed`, `blocked` |
| Auditors | `gate-passed`, `gate-failed`, `gate-blocked` |
| Coordinators | `complete`, `blocked`, `revision-required` |
| Beta Synthesizer | `accepted`, `revision-required` |
| Orchestrator | `delivered`, `blocked` |

## ID Scheme

Files are at `agents/{agent-short-name}/status.json` where `agent-short-name` is the agent name without the `romantic-fantasy-writer-` prefix.

## Example (Specialist)

```json
{
  "agent": "romantic-fantasy-writer-concept-developer",
  "task_id": "concept/develop",
  "status": "completed",
  "result": "completed",
  "summary": "Developed story concept with 3 thematic pillars, genre balance 0.6 fantasy / 0.4 romance, enemies-to-lovers arc type.",
  "artifacts": ["story-concept.json"],
  "next_hint": "romantic-fantasy-writer-craft-profile-selector",
  "findings": null,
  "iteration": 1
}
```

## Example (Auditor)

```json
{
  "agent": "romantic-fantasy-writer-concept-auditor",
  "task_id": "concept/audit",
  "status": "completed",
  "result": "gate-failed",
  "summary": "Concept rejected: thematic pillars lack specificity, genre balance skews too far toward fantasy (0.85/0.15).",
  "artifacts": ["audit-reports/concept/GATE-concept-001.json"],
  "next_hint": "romantic-fantasy-writer-concept-developer",
  "findings": { "critical": 1, "major": 1, "minor": 0 },
  "iteration": 1
}
```
