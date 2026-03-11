# Improvement Summary: ralph-reviewer-technical (DOC-3189)

## Changes Made

### 1. Added `next_hint` guidance to reviewer template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-technical.agent.md`
- **Finding:** Improvement Suggestions §3 — `next_hint` set to `"ralph-reviewer-style"` (a peer reviewer) instead of `null`
- **Root cause:** Rule gap — the reviewer template had no guidance on what `next_hint` value to use. The artifact contract defines the field but doesn't specify reviewer-appropriate values.
- **Change:** Added rule: `**next_hint must be null** — you run in parallel with other reviewers. The orchestrator handles post-review routing; do not suggest a peer reviewer or downstream agent.`

### 2. Added `task_id` reinforcement to reviewer template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-technical.agent.md`
- **Finding:** Artifact Quality §status.json — `task_id` showed `TASK-02` instead of `DOC-3189`
- **Root cause:** Agent behavior gap — the artifact contract (line 44) already states `task_id` must be the work item ID, but the reviewer used a subtask ID. The rule exists but was not salient enough.
- **Change:** Added explicit rule in the Rules section: `**task_id is the work item ID** — always use {{ taskId }} (e.g., DOC-3189), never a subtask identifier like TASK-01. The artifact contract requires this.`

### 3. Added `artifacts` completeness reinforcement to reviewer template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-technical.agent.md`
- **Finding:** Artifact Quality §status.json — `artifacts` array only referenced v2 files, losing v1 artifact references
- **Root cause:** Agent behavior gap — the artifact contract (line 46) already states artifacts must list ALL output files across iterations. The reviewer only listed the latest.
- **Change:** Added explicit rule: `**artifacts must list ALL output files** — when dispatched multiple times, include every output-v{N}.md and review-findings*.json you have written across all iterations, not just the latest.`

### 4. Added changed file list guidance to reviewer dispatch workflow
- **File:** `shared/skills/workflow/docs/ralph-workflow/references/4-review.md`
- **Finding:** Gap Identification §Dispatch Prompt Gaps — reviewer must discover changed files by reading upstream artifacts, wasting 1–2 tool call turns
- **Root cause:** Rule gap — the workflow skill didn't instruct the orchestrator to include changed files in the dispatch prompt
- **Change:** Added paragraph after the invocation instruction with explicit guidance to include `git diff --name-only` or writer artifact file list in each reviewer's dispatch prompt, with an example showing the format.

### 5. Applied same `next_hint`/`task_id`/`artifacts` rules to peer reviewers (cross-cutting)
- **Files:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-style.agent.md`, `profiles/ralph-docs/agents/ralph.ralph-reviewer-ia.agent.md`
- **Finding:** Same gaps in §3, §status.json apply identically to all three parallel reviewers — they share the same artifact contract and workflow dispatch pattern
- **Root cause:** Rule gap (same as findings 1–3, applied consistently across the reviewer panel)
- **Change:** Added the same three rules (`next_hint`, `task_id`, `artifacts`) to the Rules section of both peer reviewer templates for consistency.

## Proposed (Not Implemented)

### Infrastructure Issues

**Parallel metrics attribution** (Finding: §Token & Context, Improvement Suggestions §2)
The mapper extraction cannot distinguish this reviewer's tool calls from parallel peers due to log interleaving. All tool-call metrics are aggregate across 3 reviewers in the same parallel group. If per-agent precision is needed for future analysis, the debug log format would need agent identifiers in tool call entries, or the mapper would need message ID correlation. This is a logging/mapper infrastructure change — outside the scope of agent template improvements.

### New Skills / MCP Servers

No new skills or MCP servers needed. The reviewer's existing skill set (xperience source-map, ralph-source-references) was effective, and no tool gaps were identified.

### Alternative Flow Proposals

None warranted. The three-reviewer parallel gate pattern worked well — all reviewers completed within reasonable time, produced thorough artifacts, and the aggregation logic is sound.

### SOTA Suggestions

None identified. The reviewer's adversarial verification approach (tracing claims through 3+ method call chains, citing specific source lines) represents strong practice for documentation accuracy verification.

## No Action Needed

- **Tool Selection** (rated good) — Appropriate tools used, no role boundary violations. No changes needed.
- **Efficiency** (rated good) — Completion times (5.5 min / 3.4 min) and context utilization (46.8% / 36.5% max) are healthy. No optimization needed.
- **Error Recovery** (rated good) — All 6 MCP errors were SSE stream disconnections at session end (infrastructure cleanup). No functional impact.
- **Output Quality** (rated excellent) — 13+10 claims verified with source citations. Depth of verification (tracing OR-logic through 3 methods, understanding preview bypass) is exemplary.
- **Severity Accuracy** (rated excellent) — N/A, no findings to classify.
- **Verdict Consistency** (rated good) — Verdicts follow mechanically from verification evidence.
- **Template Resolution** (rated good) — Identity, file paths, and source browser URLs all correct.
- **Skill Gaps** — None identified. xperience and ralph-source-references skills used effectively.
- **Tool/MCP Gaps** — None identified. All needed tools available and appropriately used.
