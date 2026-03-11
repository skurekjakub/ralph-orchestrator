# Improvement Summary: DOC-3196 (All Subagents)

## Changes Made

### 1. Eliminate CHANGELOG purity violation in package workflow
- **File:** `shared/skills/workflow/vscode/vscode-workflow-package/SKILL.md`
- **Finding:** Orchestrator Analysis → Orchestrator Purity — "The orchestrator read `ralph-coder/output-v1.md` to gather change details for the CHANGELOG entry. This is a known purity violation."
- **Root cause:** Rule gap — the `vscode-workflow-package` skill explicitly instructed the orchestrator to read `ralph-coder/output-v{latest}.md`, which contradicts the orchestrator's "never read any `output.md` or `output-v{N}.md` artifact — only `status.json`" rule.
- **Change:** Replaced the instruction to read the coder's output artifact with an instruction to read the `changelog_entry` field from the coder's `status.json`. Added an explicit purity warning against reading output artifacts.

### 2. Add `changelog_entry` field to coder status.json
- **File:** `profiles/ralph-vscode/agents/ralph.ralph-coder.agent.md`
- **Finding:** Improvement Suggestion #2 — "Add a `changelog_entry` field to the coder's `status.json` that contains a CHANGELOG-ready summary"
- **Root cause:** Rule gap — the coder had no instruction to produce a CHANGELOG-ready summary in its status.json, so the orchestrator had to read the full output artifact to get enough detail for the CHANGELOG. This was the enabling cause of the purity violation.
- **Change:** Added a "status.json — additional coder-specific field" subsection after the Output section, instructing the coder to include a `changelog_entry` field with a user-facing description suitable for CHANGELOG.md. This gives the orchestrator what it needs without violating purity.

### 3. Add test count verification guidance
- **File:** `profiles/ralph-vscode/agents/ralph.ralph-coder.agent.md`
- **Finding:** Subagent Analysis → ralph-coder → Finding [D6 accuracy] — "The coder claims '13 new tests' in both output-v1.md and status.json, but the reviewer found 15 tests (7 + 4 + 4 = 15)"
- **Root cause:** Agent behavior gap — the coder manually counted tests instead of reading the count from the test runner output.
- **Change:** Added a bullet point to the Validate section: "Verify counts from test runner output — when reporting test counts in your output artifact and status.json, use the actual numbers from the test runner rather than manually counting."

## Proposed (Not Implemented)

### Infrastructure Issues

None identified — all template variables resolved correctly, MCP tools worked, no infrastructure failures.

### New Skills / MCP Servers

None needed — no recurring patterns or missing capabilities identified.

### Alternative Flow Proposals

None — the standard analyst → coder → reviewer → scribe pipeline was efficient for this task type (16.9 min, 1 iteration, clean pass).

### SOTA Suggestions

None — this was a clean, efficient execution. No structural problems warrant novel approaches.

## No Action Needed

- **Reviewer dispatch changed file list** (Improvement Suggestion #3): The reviewer currently discovers changed files via `git diff` and its own explore subagents. While providing an explicit file list in the dispatch prompt could slightly reduce overhead, the reviewer handled discovery fine (6.7 min is acceptable for a thorough first-pass review with pattern verification). The reviewer is already told to read the coder's output artifact directly. No change needed.

- **Reviewer LLM call count** (Improvement Suggestion #4): 48 LLM calls includes 2 explore subagents (~20+ calls from those alone). The explores were for pattern verification and test count validation — both valuable. This is a model behavior characteristic, not a template issue. No change needed.

- **Analyst performance**: Clean execution, thorough plan, correct artifact contract. No changes needed.

- **Scribe performance**: Clean execution, appropriate Ralphchives posts. No changes needed.
