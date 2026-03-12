# Responsibility Template

Use this template for the Phase 1 deliverable. Follow the procedure in `agent-as-function/references/subagent-analysis.md`.

---

# Responsibility Analysis: {Agent Family Name}

## Responsibility Inventory

| # | Responsibility | Reads | Produces | Cognitive Load | Tools Needed |
|---|---|---|---|---|---|
| 1 | {e.g., Analyze JIRA issue} | {JIRA fields, PR comments} | {Implementation plan} | {High} | {JIRA API} |
| 2 | {e.g., Research source code} | {Repo files, API docs} | {Research report} | {High} | {File read, grep, fetch} |
| 3 | {e.g., Write documentation} | {Research report, plan} | {Doc files, change summary} | {High} | {File edit} |
| 4 | {e.g., Review quality} | {Changed files, conventions} | {Review report} | {High} | {File read} |
| 5 | {e.g., Run build} | {Source code} | {Build result} | {Low} | {Terminal} |
| 6 | {e.g., Commit and push} | {Changed files} | {Git commits} | {Low} | {Git CLI, ADO API} |

## Classification

| # | Responsibility | → | Rationale |
|---|---|---|---|
| 1 | {Analyze JIRA issue} | **subagent: analyst** | {High reasoning, substantial artifact, consumed by coder} |
| 2 | {Research source code} | **subagent: researcher** | {High reasoning, domain expertise, reusable} |
| 3 | {Write documentation} | **subagent: writer** | {High reasoning, substantial output, needs iteration} |
| 4 | {Review quality} | **subagent: reviewer** | {High judgment, different perspective} |
| 5 | {Run build} | **embedded in writer** | {Mechanical, tightly coupled} |
| 6 | {Commit and push} | **orchestrator** | {Administrative, <10 lines} |

## Proposed Subagent Roster

### {subagent-1-name}
- **Role:** {one-line description}
- **Model:** {claude-opus-4.6 / claude-sonnet-4 / other} — {why this model}
- **Reads:** {upstream artifacts, MCP tools, repo files}
- **Writes:** `{subagent-1-name}/output.md` — {description}
- **Result codes:** `{code1}` ({meaning}), `{code2}` ({meaning})

### {subagent-2-name}
- **Role:** {one-line description}
- **Model:** {model} — {why}
- **Reads:** {inputs}
- **Writes:** `{subagent-2-name}/output.md` — {description}
- **Result codes:** `{code1}` ({meaning}), `{code2}` ({meaning})

{Repeat for each subagent.}

## Orchestrator Duties

The orchestrator handles these itself (no subagent delegation):

- {e.g., Create/switch git branch}
- {e.g., Commit and push after implementation}
- {e.g., Create PR via ADO API}
- {e.g., Transition JIRA issue status}
- {e.g., Write the exit block}
- {e.g., Track iteration counts and enforce max retries}

## Reuse Opportunities

{Identify patterns or subagents from existing agent families that can be reused.}

| Pattern | Source | Applicability |
|---|---|---|
| {e.g., Scribe handoff pattern} | {ralph-docs family} | {Handoff composition is identical} |
| {e.g., Multi-reviewer gate} | {ralph-docs family} | {Review gate with 3 reviewers + revision loop} |

## Unresolved Questions

{Anything from the classification that needs user input.}

1. {e.g., Should build validation be its own subagent or embedded in the writer?}
2. {e.g., Is one reviewer enough or do we need a panel?}
