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
| `references/routing-document.md` | Always — the routing document specification and maintenance rules |

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

**Categories 11–13** (specialist scope, pipeline schema, agent count accuracy) were added from audit experience. They catch structural debt that accumulates as pipelines evolve — agents get overloaded, schemas drift from routing tables, and documentation counts go stale. Don't skip them.

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

### Phase 5: Update Routing Document

**Mandatory after every audit that produces fixes.** See `references/routing-document.md` for the full specification.

The routing document (`ROUTING-ARCHITECTURE.md` in the agent family's root directory) is the canonical path-by-path reference for the pipeline. It enumerates every distinct execution path with trigger conditions, agent sequences, artifacts, progress mutations, and error handling.

After applying fixes:

1. **Read the existing routing document** (if it exists). If it doesn't exist, create one from scratch following the specification in `references/routing-document.md`.
2. **Update affected paths.** For each fix, identify which execution paths (P-01, P-02, etc.) are affected and update their descriptions to reflect the new behavior.
3. **Add new paths** if a fix introduces a previously undocumented execution branch.
4. **Remove dead paths** if a fix eliminates an execution branch.
5. **Update the reference sections** (artifact dependency graph, progress state machine, coordinator dispatch sequences) if they are affected by the fixes.
6. **Verify path count.** Every conditional branch in the orchestrator's routing table and every error/recovery path in coordinators must be represented as a distinct path entry. If you count N conditional branches across all agents but the document has fewer than N paths, paths are missing.

## Path-by-Path Debugging

**When evaluating a workflow, always trace each execution path individually rather than evaluating the whole pipeline holistically.** This is the primary audit methodology.

### Why Path-by-Path

Holistic audits miss issues that only manifest on specific execution paths. A coordinator's instructions may be correct for the happy path but broken for re-entry. An artifact dependency may be satisfied in the first run but missing during a skip-pass directive. Path-by-path tracing forces you to hold one specific scenario constant and verify every step in that scenario.

### How to Apply

1. **Start from the routing document.** Each path entry (P-01, P-02, etc.) is an independent scenario to trace.
2. **For each path**, walk through every agent dispatch in sequence:
   - What state does the agent see when invoked on THIS path?
   - Does the agent's mode detection / conditional logic route to the correct branch for THIS state?
   - Are all required artifacts available at this point in THIS path? (An artifact produced in Pass 2 exists on P-01 but NOT on P-11 if Pass 2 was skipped.)
   - Does the agent's output correctly advance the pipeline for THIS path's next step?
3. **Record findings per path.** Tag each finding with the path ID (e.g., "P-02: coordinator doesn't relay gap context"). This makes it clear which scenarios are affected.
4. **Cross-reference for overlapping issues.** After tracing all paths individually, check if the same root cause appears across multiple paths. Consolidate into a single finding with multiple path references.

### Path Priority for Auditing

Not all paths are equally important. Audit in this order:

| Priority | Paths | Rationale |
|----------|-------|-----------|
| 1 | P-01 (happy path) | Most common execution — must be flawless |
| 2 | P-02, P-08, P-10 (re-entry, rewrite loop, forced convergence) | Re-entry is the most error-prone area |
| 3 | P-03 (crash recovery) | Data integrity under failure |
| 4 | P-04, P-05, P-06, P-07, P-14 (non-blocking failures, degraded modes) | Graceful degradation |
| 5 | P-09, P-13, P-15 (blocked tasks, front-matter issues, cold start) | Edge cases |
| 6 | P-11, P-12 (directive-driven paths) | User-driven, less frequent |

### Minimum Path Coverage

An audit is NOT complete unless at minimum these paths have been traced:
- **P-01** (happy path) — validates the baseline
- **P-02** (gap-hunting re-entry) — validates the most fragile logic
- **P-03** (crash recovery) — validates state machine integrity

## Principles

- **Always debug path by path.** Never evaluate the pipeline as a single holistic system. Use the routing document to enumerate paths, then trace each one individually. This catches path-specific bugs that holistic audits miss.
- **Always maintain the routing document.** After any audit that produces fixes, update `ROUTING-ARCHITECTURE.md`. If it doesn't exist, create it. A stale routing document is worse than none — it actively misleads.
- **Trace data, not just instructions.** The most dangerous bugs are where Agent A writes artifact X but Agent B (which needs X) never reads it. Always verify the full read/write chain.
- **Simulate re-entry.** Mentally walk through what happens when the orchestrator cascade-resets passes. Which agents get re-invoked? What state do they see? Do they know *why* they're re-running?
- **Check reachability.** If an agent has conditional branches (mode detection, re-entry handling), verify each branch is actually reachable given how the orchestrator manages state. Dead branches mislead the agent.
- **Verify propagation completeness.** If information enters the system at one level (orchestrator reads directives, gap-hunter writes gaps), trace whether it reaches every agent that needs it. Relay chains are fragile — every hop is a potential drop point.
- **Distinguish harmful from cosmetic.** A stale comment is LOW. A lost re-entry context that causes specialists to re-run blind is CRITICAL. Prioritize findings that affect execution correctness over prompt tidiness.
- **Trace backward from outputs.** When validating pipeline summaries or retrospectives, start from the output schema fields and trace backward: which input provides this data? Is that input in the agent's declared input list? Is it in the "read all results" list? This catches unreadable pipeline summary fields.
- **Audit bootstrap schemas.** The bootstrap/context file is the ultimate data source. If any agent needs an identifier (task ID, issue key) that doesn't exist in the bootstrap, no amount of data flow is complete. Check category 10 explicitly.
- **Watch for cascade reset + Re-Entry Handling contradictions.** Coordinators often have a Re-Entry Handling section written for an older state management design. If the orchestrator now cascade-resets all downstream passes, these sections are dead and contradictory. See `data-flow-analysis.md` § Cascade Reset Verification.
