# Common Findings

Pattern library for classifying issues. Use these to quickly categorize and severity-rate what you find.

## Critical

### Lost Re-Entry Context

Gap-hunter produces detailed gap analysis (descriptions, evidence, recommendations), but the coordinator re-invoked during re-entry doesn't read it. Specialists re-run blind, potentially producing the same output that caused the gaps.

**Signature:** Gap-hunter writes `gap-analysis.json` with per-gap data. Orchestrator cascade-resets passes. Target coordinator's reachable code path (not a dead branch) doesn't read `gap-analysis.json`. Specialists have no gap awareness.

**Impact:** Re-entry cycles burn tokens reproducing the same deficiencies. The pipeline may never converge.

### Dead Code Misleading Agent Behavior

Agent has a conditional branch (re-entry handling, mode detection) that is unreachable given how the orchestrator manages state, but the branch contains instructions the agent might attempt to follow if it misidentifies its mode.

**Signature:** Agent has `if both passes are done → re-entry mode` but orchestrator always resets the target pass before re-dispatching, so the agent always enters the normal branch instead.

**Impact:** If the dead branch is the only place that performs a critical action (like reading gap context), that action never happens. If the branch conflicts with reachable instructions, it creates ambiguity.

### Artifact Producer Missing

An agent reads an artifact that no earlier agent in the pipeline produces. The file is expected but never created.

**Signature:** Agent B's instructions say "Read `.docwriter/foo.json`" but no agent's output section includes writing this file.

**Impact:** Agent B fails or halts on a missing file, breaking the pipeline.

## High

### Status Schema Mismatch

A consumer reads a field from a status file that the producer's schema doesn't include, or reads a `result` value that the producer never emits.

**Signature:** Orchestrator routes on `result: "reentry-complete"` but the coordinator's status schema only emits `"pass2-complete"` or `"pass3-complete"`.

**Impact:** Routing breaks — the orchestrator hits an unhandled case.

### Re-Entry Task Status Not Reset

During re-entry to an execution pass, previously completed tasks retain their `"written"` status and are skipped. The coordinator doesn't reset affected tasks to `"planned"`, so re-entry has no effect.

**Signature:** Gap-hunter identifies tasks T-008 and T-012 as having issues. Execution-coordinator's reachable code path processes tasks by status. T-008 and T-012 are `"written"` and get skipped.

**Impact:** Re-entry does nothing — the same issues persist through verification cycles until the maximum cycle limit forces delivery with unresolved gaps.

### Directive Propagation Model Contradiction

Architecture doc describes one propagation model (e.g., "coordinators read directives.md directly") but agent instructions implement a different one (e.g., "orchestrator relays directives to coordinators").

**Signature:** Architecture doc says X. Orchestrator constraints say Y. Both can't be true for the same directive type.

**Impact:** Agents may follow either model inconsistently, leading to some directives being applied and others silently dropped.

## Medium

### Incomplete Directive Relay

Coordinators read directives and apply them locally, but don't relay relevant directive content to specialists in dispatch messages. Specialists that could benefit from directive guidance never receive it.

**Signature:** Coordinator reads `## Pass 4` directives and adjusts its own behavior, but the content-writer it dispatches doesn't get the directive text.

**Impact:** Functionally degraded but not broken — the coordinator's behavioral adjustments partially compensate, but specialists can't use directive guidance for their specific decisions.

### Progress Field Not Updated

A progress field (`currentPass`, `counts.*`, `directives.*`) is expected by the orchestrator's routing table or completion logic but not updated by the coordinator that owns that pass.

**Signature:** Orchestrator checks `currentPass === 6.5` for routing but the synthesis-coordinator (Pass 6.5, direct dispatch) never updates `currentPass`.

**Impact:** The orchestrator may re-dispatch or mis-route based on stale progress data.

### Inconsistent Error Propagation

Different coordinators handle specialist failures differently — some retry, some propagate immediately, some log and continue. The orchestrator's expectations may not match.

**Signature:** Coordinator A retries failed specialists. Coordinator B fails fast. Orchestrator expects uniform behavior.

**Impact:** Unpredictable failure behavior across passes.

### Stale Artifact Reference

Agent references a file or field name from an earlier version of the pipeline that has since been renamed or restructured.

**Signature:** Agent reads `research-brief.json` from a step that was made optional or renamed, but the agent doesn't handle the missing-file case.

**Impact:** Non-fatal if the agent has a fallback, but creates confusion and potential errors if the pipeline changes further.

## Low

### Cosmetic Schema Inconsistency

A status file includes fields that no consumer reads, or uses field names that don't match the convention used by other agents.

**Signature:** Agent writes `"passExecuted": "pass2"` but no downstream agent reads `passExecuted`.

**Impact:** No functional impact, but increases maintenance burden.

### Architecture Doc Incomplete

Architecture documentation is missing entries in its artifact dependency graph, or describes a simplified version of the actual data flow.

**Signature:** Architecture doc shows 5 artifact edges but the actual agent files have 12.) 

**Impact:** New contributors or auditors may miss important data flows.

### Unreachable Skip/Optimization Logic

Agent has instructions for skipping a step under conditions that can't occur in the current pipeline configuration.

**Signature:** Verification-coordinator has "skip Pass 5" guidance, but the orchestrator never invokes verification-coordinator with Pass 5 already done.

**Impact:** Dead code adds cognitive load but doesn't affect execution.

### Timestamp Hallucination Risk

Agent is told to write timestamps but has no instruction to generate them via a deterministic method (terminal command). Risk of hallucinated dates.

**Signature:** Status schema includes `"timestamp": "<ISO>"` placeholder. No `date -u` or equivalent instruction.

**Impact:** Audit trail has unreliable timestamps. May cause freshness-check issues if timestamps are compared.

---

## Patterns Discovered in Practice

The following patterns were identified during real evaluations and extend the findings above.

### Phantom Status Value (High)

A consumer (routing table, coordinator, or specialist) references a status enum value that no producer ever emits. E.g., `"verified"` checked in dependsOn logic but no agent ever sets tasks to `"verified"`.

**Signature:** Grep for the status value across all agents. It appears only in read/check positions, never in write/set positions.

**Impact:** Unreachable code paths. In dependsOn logic, it's dead; in routing tables, it can cause unhandled cases.

### Bootstrap Schema Gap (High)

A downstream agent's instructions reference data that should exist in the pipeline's bootstrap/context file, but the bootstrap template doesn't include it. E.g., retrospective writing needs an `issueKey` but `context.json` has no identifier field.

**Signature:** Agent's instructions reference a value. Trace backward through all declared inputs. No artifact in the chain contains the value.

**Impact:** Agent must fabricate or omit the value. If it fabricates, audit trails are corrupted. If it omits, downstream consumers break.

### Invariant Supremacy Temporal Violation (Medium)

An agent's invariant-supremacy section references an artifact that doesn't exist yet in its pass. E.g., Pass 1 coordinator references `invariant-inventory.json` which is produced in Pass 2. The check is vacuous but misleading.

**Signature:** Agent reads artifact for invariant supremacy. Artifact is produced by a later pass. No "if it exists" guard.

**Impact:** No functional breakage on first run (artifact simply doesn't exist). Misleading on re-entry runs where the artifact may exist from the first pass.

### Hardcoded Dynamic Path (Medium)

An agent hardcodes a file path that another agent provides dynamically via its status file. E.g., a downstream agent hardcodes `changelog-entry.md` instead of reading `changelogPath` from changelog-writer status.

**Signature:** Agent A outputs a path in its status (`changelogPath: "..."`). Agent B hardcodes the same path instead of reading Agent A's status.

**Impact:** Works until the path changes. When the upstream agent writes to a different location, the downstream agent reads stale or missing data.

### Schema-Instruction Desync (Medium)

An agent's process instructions reference an output field that doesn't appear in its output schema example. E.g., instructions say "write a `noDocImpactSummary` field" but the JSON schema example omits it.

**Signature:** Grep instructions for the field name. It appears in process text but not in the output schema block.

**Impact:** The agent may or may not include the field depending on how literally it follows schema examples vs. process instructions. Consumers that expect the field will find it missing.

### Unreadable Pipeline Summary Field (Medium)

The orchestrator's pipeline-summary writes aggregate stats derived from artifacts it doesn't declare as inputs in its "read all results" list. The values would need to be hallucinated.

**Signature:** Pipeline summary schema includes a field (e.g., `research.recommendationsBlocked`). Trace backward: the "read all results" list doesn't include the artifact that contains this data.

**Impact:** Summary contains fabricated data or zeros, corrupting reporting. Often masked because pipeline summaries are rarely cross-checked.

### Missing Coordinator Error Handling (Medium)

A coordinator has no instructions for what to do when a dispatched specialist fails. Other coordinators in the same pipeline all have Error Handling sections, but one was missed.

**Signature:** Read each coordinator's sections. One is missing "Error Handling" while all siblings have it.

**Impact:** On specialist failure, the coordinator has no guidance. It may hang, retry indefinitely, or propagate a malformed status.
