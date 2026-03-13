# Improvement Summary: ralph-researcher (DOC-3193)

## Changes Made

### 1. Ralphchives pre-inclusion guidance added to researcher template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md`
- **Finding:** Analysis § Dispatch Prompt Gaps — "Researcher made 3 ralphchives calls despite pre-included summaries"; § Improvement Suggestions #1
- **Root cause:** Rule gap — the researcher template's Research Order step 1 unconditionally told the researcher to "Check Ralphchives — search for prior work on this component or feature area." The ralphchives skill reinforced this with "Before Starting Work — Search the archives." But the orchestrator already includes ralphchives findings from Phase 1 in the dispatch prompt. The researcher correctly followed its instructions, which lacked context about pre-included findings.
- **Change:** Rewrote Research Order step 1 from unconditional "Check Ralphchives" to conditional "Check Ralphchives (if not pre-included)." The new text tells the researcher to treat dispatch-included findings as primary input and only use the ralphchives MCP for deeper detail on specific topics mentioned there. Falls back to normal search if no context was provided. Estimated saving: ~3 tool calls and ~1 LLM turn per run.

### 2. Xperience source code path added to dispatch checklist
- **File:** `shared/skills/workflow/docs/ralph-workflow/references/2-research.md`
- **Finding:** Analysis § Dispatch Prompt Gaps — "The dispatch prompt doesn't mention the Xperience source code repo path (resources/repositories/xperience/). The researcher had to discover this via explore agents."; § Improvement Suggestions #2
- **Root cause:** Rule gap — the Phase 2 workflow reference told the orchestrator to dispatch with "JIRA issue details, ralphchives findings, and source code context" but didn't specify to include the concrete Xperience source code path. The researcher template and skills mentioned the path, but the researcher's explore agents are stateless and don't have access to those skills.
- **Change:** Added a "Dispatch Context Checklist" section to the Phase 2 workflow reference with 4 concrete items the orchestrator must include: JIRA details, ralphchives findings (with pre-inclusion prefix), Xperience source code path (`resources/repositories/xperience/CMSSolution/`), and branch/scope context. This makes the dispatch explicit rather than implicit.

### 3. Xperience CMSSolution path added inline to Research Order step 6
- **File:** `profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md`
- **Finding:** Analysis § Dispatch Prompt Gaps — "Adding a one-liner 'Xperience source code is at resources/repositories/xperience/CMSSolution/' to the dispatch prompt would improve the first explore agent's targeting"; § Improvement Suggestions #2
- **Root cause:** Rule gap — while the researcher template mentioned `resources/repositories/xperience` in the Rules section (line 79), it didn't include the more specific `CMSSolution/` subdirectory in the Research Order where the researcher would actually use it. The xperience skill had the full path, but the researcher must load it first — adding it inline removes a dependency.
- **Change:** Added the full `resources/repositories/xperience/CMSSolution/` path directly to Research Order step 6 (source code exploration) with an instruction to always include it in explore agent prompts.

### 4. Explore Agent Strategy section added to researcher template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md`
- **Finding:** Analysis § Efficiency — "4 explore waves (3→2→1→1) added serial latency; some later explores may have been plannable from the start"; § Improvement Suggestions #3
- **Root cause:** Agent behavior gap — the researcher template had no guidance about explore agent parallelism strategy. The researcher made reasonable sequential decisions but could have planned more upfront exploration.
- **Change:** Added a new "Explore Agent Strategy" section between Research Order and Rules. It provides:
  - Explicit guidance to maximize first-wave parallelism (aim for 4-5 instead of 3)
  - Example wave composition: docs + structure, code samples/coder status, source APIs, external framework references, glossary/terminology
  - Latency cost framing (~2-3 min per sequential wave)
  - Key paths to include in explore prompts (documentation root, Xperience source, code samples) since explore agents are stateless

## Proposed (Not Implemented)

### Infrastructure Issues

None identified — the researcher had zero tool failures and no infrastructure issues.

### New Skills / MCP Servers

None needed — the analysis found no skill or tool gaps. The researcher effectively used ralphchives, microsoft-docs, web_fetch, and four domain skills.

### Alternative Flow Proposals

None — the researcher's overall approach (skills → parallel explores → sequential follow-ups → report assembly) is sound. The improvements above optimize within this pattern.

### SOTA Suggestions

None — the researcher's performance was rated "excellent" with no structural issues. The improvements are efficiency optimizations, not capability gaps.

## No Action Needed

- **Tool selection** — rated "good" with no errors. All tools appropriate for their purpose.
- **Error recovery** — rated "good" with zero errors across 46 direct tool calls + 7 explore agents.
- **Context management** — no compaction events, effective use of explore agents to keep context lean.
- **Artifact quality** — rated "excellent" with 3 well-structured artifacts (41KB total), correct JIRA discrepancy detection, accurate API surface mapping.
- **Template resolution** — all artifact paths and explore prompts used correct repository paths.
- **CodeGraphContext for source navigation** — analysis noted the researcher could use CGC instead of explore agents for source code nav, but the Xperience source may not be indexed. Not actionable without confirming indexing status.
- **Ralphchives skill text unchanged** — the ralphchives skill itself says "Before Starting Work — Search the archives" which could reinforce redundant searching. However, the skill is shared across all agents (not just the researcher), and other agents may not receive pre-included findings. The fix is correctly scoped to the researcher template (which takes precedence over generic skill guidance) rather than changing the shared skill.
