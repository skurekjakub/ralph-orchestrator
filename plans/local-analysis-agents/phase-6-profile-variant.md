# Phase 6: Profile Variant

**Goal:** Add a `postTaskHooks` variant to the ralph-docs profile that runs analysis after the primary agent.

*Depends on: all previous phases.*

## Changes

### `profiles/ralph-docs/profile.json`

Add a new variant with a dedicated `commentTrigger` and `postTaskHooks`:

```json
{
  "match": {
    "projects": ["DOC"],
    "statuses": ["Open", "Ready for docs"],
    "commentTrigger": "@RalphAnalyzed"
  },
  "stages": [
    { "agent": "ralph.ralph", "role": "primary", "mode": "container" }
  ],
  "postTaskHooks": [
    {
      "name": "run-analysis",
      "stages": [
        { "agent": "ralph.run-analyzer", "role": "analyzer", "mode": "local", "model": "claude-sonnet-4-20250514" },
        { "agent": "ralph.agent-improver", "role": "improver", "mode": "local" }
      ]
    }
  ],
  "beforeAgent": { "targetStatus": "In Progress" },
  "afterAgent": { "targetStatus": "Review" }
}
```

The existing `@RalphDf` variant is unchanged — single-stage, no hooks.

### Execution flow

1. **primary** (container) — writes documentation, creates PR
2. Main pipeline completes → log collection → container teardown → JIRA transition
3. Hook **"run-analysis"** starts:
   - **analyzer** (local, sonnet) — reads collected logs, produces `output/logs/<taskId>/hooks/run-analysis/analysis.md`
   - **improver** (local, opus) — reads analysis, proposes template/skill/MCP improvements in the orchestrator repo, writes `output/logs/<taskId>/hooks/run-analysis/improvements.md`

## Files

- `profiles/ralph-docs/profile.json` — new variant

## Verification

1. `npm run validate` passes with the new variant.
2. Schema validation accepts `postTaskHooks` with local-only stages (Phase 1).
3. Trigger scanner matches `@RalphAnalyzed` comments correctly.
4. End-to-end manual test: trigger the variant on a test issue, observe main pipeline + hook execution.
5. Hook output directory `output/logs/<taskId>/hooks/run-analysis/` exists after execution with `analysis.md` and `improvements.md`.
