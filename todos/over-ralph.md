# Over-Ralph — Task Decomposition & Multi-Issue Planning

## What This Is

A higher-level agent variant that takes large, fuzzy JIRA tasks and breaks them into a structured implementation roadmap — creating subtasks, sequencing dependencies, and potentially handing off individual pieces to standard Ralph agents.

## Core Concept

Some JIRA issues are too large or ambiguous for a single Ralph session: "Document the entire custom module system" or "Audit all code samples for v30 compatibility." Over-Ralph reads the epic/story, researches the scope, and produces a concrete breakdown — either as JIRA subtasks or as a structured plan document.

The current `ralph.overralph` agent exists but lacks a defined artifact format and JIRA integration for subtask creation. This todo refines what Over-Ralph should actually produce and how it fits into the orchestrator's workflow.

## Expected Artifacts

### Option A: JIRA Subtasks

Over-Ralph creates subtasks under the parent issue via the JIRA MCP server. Each subtask is a self-contained documentation task that a standard Ralph can pick up:

```
DOC-3000: Document custom modules (epic/story)
  └── DOC-3001: Document custom module registration API
  └── DOC-3002: Document module lifecycle hooks
  └── DOC-3003: Update code samples for CustomModuleBase
  └── DOC-3004: Add migration guide from v29 modules
```

Each subtask has:
- Clear scope (specific files, APIs, or concepts)
- Estimated complexity label
- Dependencies on other subtasks (if any)
- Suggested trigger params (e.g. `codesamples`, `branch_name`)

This approach enables the orchestrator to automatically process subtasks as they're created — they match variant rules and get triggered individually.

### Option B: Planning Document

Over-Ralph produces a structured markdown plan attached to the parent issue as a handoff. The human reviews and manually creates subtasks (or triggers individual Ralph runs with specific scopes).

This is lower-risk but less autonomous. It's a reasonable starting point before trusting auto-subtask creation.

### Recommendation

Start with Option B (planning document), then graduate to Option A once confidence is high. The plan document format should be designed to be machine-parseable so a future upgrade can auto-create subtasks from it.

## What Changes in the Codebase

### Over-Ralph Template Refinement

The `ralph.overralph.agent.md` template needs:
- A structured output format for the implementation plan (not freeform prose)
- Research phase that explores both the codebase AND existing documentation coverage gaps
- Dependency analysis: which pieces must come before others
- Scope estimation: tag each piece as small/medium/large
- Trigger param suggestions per subtask

### JIRA Subtask Creation (Option A)

If subtasks are created via MCP:
- The `jira-kentico` MCP server needs a `create_subtask` tool (or the existing `jira_create_issue` tool with `parent` field support)
- The orchestrator needs to handle subtask triggers — currently it scans for `commentTrigger` on issues. Subtasks would need their own triggers or auto-processing.
- Over-Ralph needs permission/tooling to set issue fields (summary, description, labels, components) on new subtasks

### Orchestrator Workflow

Over-Ralph doesn't follow the standard "branch → write → review → PR" workflow. It's research-only. The orchestrator needs to know that Over-Ralph operations don't produce branches or PRs — the after-agent transition should be different (maybe transition to "Backlog" or "Planned").

### Profile Configuration

Over-Ralph might need different `beforeAgent`/`afterAgent` transitions than standard Ralph. Currently it has no transitions defined in `profile.json`. Needs explicit configuration for what happens when planning is complete.

## Open Questions

- **Subtask trigger**: If Over-Ralph creates subtasks, should they auto-trigger Ralph? Or should a human review the plan and manually trigger?
- **Scope validation**: How does Over-Ralph verify its scope breakdown is complete? Could it miss important subsystems?
- **Iterative refinement**: Should Over-Ralph be re-triggerable to refine its plan based on human feedback on the planning document?
- **Cross-issue awareness**: Should Over-Ralph check the ralphchives (if available) or existing completed issues to avoid planning work that's already been done?
