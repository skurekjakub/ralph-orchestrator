# Improvement Summary: ralph-reviewer-style (DOC-3189)

## Changes Made

### 1. Add en-dash formatting rule to ralph-style-guide-review skill
- **File:** `shared/skills/domain/ralph-style-guide-review/SKILL.md`
- **Finding:** Gap Identification → Skill Gaps → "En-dash rule gap (rule gap)"
- **Root cause:** Rule gap — the reviewer prompt checklist (line 126) included an en-dash rule (`--` vs Unicode `–`) that was absent from the ralph-style-guide-review skill. The skill is the designated authority ("If a rule isn't in these skills, it's not a valid finding"), creating a conflict. The reviewer handled it correctly by deferring to the skill in v3, but this could produce inconsistent behavior across runs.
- **Change:** Added a new "En dashes and hyphens" subsection to the Typography and Formatting section of the skill, specifying: render en dashes as two ASCII hyphens `--` (not Unicode `–` U+2013), use en dashes for ranges and parenthetical asides, use regular hyphens for compound words. This reconciles the prompt checklist with the skill authority — both now agree.

### 2. Version the review-findings filename from iteration 1
- **File:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-style.agent.md`
- **Finding:** Artifact Quality → review-findings.json quality → "v1 is `review-findings.json` (no version suffix), v2/v3 use `-v2`/`-v3` suffixes"
- **Root cause:** Agent behavior gap — the template's Output section specified the filename as `review-findings.json` without a version suffix, while the iteration-versioning convention was only implicitly applied by the agent from v2 onward. The template itself didn't enforce versioned naming from iteration 1.
- **Change:** Updated the Output section to specify `review-findings-v{N}.json` as the filename pattern, with an explicit parenthetical: "always include the version suffix, even for iteration 1 — use `review-findings-v1.json`, not `review-findings.json`". This eliminates the naming inconsistency across iterations.

### 3. Add concrete example to the "list ALL artifacts" rule
- **File:** `profiles/ralph-docs/agents/ralph.ralph-reviewer-style.agent.md`
- **Finding:** Artifact Quality → status.json → "The artifacts array references only the v3 outputs. Earlier iterations' files... are present on disk but not listed."
- **Root cause:** Agent behavior gap — the rule already existed on line 246 ("artifacts must list ALL output files"), but the agent still only listed v3 files. The rule text was clear but lacked a concrete example showing what the array should look like after multiple iterations.
- **Change:** Extended the rule with a concrete example array showing all 6 files from a 3-iteration run: `["ralph-reviewer-style/output-v1.md", "ralph-reviewer-style/review-findings-v1.json", ...]`. Also updated the glob pattern from `review-findings*.json` to `review-findings-v{N}.json` to match the new versioned naming convention from Change 2.

### 4. Add reviewer re-dispatch guidance with finding codes
- **File:** `shared/skills/workflow/docs/ralph-workflow/references/4-review.md`
- **Finding:** Dispatch Prompt Gaps → "Revision dispatch should include the specific finding codes"
- **Root cause:** Rule gap — the workflow phase already had excellent guidance for including finding codes in the *writer* revision dispatch (Phase 5, lines 56 and 60-70), but had no equivalent guidance for re-dispatching the *reviewers* themselves for a revision check. The reviewer had to read its own prior artifacts to find its previous findings, costing 2-4 tool calls.
- **Change:** Added a new paragraph "Include finding codes when re-dispatching reviewers" after the existing re-invocation guidance, with a concrete example showing how to include STY-XXX codes, descriptions, and line locations in the reviewer dispatch prompt. This parallels the existing writer dispatch pattern and saves the reviewer from re-reading its own prior output.

## Proposed (Not Implemented)

### Infrastructure Issues

**Multi-task status.json overwrites.** The reviewer ran 3 times but `status.json` reflects only the v3 state. The analysis notes: "post-run analysis loses the per-invocation status chain. Consider versioned status files (`status-v1.json`, etc.) or appending to a status log." This would require changes to the shared `agent-as-function-contract.md` include and potentially the orchestrator's status-reading logic — both broader than a single-subagent improvement. The current behavior works correctly for orchestrator routing (status is read after each invocation before being overwritten), so this is a post-analysis convenience improvement, not a functional issue.

### New Skills / MCP Servers

None identified. The analysis confirms the style reviewer's tool selection is appropriate and complete — no MCP gaps and no skill gaps beyond the en-dash rule (now resolved).

### Alternative Flow Proposals

None. The analysis rates this subagent as "pass — strong execution across all 3 invocations." The three-reviewer gate pattern with revision loops is working well. The v2 re-review was notably efficient (42 tool calls / 14 LLM turns) — the pattern doesn't need structural changes.

### SOTA Suggestions

None. The subagent demonstrated correct rule-source discipline (deferring to skill authority over its own embedded checklist), good severity calibration (all 4 findings were genuine), and appropriate adversarial posture (only reviewer to request revisions, all justified). No novel approaches needed for a well-functioning reviewer.

## No Action Needed

- **Tool selection** — rated "good", no gaps. Style reviewer correctly uses view/skill/bash/create/edit and avoids MCP tools it doesn't need.
- **Efficiency** — rated "good", v2 solo span shows lean execution. No optimization targets.
- **Error recovery** — rated "good", v3 MCP disconnections were infrastructure teardown artifacts, not behavioral failures.
- **Severity accuracy** — rated "good", all 4 STY findings and 1 SUG finding were correctly classified with valid rule citations.
- **Verdict consistency** — rated "good", mechanical verdict logic was correct across all 3 invocations.
- **Template resolution** — no issues. Agent identity, file paths, and artifact directory all resolved correctly.
- **PR threading** — correctly absent. The reviewer writes artifacts only; PR comments are handled by downstream scribe/verdict agents.
