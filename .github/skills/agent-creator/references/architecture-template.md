# Architecture Template

Use this template for the Phase 2 deliverable. Reference `agent-as-function/references/data-flow-patterns.md` for routing table patterns.

---

# Architecture: {Agent Family Name}

## Subagent Roster Summary

| Name | Model | Role | Conditional? |
|---|---|---|---|
| {subagent-1} | {claude-opus-4.6} | {One-line role} | {No / Yes — condition} |
| {subagent-2} | {claude-sonnet-4} | {One-line role} | {No / Yes — condition} |

## Routing Table

| Agent completed | result | Action |
|---|---|---|
| {subagent-1} | {result-code-1} | {dispatch subagent-2} |
| {subagent-1} | {result-code-2} | {log blocker, exit with blocked status} |
| {subagent-2} | {result-code-1} | {dispatch subagent-3} |
| {subagent-2} | {result-code-2} | {dispatch subagent-2 (iteration++, max N)} |
| {subagent-3} | {result-code-1} | {dispatch subagent-4} |
| Any subagent | `failed` | {Log failure, exit with error status} |

### Completeness Check

- [ ] Every subagent's every result code appears in the table
- [ ] Every row has a clear next action
- [ ] Iteration limits are explicit with max counts
- [ ] Error/blocked paths lead to graceful exits
- [ ] No action results in an infinite loop or hang

## Data Flow

```
{subagent-1} → writes {subagent-1}/output.md
  ↓ (filesystem read)
{subagent-2} → reads {subagent-1}/output.md, writes {subagent-2}/output.md
  ↓ (filesystem read)
{subagent-3} → reads {subagent-2}/output.md + {changed files}, writes {subagent-3}/output.md
  ↓ (routing loop on needs-revision)
{subagent-2} → reads {subagent-3}/output-v{N-1}.md, writes {subagent-2}/output-v{N}.md
  ...
{final-agent} → reads all */output.md + manifest.json, writes {final-agent}/output.md
```

### Data Flow Verification

- [ ] Orchestrator appears nowhere in data transmission
- [ ] Every file written by one subagent that's read by another is listed
- [ ] No subagent depends on data only available in the orchestrator's context

## Artifact Directory Structure

```
{artifact-root}/
├── {subagent-1}/
│   ├── output.md
│   └── status.json
├── {subagent-2}/
│   ├── output-v{N}.md       (versioned for iterating agents)
│   └── status.json
├── {subagent-3}/
│   ├── output-v{N}.md
│   └── status.json
├── {final-agent}/
│   ├── output.md
│   └── status.json
└── manifest.json
```

**Artifact root:** `{e.g., .ralph/tasks/{task-id}/artifacts/}`

## Model Allocation

| Agent | Model | Rationale |
|---|---|---|
| orchestrator | {claude-opus-4.6} | {Routing complexity requires strong reasoning} |
| {subagent-1} | {claude-opus-4.6} | {Deep analysis / coding / review} |
| {subagent-2} | {claude-sonnet-4} | {Mechanical extraction / formatting} |

## Iteration Loops

| Loop | Agents involved | Max iterations | Trigger |
|---|---|---|---|
| {e.g., write-review} | {writer → reviewer → writer} | {3} | {reviewer returns `needs-revision`} |
| {e.g., build-fix} | {coder → coder} | {2} | {coder returns `build-broken`} |

## Parallel Dispatch Opportunities

| Group | Agents | Dispatch condition | Aggregation |
|---|---|---|---|
| {e.g., review panel} | {reviewer-1, reviewer-2, reviewer-3} | {After writer completes} | {All must complete; any rejection triggers revision} |

{If no parallel dispatch opportunities, write "None — fully sequential pipeline."}

## Ordering Constraints

Hard sequencing rules that must never be violated:

1. {e.g., researcher MUST complete BEFORE planner is dispatched}
2. {e.g., planner MUST complete BEFORE writer is dispatched}
3. {e.g., All reviewers MUST complete BEFORE commit}

## Error Handling

| Failure | Agent | Response |
|---|---|---|
| {e.g., Access denied to repo} | {researcher} | {Exit with `blocked`, log blocker} |
| {e.g., Build broken after max retries} | {coder} | {Set status `partial`, proceed to handoff} |
| {e.g., Reviewer crashes} | {reviewer} | {Log, proceed without that review} |

## Post-Task Hooks

{If this agent family needs post-execution analysis (scientist-style), define the hooks here.}

| Hook | Purpose | Model |
|---|---|---|
| {e.g., run-analyzer} | {Per-subagent quality analysis} | {claude-opus-4.6} |

{If no post-task hooks, write "None planned for initial version."}
