---
name: agent-subagent-wiring
description: "Create and wire new subagents into an existing Ralph Orchestrator agent family, including the new subagent prompt, orchestrator agent registration, routing table updates, result-code handling, ordering constraints, reviewer loops, and downstream prompt references. Use this skill whenever someone wants to add a subagent, split work out of an orchestrator, introduce a new reviewer/scout/scribe/coder/analyst role, or asks what prompt files and routing sections must change when a new agent is introduced."
---

# Agent Subagent Wiring

Use this skill when the task is not just "write a new `.agent.md` file", but "make the new subagent actually work inside the existing orchestration setup."

This skill is about coordinated edits across the orchestrator and the affected subagents. A new subagent is not complete until the owning orchestrator can dispatch it, route on its result codes, and the relevant sibling agents know when to read or ignore its artifacts.

This skill complements other agent-architecture skills:

- `agent-as-function` explains the architectural pattern and ownership model.
- `agent-workflow-phase-editor` covers workflow-table and phase-skill renumbering when the change alters the phase sequence.

Read the bundled references before editing files.

## Read These References

| File | Purpose |
|---|---|
| `references/decision-guide.md` | Decide whether the new responsibility should become a subagent at all, and what kind of subagent it should be |
| `references/wiring-checklist.md` | File-by-file checklist for every prompt update required to wire a new subagent into an existing orchestrator |
| `references/role-patterns.md` | Wiring differences for researchers, writers/coders, reviewers, scouts, validators, and scribes |
| `references/templates.md` | Reusable prompt snippets for frontmatter, subagent tables, routing rows, result codes, and artifact sections |
| `references/validation.md` | Final verification steps so the new subagent is reachable, routable, and non-conflicting |

## Default Process

1. Decide whether the new work belongs in a dedicated subagent or should stay inside an existing agent.
2. Classify the new subagent role: phase owner, helper, reviewer, scout, validator, or scribe-like formatter.
3. Create the new `.agent.md` prompt with a narrow mission, clear input artifacts, output artifacts, and fixed result codes.
4. Update the orchestrator prompt so it knows:
   - the new agent exists
   - when to dispatch it
   - how to route on each result
   - whether ordering constraints or retry loops changed
5. Update any sibling subagents that need to consume the new subagent's artifacts or defer responsibility to it.
6. If the workflow phases changed, use `agent-workflow-phase-editor` as well.
7. Validate names, routes, loops, and artifact contracts.

## What This Skill Covers

Use this skill for changes such as:

- adding a new reviewer to an existing review gate
- splitting research into scout plus analyst
- extracting handoff composition into a scribe
- adding a validator/helper subagent used by a writer or coder
- introducing a new domain specialist subagent that owns one phase in the pipeline
- converting hybrid orchestrator logic into a proper routed subagent

## What This Skill Does Not Replace

- It does not decide the high-level multi-agent architecture from scratch. Use `agent-as-function` first when the architecture itself is still unclear.
- It does not handle phase renumbering or workflow-table surgery in detail. Use `agent-workflow-phase-editor` when the phase sequence changes.
- It does not generate domain knowledge skills for the new subagent. If the new role needs domain knowledge, create or update the relevant skill separately.

## Rules

- Keep the orchestrator as a pure router. Do not let the orchestrator absorb the new subagent's substantive work.
- Give the new subagent a small, explicit job with stable result codes.
- Route on `status.json`, not on `output.md` parsing.
- Update all ownership declarations, not just the first routing table you find.
- If the new subagent changes who reads which artifacts, update those downstream prompts explicitly.
- If the change touches both standard and revision variants, audit both.

## Expected Outcome

After using this skill, the new subagent should be fully integrated:

- declared in the orchestrator frontmatter
- described in the orchestrator subagent roster
- reachable from the routing rules
- covered by ordering or retry logic where needed
- referenced by sibling prompts that depend on it
- validated so there are no dangling names, unreachable result codes, or silent ownership overlaps