---
name: agent-as-function-audit
description: "Audit an agent family that claims to follow the agent-as-function or pure-router pattern. Use this skill whenever the user wants to review an orchestrator plus its subagents for artifact-contract drift, routing-table gaps, revision/standard workflow mismatches, prompt contradictions, stale side effects, parser/result-block incompatibilities, or mounted-skill inconsistencies. Use it for phrases like 'audit this workflow', 'review the orchestrator prompts', 'check agent-as-function compliance', 'find conflicting instructions', 'why is this router not pure', or any request to assess whether a multi-agent setup really follows filesystem-artifact handoff correctly."
---

# Agent-as-Function Audit

Use this skill to audit a multi-agent workflow at the **prompt and configuration level**, not just a single execution transcript.

This skill is for questions like:

- does this orchestrator actually behave like a pure router
- do the prompts, workflow skills, and profile wiring agree with each other
- are the artifact contracts stable across standard and revision flows
- are subagents reading and writing the files the architecture says they should
- are there stale skills, leaked responsibilities, cross-family references, or only-transitively-reachable helper skills left over from older workflows

This skill complements, but does not replace:

- `agent-as-function` for designing or refactoring the architecture
- `agent-subagent-wiring` for adding a new subagent cleanly
- `agent-eval` for grading a completed execution transcript or task run

## Read These References

| File | Purpose |
|---|---|
| `references/scope-map.md` | Which files to inventory before making claims |
| `references/checklist.md` | The actual audit checklist grouped by architecture concern |
| `references/common-findings.md` | Typical failure modes and how to classify them |
| `references/report-format.md` | How to write the audit so findings are actionable |

## Default Process

1. Inventory the workflow files before judging anything.
2. Build a quick ownership map: orchestrator responsibilities, subagent responsibilities, artifact readers, artifact writers.
3. Audit the standard path and the revision path separately.
4. Check mounted skills against prompt references, including transitive references from mounted skills to secondary helper skills.
5. Check exit-block/result parsing compatibility whenever a workflow prints structured output.
6. Report findings ordered by severity with exact file references.
7. Do not propose edits unless the user asks for fixes.

## Core Audit Question

The question behind every finding is:

**Does the implemented workflow still match the architecture it claims to use?**

For agent-as-function systems, that usually means:

- orchestrators route, they do not perform substantive downstream work
- subagents exchange data through files, not relayed prompt summaries
- routing decisions come from `status.json`, not by parsing full artifacts
- artifact naming and iteration rules are stable
- standard and revision flows follow the same ownership model unless a deliberate exception is documented

## Rules

- Findings first. Summaries are secondary.
- Cite exact files and lines for each issue.
- Distinguish architectural contradictions from mere prompt polish.
- Treat standard and revision workflows as separate surfaces that both need auditing.
- Audit profile skill mounts, not just prompt text.
- When checking whether a mounted skill is stale, trace both direct prompt references and transitive references from other mounted skills before calling it unanchored.
- When the workflow emits a structured result block, audit the parser and tests too.
- Call out stale cross-family references explicitly when one workflow leaks another's artifacts or helpers.
- If the user asked for an audit only, stop at findings and open questions.

## Expected Outcome

After using this skill, you should have:

- a clear inventory of the relevant files
- a severity-ordered findings list
- explicit ownership and data-flow inconsistencies
- a short list of residual risks or open questions
