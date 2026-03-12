# Improvement Summary: ralph-scribe (DOC-3189)

## Changes Made

### 1. Anti-duplicate ralphchives posting guidance in scribe template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-scribe.agent.md`
- **Finding:** Analysis §Efficiency, finding 1 — "Duplicate `reply_to_thread` to topic 23. The same observation content was posted twice with identical content but different parameter ordering. The scribe may have re-sent after a context compaction dropped awareness of the prior successful call."
- **Root cause:** Agent behavior gap — the scribe template had no mechanism for tracking successful MCP write operations. After context compaction dropped the result of the first `reply_to_thread` call, the scribe retried and created a duplicate post.
- **Change:** Added a `⚠️ Preventing duplicate posts after compaction` block to the "Post to Ralphchives" section (§4). The scribe is now instructed to maintain a scratch log at `/tmp/scribe-post-log.txt`, recording each successful post's topic ID immediately after the call. Before any ralphchives write, it must check this log — if an entry exists for the target topic, skip the call. The filesystem log survives compaction.

### 2. Compaction-resilient composition strategy in scribe template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-scribe.agent.md`
- **Finding:** Analysis §Efficiency, finding 2 — "76 view calls is high for a scribe. Typically 25–35 reads should suffice. 76 suggests re-reads after compaction or overly granular file inspection. With 18 compaction events, re-reads are the likely cause." Also §Token & Context — "the scribe is reading more than it can retain, leading to re-reads and wasted tokens."
- **Root cause:** Agent behavior gap — the scribe template had no guidance on reading strategy. The scribe read all artifacts upfront, context compaction dropped them, and it re-read the same files.
- **Change:** Added a "Compaction-Resilient Composition Strategy" subsection under Rules with three numbered directives: (1) compose one output file at a time instead of reading everything upfront, (2) extract key facts from each artifact to `/tmp/scribe-scratch.md` immediately after reading so compaction-triggered re-reads hit the compact scratch file instead of full artifacts, (3) never re-read an artifact whose data is already in the scratch file or a completed output.

### 3. Duplicate-prevention section in ralphchives skill
- **File:** `shared/skills/integrations/ralph-ralphchives/SKILL.md`
- **Finding:** Analysis §Efficiency, finding 1 — same as Change 1, but this fix addresses the broader rule gap in the skill used by all agents, not just the scribe.
- **Root cause:** Rule gap — the ralphchives skill had no guidance on preventing duplicate posts. Any agent using this skill (researcher, writer, scribe) could hit the same compaction-driven retry issue.
- **Change:** Added a "Preventing Duplicate Posts" subsection after "After Completing Work — Post Task Report" with a 3-step protocol: (1) log every successful write to `/tmp/ralphchives-post-log.txt`, (2) check the log before any write call, (3) explanation that the filesystem log survives compaction while in-context memory does not.

### 4. Custom artifact list support in artifact contract
- **File:** `shared/agent-includes/agent-as-function-contract.md`
- **Finding:** Analysis §Artifact Quality, "Missing: output.md" — "The mapper flagged `output.md` as missing. This is a false positive — the scribe's prompt explicitly defines three named artifacts as its primary outputs, overriding the generic artifact contract's `output.md` convention." Also §Improvement Suggestions, finding 3 — "Clarify output.md convention for multi-file producers."
- **Root cause:** Rule gap — the artifact contract listed only `output.md` and `output-v{N}.md` as primary artifact conventions. Agents with custom artifact lists (like the scribe's handoff.md / jira-comment.md / ralphchives-report.md) had no documented convention, causing downstream tooling (mapper) to flag the absence of `output.md` as an issue.
- **Change:** Added a third bullet to the "Primary artifact" section: "Agents with custom artifact lists: If your prompt defines specific named output files (e.g., `handoff.md`, `jira-comment.md`), those replace `output.md` as your primary artifacts. List all of them in your `status.json` `artifacts` array. You do not need to also produce `output.md`."

## Proposed (Not Implemented)

### Infrastructure Issues

- **Mapper false positive for custom artifacts:** The subagent-mapper should be updated to check whether `status.json` lists custom artifacts before flagging `output.md` as missing. This is a code change in the mapper tool, not a prompt/skill change. The artifact contract update (Change 4 above) documents the convention, but the mapper's validation logic needs a corresponding update to suppress the false positive.

### New Skills / MCP Servers

None identified — the scribe's existing skill set (ralph-source-references, ralph-ralphchives) is sufficient for its role.

### Alternative Flow Proposals

None — the scribe's role as a terminal aggregation agent is well-suited to the current pipeline architecture. The efficiency issues were behavioral, not structural.

### SOTA Suggestions

- **Scratchpad-as-working-memory pattern:** The compaction-resilient composition strategy implemented in Change 2 follows an established pattern from recent agentic research on "external working memory" — using filesystem artifacts as a durable memory layer that survives context window management. This could be generalized into a shared include (e.g., `compaction-resilience.md`) for any read-heavy subagent, not just the scribe. Consider creating this if other subagents (researcher, reviewers) show similar re-read patterns in future analyses.

## No Action Needed

- **Tool Selection (rated: good):** The scribe correctly used all relevant MCP tools (JIRA, ralphchives, ADO). No tool selection changes needed.
- **Error Recovery (rated: good):** No errors encountered. No changes needed.
- **Artifact Quality (rated: excellent):** All three output files (handoff.md, jira-comment.md, ralphchives-report.md) met quality standards. No template changes for output format needed.
- **Template Resolution:** All template variables resolved correctly. No infrastructure issues.
- **Skill loading:** The analysis noted skills may not have been explicitly loaded, but the scribe produced correct source reference URLs and ralphchives posts regardless. The existing skill mounting is working correctly.
