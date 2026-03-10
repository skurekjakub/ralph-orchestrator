# Improvement Summary: DOC-3188

## Changes Made

### 1. Ralphchives 5-tag limit in shared include
- **File:** `shared/agent-includes/ralphchives.md`
- **Finding:** Improvement Suggestion #1 — "Ralphchives tag limit awareness"
- **Root cause:** Rule gap — the include provides tag guidance (`["{{ taskId }}", "{{ taskProject }}", "<anything pertinent>"]`) but never mentions the NodeBB 5-tag limit. The orchestrator used 8 tags on the first attempt, got rejected, then recovered by retrying with 5.
- **Change:** Added `⚠️ **Maximum 5 tags** — NodeBB enforces a 5-tag limit per topic. Choose the most relevant tags if you have more candidates.` below the Tags line. This prevents the retry-on-failure pattern by making the constraint explicit upfront.

### 2. MCP tool description: post_task_report tag limit
- **File:** `shared/mcp-servers/ralphchives-write/src/tools/post-task-report.ts`
- **Finding:** Improvement Suggestion #1 — "Ralphchives tag limit awareness"
- **Root cause:** Rule gap — the tool's `tags` parameter description said only "Tags for categorization (e.g. JIRA key, topic area)" with no mention of the platform limit.
- **Change:** Updated the `.describe()` to include: "Maximum 5 tags — NodeBB rejects requests with more than 5." This provides a second line of defense — even if an agent doesn't read the shared include, the tool schema communicates the constraint.

### 3. MCP tool description: post_observation tag limit
- **File:** `shared/mcp-servers/ralphchives-write/src/tools/post-observation.ts`
- **Finding:** Improvement Suggestion #1 — "Ralphchives tag limit awareness" (extended to cover the other write tool)
- **Root cause:** Rule gap — same as #2, but additionally this tool auto-appends an `"observation"` tag in the handler (`[...tags, "observation"]`), meaning the effective user limit is 4, not 5.
- **Change:** Updated the `.describe()` to: "Maximum 4 tags — an 'observation' tag is added automatically, and NodeBB allows 5 total." This prevents a subtle off-by-one where an agent sends 5 tags and gets rejected because the handler adds a 6th.

### 4. Scribe dispatch prompt leanness in handoff skill
- **File:** `shared/skills/workflow/docs/ralph-workflow-handoff/SKILL.md`
- **Finding:** Improvement Suggestion #3 — "Scribe dispatch prompt leanness"
- **Root cause:** Rule gap — the handoff skill said "Dispatch the ralph-scribe sub-agent to compose the handoff document..." without guidance on prompt construction. The orchestrator included ~500 chars of inline phase summaries and review results in the dispatch prompt, violating the "never relay content between subagents" principle from the orchestrator template.
- **Change:** Replaced the dispatch instruction with explicit guidance: "Dispatch the ralph-scribe sub-agent with a one-line directive (e.g. 'Compose handoff artifacts for {{ taskId }}'). **Keep the dispatch prompt lean** — provide only the task ID and directive. Do NOT include inline summaries of phase outcomes, review results, or other upstream data. The scribe reads all upstream artifacts from the artifact directory directly..."

## Proposed (Not Implemented)

### Scribe delivery autonomy (Suggestion #2)
- **Finding:** The orchestrator reads `jira-comment.md` and `ralphchives-report.md` from the scribe's artifacts to relay their content to JIRA and ralphchives MCP tools. This puts ~2KB of delivery content into orchestrator context, violating D9b purity.
- **Proposed fix:** Give the scribe direct MCP access to `jira_add_comment`, `jira_add_attachment`, and `post_task_report` so it can deliver its own content. This would require:
  1. Adding MCP server access to the ralph-scribe agent config in both profiles
  2. Moving steps 2–4 of the handoff skill into the scribe's own instructions
  3. Reducing the handoff skill to: dispatch scribe → read status.json → print exit block
- **Why not implemented:** This is an architecture change that shifts the scribe from a pure compositor to a delivery agent. It changes the security boundary (scribe currently has no external API access) and the error recovery model (orchestrator currently retries delivery failures itself). Needs human review of the tradeoff.

### SUG follow-up tracking (Suggestion #4)
- **Finding:** IA reviewer identified a genuine documentation gap (CI/CD reference page missing `cms.memberrole`) as SUG-003, which was correctly classified as non-blocking. However, SUG findings that identify real documentation gaps risk being lost since there's no mechanism to track them as follow-up work.
- **Proposed fix:** Add a post-review step that collects SUG findings identifying documentation gaps and either: (a) creates follow-up JIRA tickets automatically via `jira_create_issue`, or (b) adds them to a structured "Follow-up Items" section in the handoff document for human triage.
- **Why not implemented:** Option (a) requires careful scoping — not all SUG findings warrant JIRA tickets, and auto-creating tickets without human judgment could create noise. Option (b) could be added to the scribe template, but the current handoff format already has "Suggested Next Steps" and "Open Questions" sections where SUG findings could naturally land. The scribe's instructions already say to surface "anything a future agent working on the same area should know." The gap is more about reviewer-to-scribe signal flow than missing template structure.

## No Action Needed

### Orchestrator purity (D9b)
The analysis noted that the orchestrator reads scribe delivery artifacts (jira-comment.md, ralphchives-report.md) as a purity deviation. This is architecturally expected — the scribe has no MCP access, so the orchestrator acts as the delivery mechanism. Change #4 above (lean dispatch) reduces unnecessary context ingestion. The remaining content relay (for JIRA posting and ralphchives) is addressed by the "Scribe delivery autonomy" proposal above. No further template changes needed until that architecture decision is made.

### Tool selection, parallelism, and workflow compliance
The analysis found no issues — tool selection was correct throughout, reviewer parallelism was excellent (242ms dispatch spread), and all phases completed in order with proper state tracking. No changes needed.

### Error recovery patterns
The ralphchives tag retry was the only error. Git push avoidance (going directly to `ado_push_progress`) was learned behavior from prior runs — this is working as designed. No changes needed.
