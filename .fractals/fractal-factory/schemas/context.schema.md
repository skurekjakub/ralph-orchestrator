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
    "pipelinePasses": "<string[], which passes the produced system should have — subset of the universal 7>",
    "humanFeedbackEnabled": "<boolean, default true — whether the orchestrator checks for human-feedback.md after execution cycles>",
    "reEntryPolicy": {
      "mode": "<rigid | tiered | agent-discretion>",
      "humanFeedbackCanTriggerAnalysis": "<boolean, default true for tiered, false for rigid>",
      "rules": [
        {
          "trigger": "<feedback source>",
          "reEntryPass": "<pass number>",
          "resetPasses": ["<pass numbers to reset>"],
          "scope": "<all | affected-tasks-only>"
        }
      ]
    }
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

### options.humanFeedbackEnabled
When `true` (default), the produced orchestrator checks for `.<domain>/human-feedback.md` after each execution cycle. The planner is re-dispatched with the feedback contents. Set to `false` for fully autonomous systems that don't need mid-run human steering.

### options.reEntryPolicy
Controls how the produced system re-enters earlier pipeline passes when feedback (from gap hunting, verification, human feedback, or analysis) requires rework.

**`mode`** — one of:
- `rigid`: Each trigger type always restarts from a fixed pass. Simple, predictable. The `rules` array must have one entry per trigger type.
- `tiered` (recommended): Different feedback sources trigger different re-entry points based on severity. Gap hunting that discovers new items needing analysis restarts from Pass 2; gap hunting with only task-level gaps restarts from Pass 3; verification failure re-enters at Pass 4 for affected tasks only. Human feedback re-dispatches the planner within the current execution cycle.
- `agent-discretion`: The orchestrator/coordinators decide the re-entry point dynamically based on feedback content. Set `rules: []` — the pipeline-architect designs adaptive routing instead of fixed rules.

**`humanFeedbackCanTriggerAnalysis`** — Whether human feedback can push the system back to analysis (Pass 2) or is limited to re-planning within execution. Default: `true` for tiered mode, `false` for rigid mode.

**`rules`** — Array of re-entry rules. Each rule specifies:
- `trigger`: The feedback source. Well-known values: `gap-hunting-new-items`, `gap-hunting-task-gaps`, `verification-failure`, `human-feedback`, `analysis-reentry`.
- `reEntryPass`: Which pass to restart from (2–6).
- `resetPasses`: Which passes to reset to `pending` (typically all passes from `reEntryPass` onward).
- `scope`: `all` reprocesses every task; `affected-tasks-only` limits rework to tasks referenced in the feedback (only meaningful for verification-failure and human-feedback triggers).

The pipeline-architect reads this policy and designs the produced orchestrator's re-entry routing accordingly. For `agent-discretion` mode, the pipeline-architect ignores `rules` and designs adaptive routing in `architecture.json` directly.

## Validation

The guide agent validates context.json before invoking the orchestrator:
- `domain.name` is non-empty and matches `/^[a-z][a-z0-9-]*$/`
- `target.outputDirectory` is a valid path
- `target.namingPrefix` matches the same pattern as domain.name
- `inputs.domainBrief` points to an existing file
- `options.maxDepth` is 2 or 3
- `options.maxAgents` is between 5 and 100
- `options.maxGapCycles` is between 1 and 10
