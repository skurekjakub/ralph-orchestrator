# Improvement Summary: ralph-planner (DOC-3189)

## Changes Made

### 1. Tiered skill loading — core vs. supplementary skills
- **File:** `profiles/ralph-docs/agents/ralph.ralph-planner.agent.md`
- **Finding:** Skill Gaps section — "The planner loaded only `ralph-task-planning` of the 7 recommended skills. [...] loading `xperience-documentation` could have added value for validating the 'different documentation neighborhoods' reasoning"
- **Root cause:** Rule gap — the template listed all 7 skills in a flat table with the instruction "Read these before planning," giving equal weight to every skill. The planner reasonably loaded only the most obviously named one (`ralph-task-planning`) and skipped the rest because the flat list made all of them look optional-but-recommended rather than distinguishing what is essential vs. situational.
- **Change:** Split the Skills section into two tiers:
  - **Always load (core planning skills):** `ralph-task-planning` and `xperience-documentation` — these are always needed for task decomposition and page neighborhood validation.
  - **Load when relevant (supplementary skills):** The remaining 5 skills (`xperience`, `ralph-research-guide`, `ralph-ralphchives`, `ralph-documentation-syntax`, `ralph-build-errors`) — each with a "When to load" condition instead of a generic description.
  
  This change ensures the planner always loads `xperience-documentation` for page placement decisions, while keeping supplementary skills available without forcing unnecessary context consumption on simple tasks.

## Proposed (Not Implemented)

### Infrastructure Issues
None identified. The MCP SSE disconnection errors at 08:54:33 UTC were infrastructure-level and had zero impact on the planner (it requires no MCP tools). No planner-side mitigation needed.

### New Skills / MCP Servers
None needed. The planner's skill inventory is adequate — the issue was skill selection priority, not missing capabilities.

### Alternative Flow Proposals
None. The standard researcher → planner → writer pipeline worked correctly for this task type.

### SOTA Suggestions
None identified for this subagent.

## No Action Needed

### report_intent call frequency
- **Finding:** Efficiency section — "8 `report_intent` calls for 10 LLM turns is slightly excessive. 4-5 would suffice"
- **Rationale:** The analysis itself rates this as cosmetic with no quality or token impact. Adding `report_intent` frequency guidance to the planner template would be over-prescriptive for a negligible concern. The `report_intent` tool has its own built-in instruction about when to call it; adding a second layer of planner-specific guidance creates maintenance burden for zero practical benefit.

### File read strategy for small files
- **Finding:** Efficiency section — "Reading `members.md` in two sequential view calls (lines 1-30, then 30+) instead of one full read"
- **Rationale:** This is context-specific agent behavior that doesn't generalize to a template-level rule. The planner already demonstrated smart partial reads for larger files (e.g., `content-items.md` lines 1-50 then 340-400). A blanket "always read small files in one pass" rule would require the agent to estimate file size before reading, which adds its own overhead. Not worth codifying.
