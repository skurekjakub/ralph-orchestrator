# Agent Improver: DOC-3187

## Findings Evaluated

### 1. Manifest.json timestamp hallucination — ✅ ACTED ON

**Finding:** Writer agent wrote `"2025-07-25T12:00:00Z"` in `manifest.json` instead of the actual execution timestamp (2026-03-08). The agent hallucinated a plausible-looking ISO 8601 date.

**Root cause:** The shared `agent-as-function-contract.md` template used the placeholder `"<ISO 8601>"` for the timestamp field. This is ambiguous — agents interpret it as "write something that looks like ISO 8601" rather than "capture the actual current time." There was no instruction to generate a real timestamp.

**Systemic?** Yes. Every subagent that writes `manifest.json` uses this shared contract template. Any agent could hallucinate a timestamp.

**Fix applied:** Updated `shared/agent-includes/agent-as-function-contract.md` to add an explicit instruction: run `date -u +%Y-%m-%dT%H:%M:%SZ` and use the output. Changed the JSON example placeholder from `"<ISO 8601>"` to `"<run date command above>"` to make it unambiguous that a shell command must be executed.

**File changed:** `shared/agent-includes/agent-as-function-contract.md`

---

### 2. Orchestrator doesn't append its own manifest.json entry — ⏭️ NO ACTION

**Finding:** The orchestrator completed without appending its own entry to `manifest.json`. Only the writer's entry exists.

**Assessment:** The `manifest.json` is described in `AGENT-AS-FUNCTION.md` as being for "debugging, recovery, and so downstream subagents can discover the full execution history." The orchestrator is the outermost agent — there are no downstream subagents that would consume this entry. The orchestrator's completion is already tracked by the `===RALPH_RESULT_START===` exit block, the operation ledger, and the JIRA comment/attachment. Adding a manifest entry would provide marginal audit value.

Additionally, the revision handoff skills (`ralph-workflow-revision-handoff`) are structured around JIRA attachment + comment + ralphchives — they don't reference the artifact contract at all, which is correct since the orchestrator is not a subagent in this context.

**Systemic?** Low. This is an edge case of the contract spec (does the outermost agent count as a "subagent"?), not a failure pattern.

---

### 3. Writer explore agent redundancy — ⏭️ NO ACTION

**Finding:** The writer dispatched an `explore` sub-agent to re-read files already inlined in its dispatch prompt, adding ~30s overhead.

**Assessment:** The run-analyzer itself flagged this as "low-priority. No action required unless this pattern repeats at scale." Sub-agents are stateless by design — the writer may have wanted to verify file state or read adjacent files. The overhead is negligible relative to the 5m43s writer execution time (~9%).

**Systemic?** No. This is a one-off efficiency miss, not a template or infrastructure gap.

## Summary

| # | Finding | Systemic? | Action |
|---|---------|-----------|--------|
| 1 | Timestamp hallucination in manifest.json | Yes | Fixed contract template |
| 2 | Orchestrator missing manifest entry | No | No action |
| 3 | Writer explore redundancy | No | No action |
