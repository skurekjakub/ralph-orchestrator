# Improvement Summary: ralph-reviewer-ia (DOC-3189)

## Changes Made

### 1. Version review-findings.json across iterations
- **File:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-ia.agent.md` (line 212)
- **Finding:** Analysis §Artifact Quality / review-findings.json — "v1's review-findings.json was silently overwritten when v2 wrote its own review-findings.json"; §Dispatch Prompt Gaps item 1 — "review-findings.json versioning is not specified in the prompt"
- **Root cause:** Rule gap — the prompt specified an unversioned filename (`review-findings.json`) while `output-v{N}.md` was correctly versioned. The style reviewer's prompt already had the correct pattern; the IA reviewer's prompt was never updated to match.
- **Change:** Changed `review-findings.json` → `review-findings-v{N}.json` with explicit instruction: "(always include the version suffix, even for iteration 1 — use `review-findings-v1.json`, not `review-findings.json`)". This matches the style reviewer's existing pattern exactly.

### 2. Add explicit artifacts accumulation example
- **File:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-ia.agent.md` (line 244)
- **Finding:** Analysis §Artifact Quality / status.json — "The `artifacts` field references `review-findings.json` (unversioned)"; §Dispatch Prompt Gaps item 2 — "status.json artifacts field should list all iteration outputs"
- **Root cause:** Rule gap — the artifacts rule used a vague glob pattern (`review-findings*.json`) instead of the explicit versioned pattern with example. The style reviewer's prompt includes a concrete multi-iteration example; the IA reviewer's did not.
- **Change:** Replaced glob pattern with explicit `review-findings-v{N}.json` naming and added a concrete example: `["ralph-reviewer-ia/output-v1.md", "ralph-reviewer-ia/review-findings-v1.json", "ralph-reviewer-ia/output-v2.md", "ralph-reviewer-ia/review-findings-v2.json"]`.

### 3. Fix verdict agent's hardcoded findings file references
- **File:** `profiles/ralph-docs/agents/ralph.malph-verdict.agent.md` (lines 42–49)
- **Finding:** Analysis §Dispatch Prompt Gaps item 1 — the versioning fix in the IA reviewer prompt would break the verdict agent, which hardcoded `review-findings.json` for all three reviewers. Additionally, this was *already broken* for the style reviewer, which has been writing versioned files since its prompt was updated.
- **Root cause:** Rule gap — the verdict agent's Input section listed hardcoded unversioned filenames instead of discovering filenames from each reviewer's `status.json` artifacts field.
- **Change:** Replaced the three hardcoded `review-findings.json` paths with instructions to: (1) read each reviewer's `status.json`, (2) use the `artifacts` field to discover the correct findings filename, (3) read the highest-versioned findings file. This is forward-compatible with any versioning scheme.

## Proposed (Not Implemented)

### Infrastructure Issues

_None identified._

### New Skills / MCP Servers

_None needed._ The IA reviewer's tool and skill usage was rated "good" across both invocations. It correctly used `xperience-documentation` and `ralph-documentation-syntax` skills, and its local-filesystem workflow doesn't require MCP tools.

### Alternative Flow Proposals

_None needed._ The parallel reviewer dispatch pattern (IA + style + technical running concurrently) works well. Both invocations completed cleanly with appropriate scoping.

### SOTA Suggestions

_None applicable._ The identified issue was a straightforward prompt consistency bug (unversioned filename), not a systemic design problem.

## Related: Technical Reviewer Has Same Bug

The `ralph-reviewer-technical` agent template (`profiles/ralph-docs/agents/ralph.ralph-reviewer-technical.agent.md` line 233) has the same unversioned `review-findings.json` pattern. The analysis noted the technical reviewer "also used `review-findings-v2.json`" — meaning it independently discovered the need to version (like the style reviewer did), but its prompt still says `review-findings.json`. This should be fixed in the technical reviewer's improvement pass by applying the same change made here.

## No Action Needed

- **Tool selection** — rated "good"; correctly read-only, no MCP tool usage (appropriate for local-filesystem IA review)
- **Efficiency** — rated "good"; proportionate scope for both TASK-01 (full page) and TASK-02 (small change)
- **Output quality** — rated "excellent"; thorough neighborhood audits, evidence-based findings, correct severity coding
- **Severity accuracy** — rated "good"; all SUG-XXX findings correctly classified as non-blocking
- **Verdict consistency** — rated "good"; APPROVED verdicts follow mechanically from zero blocking findings
- **Template resolution** — rated "good"; correct agent identity, file paths, and artifact references
- **MCP SSE disconnections (v2)** — infrastructure-level errors with zero functional impact on the IA reviewer; no prompt change needed
- **Skill usage** — rated "good"; both recommended skills loaded as instructed
