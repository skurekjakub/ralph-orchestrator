# Local Analysis Agents — Implementation Plan

Post-task hook pipelines that run after the primary container agent completes. Both operate entirely within the orchestrator repo — they never touch the target repo.

- **Run Analyzer** (`ralph.run-analyzer`): reads collected execution logs → produces structured quality analysis report
- **Agent Improver** (`ralph.agent-improver`): reads analyzer report → proposes improvements to agent templates, skills, shared includes, MCP servers

## Architecture: `postTaskHooks`

Hooks are a **separate concept from the main stage pipeline**. Each hook is a named pipeline of local-only stages. They run after the main pipeline completes, logs are collected, and the container is torn down.

```
Main pipeline (stages[])
  → container start → stage 1 (primary) → [stage N...] → result
  → log collection (collectAll)
  → container teardown
  → JIRA transitions + comments

Post-task hooks (postTaskHooks[]) — sequential
  → hook "run-analysis"
    → analyzer (local) → improver (local)
  → [hook N...]
  → done
```

### Config shape

```json
{
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
  ]
}
```

### Key semantics

- **Local-only** — hook stages must be `mode: "local"`. Enforced at schema level.
- **Hook-to-hook** — sequential. One hook's failure does NOT block the next.
- **Within a hook** — sequential, abort-on-fail (analyzer fails → improver skipped).
- **Failure visibility** — warning in activity log only. No JIRA comments from hooks.
- **JIRA transitions** — happen based on main pipeline result, before hooks run.
- **Hook output** — each hook writes to `outputDir/hooks/<hook-name>/`.
- **Template context** — hooks share `TaskContext` with `outputDir` and `collectedLogs` from the main pipeline. Stage indices are scoped to the hook's pipeline.

## Phases

| Phase | File | Focus |
|---|---|---|
| 1 | [phase-1-schema.md](phase-1-schema.md) | `IPostTaskHook` type + Zod schema, local-only enforcement |
| 2 | [phase-2-container-lifecycle.md](phase-2-container-lifecycle.md) | `isRunning()` guard on ContainerManager |
| 3 | [phase-3-hook-executor.md](phase-3-hook-executor.md) | `executePostTaskHooks()` in TaskRunner |
| 4 | [phase-4-template-context.md](phase-4-template-context.md) | `outputDir` + `collectedLogs` in TaskContext/templates |
| 5 | [phase-5-agent-templates.md](phase-5-agent-templates.md) | Run Analyzer + Agent Improver templates |
| 6 | [phase-6-profile-variant.md](phase-6-profile-variant.md) | `postTaskHooks` variant in ralph-docs |

**Dependency graph:** Phases 1–2 are independent (parallel). Phase 3 depends on both. Phase 4 depends on 3. Phase 5 is independent of 1–4. Phase 6 depends on all.

## Decisions

- **Post-task hooks, not mixed-mode stages** — clean lifecycle boundary between container pipeline and local analysis
- **Hooks are pipelines** — each hook has a `name` and a `stages[]` array reusing the same stage schema
- **Renamed:** gap-filler → **agent-improver** (reflects actual purpose)
- **Local agents don't touch target repo** — only orchestrator templates, skills, includes, MCP servers
- **No git operations** from local agents — user reviews and commits
- **Hook failure = warning only** — main task result and JIRA transitions are unaffected
- **Hook output isolation** — `outputDir/hooks/<hook-name>/` per hook
- **Agent improver depends on analyzer** — sequential within the same hook pipeline

## Open Considerations

1. **Abort behavior:** If analyzer fails, agent-improver is skipped (abort-on-fail within the hook). Consider `continueOnFailure` on `IStageConfig` for future flexibility.
2. **Feedback loop safety:** Agent-improver modifies templates affecting future runs. Consider dry-run mode (report only, no edits) via trigger param — `@RalphAnalyzed(dry-run)`.
3. **Future: container hooks** — if a hook needs container access, could spin up a fresh container. Not needed now — enforce local-only and revisit later.
