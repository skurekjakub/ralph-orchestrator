# Improvement Summary: ralph-writer (DOC-3189)

## Changes Made

### 1. Fix artifact versioning to prevent output file overwrites
- **File:** `shared/agent-includes/agent-as-function-contract.md`
- **Finding:** Analysis §Artifact Quality → "Output file versioning" (rated poor — overwrite bug): v3 wrote `output-v1.md` overwriting v1's TASK-01 output because the writer reset the version counter per planned task.
- **Root cause:** Rule gap — the contract said `output-v{N}.md where N is your iteration number` without defining whether N resets per subtask or is cumulative across dispatches.
- **Change:** Rewrote the primary artifact description to explicitly state N is the **cumulative dispatch count** (monotonically increasing). Added a ⚠️ warning block with the concrete procedure: list existing `output-v*.md` files, set N = highest + 1, never reset N when switching subtasks.

### 2. Fix iteration and artifacts field definitions in status.json
- **File:** `shared/agent-includes/agent-as-function-contract.md`
- **Finding:** Analysis §Artifact Quality → "status.json" (rated poor): `iteration: 1` after 3 dispatches; `artifacts` array listed only one file despite two existing.
- **Root cause:** Rule gap — the `iteration` field was described as "How many times you've run for this task" (ambiguous) and `artifacts` had no completeness requirement.
- **Change:** Updated the field description table: `iteration` now explicitly says "Cumulative dispatch count for this task (monotonically increasing)". `artifacts` now says "must list ALL output files written across all iterations, not just the latest."

### 3. Add version-number determination procedure to writer template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-writer.agent.md`
- **Finding:** Analysis §Artifact Quality → "Output file versioning": writer treated each new planned task as "iteration 1", destroying audit trail.
- **Root cause:** Agent behavior gap — the writer had no explicit procedure for determining N. Added writer-specific reinforcement of the contract rule.
- **Change:** Added a "Determine your version number" subsection to the Output section with a concrete `ls` command to check existing files and the rule to set N = highest + 1. Includes an explicit example sequence (TASK-01 initial → v1, TASK-01 revision → v2, TASK-02 → v3).

### 4. Add artifacts completeness rule to writer template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-writer.agent.md`
- **Finding:** Analysis §Artifact Quality → "status.json": artifacts array referenced only `output-v1.md` despite `output-v2.md` also existing.
- **Root cause:** Agent behavior gap — the contract now requires listing all files, but the writer template needed reinforcement.
- **Change:** Added explicit rule after the `status.json` / `manifest.json` instruction: "The `artifacts` array in your `status.json` must list **every** `output-v*.md` file in your artifact directory, not just the one you wrote this dispatch."

### 5. Add revision-mode efficiency guidance to writer template
- **File:** `profiles/ralph-docs/agents/ralph.ralph-writer.agent.md`
- **Finding:** Analysis §Efficiency: "v2 (style revision): 72 tool calls and 764K input tokens to fix 5 small text substitutions. The 72 actual calls represent ~2.4× overhead."
- **Root cause:** Rule gap — the writer template had no differentiation between initial-write mode and revision mode. The writer re-read all research artifacts and skills, re-verified all acceptance criteria, and ran multiple builds for a simple revision.
- **Change:** Added a "Revision-mode efficiency" subsection to the Input section with 5 specific rules: go straight to findings, skip full re-reading of already-loaded skills, make targeted edits only, run the build once after all edits, dispatch the validator once at the end.

### 6. Update orchestrator revision dispatch to include inline findings
- **File:** `shared/skills/workflow/docs/ralph-workflow/references/4-review.md`
- **Finding:** Analysis §Dispatch Prompt Gaps #2: "When dispatching for a revision (v2), the orchestrator could include the specific findings inline in the dispatch prompt rather than requiring the writer to discover them by reading reviewer artifacts."
- **Root cause:** Rule gap — the Phase 5 revision loop told the orchestrator to dispatch the writer with a generic one-line directive ("Address reviewer feedback for the current task"). The writer then had to discover the findings by reading full reviewer artifacts.
- **Change:** Rewrote all 3 cycle instructions to require including failing reviewer names and finding IDs in the dispatch prompt. Added a "Constructing the revision dispatch prompt" subsection with a concrete example showing how to extract the `summary` field from each failing reviewer's `status.json` and include it inline.

## Proposed (Not Implemented)

### Infrastructure Issues

- **Consider Sonnet for revision loops** — Analysis §Improvement Suggestions #4: "Opus used for all 3 invocations including a simple revision. Revision loops are lower-complexity than initial implementation. The orchestrator could dispatch the writer with a Sonnet model override for revision-only iterations, saving ~40% on token cost." This requires orchestrator-level model override capability which may need profile config changes. The writer template already uses `model: claude-opus-4.6` in frontmatter — overriding per-dispatch would need orchestrator support.

### New Skills / MCP Servers

- **Revision-efficiency skill** — Analysis §Skill Gaps: "A 'revision-efficiency' skill could help the writer scope its work more tightly on revision loops." The revision-mode guidance added directly to the writer template (Change #5) addresses this for the writer specifically. A standalone skill would be warranted if the same pattern appears in other iterative subagents (coder, reviewers). Monitor future runs before creating.

### Alternative Flow Proposals

None identified — the current researcher → planner → writer → reviewer → revision loop flow is appropriate for this task type.

### SOTA Suggestions

None identified — the changes are targeted operational fixes rather than architectural redesigns.

## No Action Needed

- **Tool selection** (rated good) — writer used appropriate tools for its role across all invocations. No changes needed.
- **Error recovery** (rated good) — zero errors across all 3 invocations. No changes needed.
- **Content quality** (rated good) — output files were well-structured, style revision handling was correct, acceptance criteria verification was thorough. No changes needed.
- **Validator integration** (rated good) — writer-validator loop is tight and efficient. No changes needed.
- **Template resolution** — all artifact directory references, agent names, and file paths resolved correctly. No changes needed.
- **Tool/MCP gaps** — none identified in analysis. No changes needed.
