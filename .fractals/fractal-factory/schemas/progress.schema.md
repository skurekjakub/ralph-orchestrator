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
    "tasksPlanned": "<number>",
    "tasksImplemented": "<number>",
    "tasksVerified": "<number>",
    "tasksBlocked": "<number>",
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
1. Resets execution, verification, and gapHunting passes to `pending`
2. Deletes status.json files for agents in those passes
3. Increments `gapHunting.currentCycle`
4. Resumes routing from the execution pass (transitions to `active` on dispatch)

No pass-state reset beyond execution→gapHunting is needed — gap hunters mutate `production-graph.json` directly, and the execution coordinator picks up new/re-planned tasks from the graph.

## Recomputation Rules

After each coordinator returns, the orchestrator recomputes counts by reading actual artifacts:
- `subdomainsDiscovered`: count entries in `domain-model.json.subdomains`
- `invariantsExtracted`: count invariant files in `.fractal-factory/invariants/`
- `agentsPlanned`: count entries in `roster.json.agents`
- `tasksPlanned`: read `production-graph.json.summary.byStatus.planned`
- `tasksImplemented`: read `production-graph.json.summary.byStatus.implemented`
- `tasksVerified`: read `production-graph.json.summary.byStatus.verified`
- `tasksBlocked`: read `production-graph.json.summary.byStatus.blocked`

## Version History

- Version 2: Graph-based task tracking replaces roster status lifecycle counts
- Version 1: Initial schema
