# progress.json Schema

Tracks pipeline state across the full fractal factory execution (Pass 0 + 7 domain passes + synthesis). Owned exclusively by the session orchestrator — no other agent writes to this file.

## Schema

```json
{
  "version": 2,
  "lastUpdated": "<ISO-8601-UTC timestamp | null>",
  "currentPass": "<pass0 | discovery | analysis | planning | execution | verification | gapHunting | synthesis | delivery>",

  "passes": {
    "pass0": {
      "status": "pending | active | completed | skipped",
      "coordinator": null,
      "note": "Knowledge curation — direct dispatch to knowledge-curator, no coordinator. Skipped when metaKnowledge.enabled == false."
    },
    "discovery": {
      "status": "pending | active | completed",
      "completedAgents": "<number>",
      "totalAgents": "<number>",
      "coordinator": "fractal-factory-discovery-coordinator"
    },
    "analysis": { "...same shape as discovery..." },
    "planning": { "...same shape as discovery..." },
    "execution": { "...same shape as discovery..." },
    "verification": { "...same shape as discovery..." },
    "gapHunting": { "...same shape as discovery..." },
    "synthesis": {
      "status": "pending | active | completed | skipped",
      "coordinator": "fractal-factory-synthesis-coordinator",
      "note": "Skipped when metaKnowledge.enabled == false."
    },
    "delivery": { "...same shape as discovery..." }
  },

  "counts": {
    "subdomainsDiscovered": "<number>",
    "invariantsExtracted": "<number>",
    "agentsPlanned": "<number>",
    "agentsWritten": "<number>",
    "agentsVerified": "<number>",
    "agentsBlocked": "<number>",
    "metaKnowledge": {
      "designed": "<number>",
      "written": "<number>",
      "reviewed": "<number>",
      "verified": "<number>"
    }
  },

  "gapHunting": {
    "currentCycle": "<number>",
    "maxCycles": "<number, from context.json options>",
    "newItemsPerCycle": ["<number per cycle, e.g. [5, 2, 0]>"],
    "converged": "<boolean, true when last entry in newItemsPerCycle is 0>"
  }
}
```

## Pass Status Transitions

```
pending → active → completed
```

On re-entry from gap hunting, the orchestrator:
1. Resets all domain passes from `suggestedReEntryPass` through gapHunting to `pending`
2. Deletes status.json files for all agents belonging to reset passes
3. Increments `gapHunting.currentCycle`
4. Resumes routing from the reset pass (transitions to `active` on dispatch)

**Pass 0 and synthesis are never reset.** They run exactly once and are excluded from re-entry.

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
