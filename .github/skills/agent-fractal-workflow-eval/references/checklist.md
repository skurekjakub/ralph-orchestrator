# Evaluation Checklist

Run these checks in order. Each category targets a specific class of defect.

## 1. Pass Sequencing & Reachability

For each pass in the pipeline:

- Is the pass reachable from the orchestrator's routing table?
- Are the entry conditions correct? (e.g., "pass N is not-started" triggers pass N execution)
- Does the orchestrator update `passStatus` correctly after each pass completes?
- Are there conditional branches in any agent that can never be reached given the orchestrator's state management?

**What to look for:** Dead branches in mode detection. The classic pattern: an agent has a "re-entry" branch guarded by "both passes done", but the orchestrator cascade-resets passes before re-dispatching, so the guard condition is never true.

**How to check:** For each conditional branch in each agent, trace backward: what orchestrator action leads to the state that triggers this branch? If no orchestrator action produces that state, the branch is dead code.

## 2. Re-Entry Data Flow

When verification/gap-hunting triggers re-entry:

- Does the gap-hunter write specific, actionable gap information (descriptions, evidence, recommendations)?
- After the orchestrator cascade-resets passes, does the re-dispatched coordinator read the gap analysis?
- Does the coordinator relay gap context to the specialists it dispatches?
- Do the specialists have instructions to use gap context when available?

**What to look for:** Lost context. The orchestrator resets passes, re-dispatches coordinators, which re-dispatch specialists — but nobody tells the specialists what gaps to fix. They re-run their normal flow blind, potentially producing identical output.

**How to check:** Trace the gap data from gap-hunter → verification-coordinator → orchestrator (re-entry decision) → target coordinator → specialists. At each hop, verify the data is consumed, not just available.

## 3. Artifact Producer-Consumer Alignment

For every artifact (JSON file, status file, analysis output):

- Is there exactly one producer (writer)?
- Are all declared consumers (readers) reading the correct filename and field names?
- Does every consumer handle the case where the artifact doesn't exist yet?
- If the artifact schema has been updated, have all consumers been updated to match?

**What to look for:** Phantom reads (agent claims to read a file that no other agent produces), stale references (agent reads a field name that was renamed), and missing guards (agent assumes a file exists but it may not in all execution paths).

**How to check:** Build a matrix: rows = artifacts, columns = agents. Mark each cell as "writes", "reads", or empty. Verify every "reads" cell has a corresponding "writes" cell from an earlier pass. Verify field names match between writer's output schema and reader's input expectations.

## 4. Status Schema Consistency

For each agent's status file:

- Does the status schema in the agent's completion section match what consumers expect?
- Are all status fields actually populated by the agent's instructions?
- Do downstream agents reference fields that exist in the schema?
- Are enum values (like `result` codes) consistent between producer and consumer?

**What to look for:** Schema drift where a status file gains/loses fields across audit cycles but consumers still reference the old shape. Also look for `result` values referenced in routing tables that no agent ever emits.

**How to check:** Read each agent's "Completion" section for its output schema. Then grep all other agents for references to that status file, and verify each referenced field exists in the schema.

## 5. Directive Propagation

For the directive injection system:

- Who reads the directives file directly?
- Who receives directives via relay in dispatch messages?
- Is there a mismatch between the architecture doc's propagation model and what agents actually do?
- Do all agents that should receive directives actually receive them?
- Is the invariant supremacy rule consistently applied (invariants > directives > defaults)?

**What to look for:** Contradictions between "the orchestrator relays directives" and "coordinators read directives directly" — pick one model and enforce it consistently. Also check that specialists receive directive content from their coordinator, since specialists typically shouldn't read the raw directives file.

**How to check:** Search for `directives.md` references across all agent files. Map who reads it directly vs. who receives content via dispatch. Verify this matches the architecture doc.

## 6. Progress Tracking Consistency

For the progress state file:

- Is `currentPass` updated at each pass completion?
- Are pass statuses set to the correct values at the right times?
- Are count fields (tasks planned, written, blocked, etc.) populated by the agent that has the information?
- Is the gap-hunting cycle count tracked and enforced?
- Are re-entry targets set and cleared in the right places?

**What to look for:** Gaps where `currentPass` is updated for some passes but not others (e.g., direct-dispatch passes like Pass 0 or Pass 6.5 being skipped). Also check that the maximum cycle limit is enforced.

**How to check:** Read each coordinator's "completion" section and verify it updates all the progress fields it should. Cross-reference with the orchestrator's routing table to verify the progress values it checks.

## 7. Timestamp & Tooling Consistency

For all agents:

- Do agents have instructions to generate real timestamps (not hallucinate them)?
- Is the timestamp format consistent across all status files?
- Do agents that need to run terminal commands have access to do so?

**What to look for:** Agents instructed to write `<ISO>` timestamps but with no instruction on how to generate a real one. Also look for timestamp format inconsistencies (some agents using milliseconds, others not).

**How to check:** Grep for `<ISO>`, `timestamp`, `date -u`, and similar patterns across all agent files.

## 8. Error Handling & Edge Cases

For each coordinator:

- What happens when a specialist fails?
- Is the failure reported correctly in status?
- Does the coordinator attempt recovery or just propagate the error?
- Are non-blocking failures (like research-scout timeout) handled separately from blocking failures?

**What to look for:** Agents with no error handling instructions, or error handling that contradicts the orchestrator's expectations (e.g., coordinator retries when orchestrator expects immediate failure propagation).

## 9. Architecture Documentation Alignment

Compare agent instructions against architecture documentation:

- Do the agents' actual behaviors match what the architecture doc describes?
- Are data flow diagrams accurate?
- Are artifact dependency graphs complete?

**What to look for:** Architectural descriptions that describe an ideal design but don't match what the agents are actually told to do. This is especially common in re-entry logic and directive propagation where the architecture may describe one model but agents implement another.

**How to check:** Read each section of the architecture doc and verify the claims against the actual agent files. Focus on data flow descriptions and propagation models.

## 10. Bootstrap & Context Completeness

For the pipeline's bootstrap/context file:

- Does it contain all fields that downstream agents need?
- Are placeholder values (`<FILL:...>`) exhaustive — covering every field an agent might reference?
- Do re-runs preserve data that should survive across cycles (meta-knowledge, curated sources)?
- Is there a task identifier field for agents that need to write retrospectives or cross-pipeline references?

**What to look for:** Agents referencing a value (like `issueKey`, `projectName`, etc.) that no artifact in their declared input chain contains. Also check that the bootstrap clean mode preserves the right artifacts.

**How to check:** Start from each agent's output schemas that include identifiers or external references. Trace backward: does the value exist in any declared input? Does it ultimately trace back to context.json or progress.json? If it traces to context.json, verify the bootstrap template includes it.
