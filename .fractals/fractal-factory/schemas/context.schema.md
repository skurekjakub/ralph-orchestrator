# context.json Schema

User-provided configuration that parameterizes the fractal factory run. Filled in by the guide agent after user interview, or manually by the user before invoking the orchestrator.

## Schema

```json
{
  "version": 1,

  "domain": {
    "name": "<string, short identifier, e.g. 'security-audit', 'api-migration'>",
    "description": "<string, 1-3 sentence description of what the produced agent system should do>"
  },

  "target": {
    "outputDirectory": "<string, absolute or relative path where the produced agent family is written>",
    "namingPrefix": "<string, prefix for all produced agent names, e.g. 'security-audit' → 'security-audit-domain-scanner'>"
  },

  "inputs": {
    "domainBrief": "<string, path to domain-brief.md — narrative description of the domain>",
    "domainDocs": "<string | null, path to directory of supporting documents>",
    "exemplars": "<string | null, path to directory of exemplar agent families to learn from>",
    "invariants": "<string | null, path to invariants.md — behavioral rules that must be preserved>",
    "constraints": "<string | null, path to constraints.json — bounds and hard requirements>"
  },

  "options": {
    "maxDepth": "<2 | 3, default 3 — maximum hierarchy depth for the produced system>",
    "maxAgents": "<number, default 50 — upper bound on total agents in produced system>",
    "maxGapCycles": "<number, default 3 — how many gap-hunting re-entry cycles before forced delivery>",
    "maxWriterReviewerRetries": "<number, default 3 — prompt-writer → prompt-reviewer loop retry limit>",
    "maxWriterReviewerBatchSize": "<number, default 5 — maximum agents processed in a single prompt-writer → prompt-reviewer batch>",
    "pipelinePasses": "<string[], which passes the produced system should have — subset of the universal 7>"
  }
}
```

## Field Details

### domain.name
Used as the artifact directory prefix (`.{name}/`) and in generated agent descriptions. Should be a short, lowercase, hyphenated identifier.

### target.outputDirectory
Where all produced files go:
```
{outputDirectory}/
├── agents/           — .agent.md files for every produced agent
├── schemas/          — Artifact JSON schemas for the produced system
├── skills/           — Domain-specific skills for the produced agents
├── tests/            — Golden test scenario files
├── docs/             — Architecture doc, user guide, roster reference
├── bootstrap.sh      — Bootstrap script for the produced system
└── manifest.json     — Build manifest (what was produced and when)
```

### target.namingPrefix
Applied to every agent name in the produced system. The factory names its own agents `fractal-factory-*`; the produced system names its agents `{namingPrefix}-*`.

### inputs.domainBrief
Required. A markdown file describing the domain in narrative form. The domain-scanner reads this to understand what the produced system should process. Should cover:
- What the subject matter is
- What "done" looks like
- Key challenges and edge cases
- Existing tools or assets that can be reused

### inputs.invariants
Optional but strongly recommended. A markdown file listing behavioral rules, quality constraints, or domain-specific requirements that the produced system must enforce. Discovery agents extract structured invariants from this file and embed them in agent prompts.

### inputs.exemplars
Optional. A directory containing existing agent families (`.agent.md` files, skills, artifact schemas) that the factory should learn patterns from. The exemplar-analyzer extracts hierarchy patterns, naming conventions, and routing idioms.

### inputs.constraints
Optional. A JSON file with hard constraints:
```json
{
  "maxAgents": 30,
  "requiredPasses": ["discovery", "execution", "verification"],
  "excludedPatterns": ["no test-writing agents"],
  "requiredRoles": ["risk-analyzer"],
  "targetRuntime": "copilot"
}
```

### options.pipelinePasses
Controls which of the 7 universal passes the produced system includes. The factory always runs all 7 of its own passes, but the produced system may skip passes that don't apply. For example, a simple audit system might only need `["discovery", "analysis", "verification", "delivery"]`.

## Validation

The guide agent validates context.json before invoking the orchestrator:
- `domain.name` is non-empty and matches `/^[a-z][a-z0-9-]*$/`
- `target.outputDirectory` is a valid path
- `target.namingPrefix` matches the same pattern as domain.name
- `inputs.domainBrief` points to an existing file
- `options.maxDepth` is 2 or 3
- `options.maxAgents` is between 5 and 100
- `options.maxGapCycles` is between 1 and 10
- `options.maxWriterReviewerBatchSize` is between 1 and 10
