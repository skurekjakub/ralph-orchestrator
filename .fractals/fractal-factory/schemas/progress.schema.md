# progress.json Schema

Tracks pipeline state across the 7-pass fractal factory execution. Owned exclusively by the session orchestrator — no other agent writes to this file.

## Schema

```json
{
  "version": 1,
  "lastUpdated": "<ISO-8601-UTC timestamp | null>",
  "currentPass": "<0-7, 0 = not started>",

  "passes": {
    "pass1_discovery": {
      "status": "pending | active | completed | re-entered",
      "completedAgents": "<number>",
      "totalAgents": "<number>",
      "coordinator": "<coordinator agent name>"
    },
    "pass2_analysis": { "...same shape..." },
    "pass3_planning": { "...same shape..." },
    "pass4_execution": { "...same shape..." },
    "pass5_verification": { "...same shape..." },
    "pass6_gapHunting": { "...same shape..." },
    "pass7_delivery": { "...same shape..." }
  },

  "counts": {
    "subdomainsDiscovered": "<number>",
    "invariantsExtracted": "<number>",
    "agentsPlanned": "<number>",
    "agentsWritten": "<number>",
    "agentsVerified": "<number>",
    "agentsBlocked": "<number>"
  },

  "gapHunting": {
    "cyclesCompleted": "<number>",
    "maxCycles": "<number, from context.json options>",
    "newItemsPerCycle": ["<number per cycle, e.g. [5, 2, 0]>"],
    "converged": "<boolean, true when last entry in newItemsPerCycle is 0>"
  }
}
```

## Pass Status Transitions

```
pending → active → completed
                 → re-entered (from gap-hunting re-entry) → active → completed
```

On re-entry, the orchestrator:
1. Sets the target pass status to `re-entered`
2. Resets all passes AFTER the target pass to `pending`
3. Increments `gapHunting.cyclesCompleted`
4. On the next dispatch cycle, the re-entered pass transitions to `active`

## Recomputation Rules

After each coordinator returns, the orchestrator recomputes counts by reading actual artifacts:
- `subdomainsDiscovered`: count entries in `domain-model.json.subdomains`
- `invariantsExtracted`: count entries in `domain-model.json.invariants`
- `agentsPlanned`: count entries in `roster.json.agents`
- `agentsWritten`: count agents in roster with status `written` or later
- `agentsVerified`: count agents in roster with status `verified`
- `agentsBlocked`: count agents in roster with status `blocked`

## Version History

- Version 1: Initial schema
