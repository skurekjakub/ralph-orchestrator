# Improvement Summary: ralph-researcher (DOC-3189)

## Changes Made

### 1. Pre-populate prior-run context in dispatch prompt
- **File:** `shared/skills/workflow/docs/ralph-workflow/references/2-research.md`
- **Finding:** Improvement Suggestion #1 — "Pre-populate prior-run context in dispatch prompt"; Gap Identification > Dispatch Prompt Gaps — "The orchestrator's dispatch prompt could pre-populate this context to save the researcher ~10 tool calls on ralphchives queries"
- **Root cause:** Rule gap — the Phase 2 workflow reference told the orchestrator to dispatch the researcher but did not instruct it to include prior-run context for re-runs. The researcher had to independently discover prior PR #3043 and DOC-3188 context via ralphchives.
- **Change:** Added a "Re-run Context" subsection to the Phase 2 dispatch instructions. When `state.md` or Phase 1 setup reveals a prior attempt (prior PR, prior handoff), the orchestrator now includes prior PR numbers, their status, a summary of what was accomplished, and any branch dependencies in the researcher dispatch prompt. This eliminates ~10 redundant ralphchives tool calls per re-run.

### 2. Strengthen microsoft-docs cross-referencing for .NET APIs
- **File:** `shared/skills/domain/ralph-research-guide/references/source-code.md`
- **Finding:** Improvement Suggestion #2 — "Encourage microsoft-docs usage for .NET concepts"; Gap Identification > Tool/MCP Gaps — "microsoft-docs not utilized"
- **Root cause:** Agent behavior gap — the external-docs reference (`references/external-docs.md`) already listed `microsoft_docs_search` and when to use it, and Research Order step 7 mentioned cross-referencing. However, the source-code reference (which the researcher reads during the active code exploration phase) had no reminder to cross-reference .NET APIs. The researcher encountered `ClaimTypes.Role`, `Authorize` attributes, and `ClaimsPrincipal` in source code but never paused to verify framework behavior via microsoft-docs.
- **Change:** Added a new "Cross-Reference .NET Framework APIs" subsection to `source-code.md`, positioned directly after "Verify Claims" — the point where the researcher has just finished reading source code and is most likely to have encountered framework types. The section gives explicit examples (`ClaimsPrincipal`, `ClaimTypes`, `[Authorize]`, `IAuthorizationHandler`), a 3-step workflow (search → fetch → note dependencies), and emphasizes security/auth APIs as especially important.

### 3. Clarify xperience vs xperience-documentation as distinct skills
- **File:** `profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md`
- **Finding:** Improvement Suggestion #4 — "Load xperience source-map skill explicitly"; Gap Identification > Skill Gaps — "the researcher loaded `xperience-documentation` instead"
- **Root cause:** Agent behavior gap — both skills were already listed in the Skills table and Research Order, but the researcher treated them as interchangeable and only loaded `xperience-documentation`. The Research Order wording for step 4 didn't explicitly clarify they are separate skills.
- **Change:** Updated Research Order step 4 to explicitly state "**This is a separate skill from `xperience-documentation`** — you must load both." Added clarifying text that the source-map router covers product source code layout while the documentation skill covers docs structure. Also strengthened step 7 to use imperative "**you must use `microsoft_docs_search`**" instead of the softer "when source code findings need clarification."

## Proposed (Not Implemented)

### Infrastructure Issues

#### MCP SSE Connection Stability
- **Finding:** Error Recovery section — "All 6 MCP clients (web-fetch, microsoft-docs, ralphchives-write, jira-kentico, ralphchives-read, ado) disconnected simultaneously at 08:49:26"
- **Issue:** All 6 MCP SSE streams terminated at the same moment, suggesting a systemic infrastructure issue (proxy timeout, container network reset, or MCP sidecar crash) rather than individual tool failures.
- **Impact:** The researcher recovered gracefully because research was nearly complete, but for runs where MCP tools (especially ralphchives or microsoft-docs) are needed late in execution, this could cause data loss or incomplete research.
- **Recommendation:** Investigate the MCP sidecar process manager for connection keepalive settings, SSE timeout configuration, and container network stability. Consider adding automatic reconnection logic to the SSE client with exponential backoff.

### New Skills / MCP Servers

None needed based on this analysis. The researcher's existing skill set (`ralph-ralphchives`, `ralph-research-guide`, `xperience-documentation`, `xperience`) covers the required capabilities.

### Alternative Flow Proposals

None warranted. The researcher completed successfully in a single iteration with excellent artifact quality. The serial workflow (ralphchives → research guide → docs exploration → source code → report) is appropriate for this task type.

### SOTA Suggestions

None applicable. The researcher's execution pattern (structured skill loading → archival search → guided code exploration → report assembly) is well-optimized for the task scope.

## No Action Needed

- **Tool Selection (rated: good):** No changes needed. The researcher used appropriate tools for each phase and had zero duplicate file reads across 28 view calls.
- **Error Recovery (rated: good):** The researcher handled the git fetch hang and MCP disconnects cleanly. No template changes needed for error recovery patterns.
- **Artifact Quality (rated: excellent):** The 369-line output followed the report template faithfully with strong sections. No template changes needed.
- **Token Consumption:** 2.48M input / 16.9K output is proportionate to the 12-file deep source code analysis. No model or context changes needed.
- **manifest.json missing entry:** The analysis notes this is an artifact of the two-tier manifest structure (runtime vs. analysis), not a behavioral failure. No fix needed.
- **ralphchives-write not used:** The analysis suggests the researcher could have written observations back to ralphchives. This is correctly the scribe's responsibility per the workflow — no change needed.
