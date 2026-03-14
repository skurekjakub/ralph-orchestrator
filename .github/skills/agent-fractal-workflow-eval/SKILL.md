---
name: agent-fractal-workflow-eval
description: "Evaluate a multi-agent fractal workflow for instruction correctness, data flow integrity, and re-entry safety. Use this skill whenever you need to audit a pipeline of agents organized into sequential passes with coordinators and specialists — checking for dead code paths, lost context during re-entry, contradictory instructions between agents, unreferenced artifacts, status schema drift, and directive propagation gaps. Also use when the user says 'audit this workflow', 'check for dead code in the agents', 'is the re-entry logic correct', 'do the agents actually read what they need', 'find inconsistencies in my agent pipeline', or 'evaluate my multi-pass agent system'. This skill covers workflow-level evaluation — for agent-as-function architecture compliance (routing purity, artifact contracts, skill mounts), use agent-as-function-audit instead."
---

# Agent Fractal Workflow Eval

Evaluate a multi-agent fractal workflow for correctness at the **instruction level** — not a single execution trace, but the full set of agent prompts, their declared inputs/outputs, pass sequencing, re-entry logic, and directive propagation paths.

## When to Use

This skill applies to agent systems that have:

- **Sequential passes** (e.g., discovery → analysis → planning → execution → verification → gap-hunting → delivery)
- **Fractal hierarchy** (orchestrator → coordinators → specialists)
- **Re-entry cycles** (gap-hunting or verification finds issues → pipeline re-enters earlier passes)
- **Shared artifact state** (agents communicate via filesystem artifacts like JSON status files, progress tracking, etc.)
- **Directive injection** (mid-run user steering via a directives file that propagates through the hierarchy)

If the system is a flat orchestrator → subagent setup without passes or re-entry, use `agent-as-function-audit` instead. If it has both patterns, use both skills.

## Relationship to Other Skills

| Skill | Focus | Overlap |
|---|---|---|
| `agent-as-function-audit` | Architecture compliance: routing purity, artifact contracts, skill mounts, result-block parsing | Complementary — run both for full coverage |
| `agent-eval` | Grading a completed execution transcript | Different surface — this skill audits prompts, not traces |
| `agent-creator` | Building new agent families | Upstream — use this skill to validate what agent-creator produces |

## Read These References

| File | When to Read |
|---|---|
| `references/checklist.md` | Always — the core evaluation checklist |
| `references/common-findings.md` | Always — pattern library for classifying issues |
| `references/data-flow-analysis.md` | When auditing re-entry, artifact consumption, or pass handoffs |

## Process

### Phase 1: Inventory

Before evaluating anything, build a complete map of the workflow.

1. **List all agents** — orchestrator, coordinators, specialists, direct-dispatch agents. For each, note:
   - Role (orchestrator / coordinator / specialist)
   - Which passes it participates in
   - Its declared inputs (files it reads)
   - Its declared outputs (files it writes)
   - Its frontmatter `agents` array (who it dispatches)

2. **Map the pass sequence** — what passes exist, what order they execute, which coordinator owns each pass.

3. **Map re-entry paths** — how does gap-hunting / verification trigger re-entry? What gets reset? What gets re-dispatched?

4. **Map directive propagation** — who reads the directives file? Who relays directive content? Who receives it only via dispatch messages?

5. **Map status schemas** — what fields does each agent write to its status file? What fields do consumers read?

Write this inventory before proceeding. It prevents false positives from incomplete context.

### Phase 2: Evaluate

Run the checklist from `references/checklist.md` systematically. For each check:

- Read the relevant agent files
- Trace the data flow end-to-end
- Record findings with exact file citations
- Classify severity using `references/common-findings.md`

Work through the checklist categories in order. Each category is designed to catch a specific class of defect, and later categories build on earlier ones.

### Phase 3: Report

Present findings ordered by severity (Critical → High → Medium → Low), then by category. Each finding must include:

- **Severity** and **category**
- **What** is wrong — the specific inconsistency or gap
- **Where** — exact file(s) and section(s)
- **Why it matters** — what breaks or degrades during execution
- **Suggested fix direction** (brief — not a full implementation)

After findings, list any **open questions** where the architecture is genuinely ambiguous rather than clearly wrong.

Do not propose code-level fixes unless the user asks for remediation. The default output is findings only.

### Phase 4: Fix (optional, user-requested)

When the user asks to fix findings:

1. Fix in severity order (Critical first)
2. For each fix, verify it doesn't introduce new inconsistencies with other agents
3. After fixing, do a targeted re-check of the affected area — don't re-run the full audit
4. Mark each finding as resolved

## Principles

- **Trace data, not just instructions.** The most dangerous bugs are where Agent A writes artifact X but Agent B (which needs X) never reads it. Always verify the full read/write chain.
- **Simulate re-entry.** Mentally walk through what happens when the orchestrator cascade-resets passes. Which agents get re-invoked? What state do they see? Do they know *why* they're re-running?
- **Check reachability.** If an agent has conditional branches (mode detection, re-entry handling), verify each branch is actually reachable given how the orchestrator manages state. Dead branches mislead the agent.
- **Verify propagation completeness.** If information enters the system at one level (orchestrator reads directives, gap-hunter writes gaps), trace whether it reaches every agent that needs it. Relay chains are fragile — every hop is a potential drop point.
- **Distinguish harmful from cosmetic.** A stale comment is LOW. A lost re-entry context that causes specialists to re-run blind is CRITICAL. Prioritize findings that affect execution correctness over prompt tidiness.
- **Trace backward from outputs.** When validating pipeline summaries or retrospectives, start from the output schema fields and trace backward: which input provides this data? Is that input in the agent's declared input list? Is it in the "read all results" list? This catches unreadable pipeline summary fields.
- **Audit bootstrap schemas.** The bootstrap/context file is the ultimate data source. If any agent needs an identifier (task ID, issue key) that doesn't exist in the bootstrap, no amount of data flow is complete. Check category 10 explicitly.
- **Watch for cascade reset + Re-Entry Handling contradictions.** Coordinators often have a Re-Entry Handling section written for an older state management design. If the orchestrator now cascade-resets all downstream passes, these sections are dead and contradictory. See `data-flow-analysis.md` § Cascade Reset Verification.
