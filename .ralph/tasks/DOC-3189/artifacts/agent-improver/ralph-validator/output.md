# Improvement Summary: ralph-validator (DOC-3189)

## Changes Made

### 1. Downgrade model from Opus to Sonnet
- **File:** `profiles/ralph-docs/agents/ralph.ralph-validator.agent.md`
- **Finding:** Token & Context section — "Over 1M input tokens for a lightweight validation sub-agent is excessive"; Improvement Suggestion #1 — "The validator performs checklist comparison, not creative reasoning. Sonnet-class is sufficient"
- **Root cause:** Infrastructure issue — model overprovisioned for task complexity
- **Change:** Changed `model: claude-opus-4.6` to `model: claude-sonnet-4.6` in frontmatter. The validator does read-only checklist comparison (file exists, acceptance criteria covered, cross-links resolve, build passes). This requires no creative reasoning — Sonnet handles structured verification well. Expected ~3× token cost reduction per invocation.

### 2. Add iteration-number determination procedure
- **File:** `profiles/ralph-docs/agents/ralph.ralph-validator.agent.md`
- **Finding:** Gap Identification → Dispatch Prompt Gaps — "The validator re-read its own previous outputs (v1, v2) and status.json, spending turns orienting itself in a stale artifact state"; Efficiency section — "In v3, the validator read output-v1.md, output-v2.md, status.json, and the validator artifact directory listing — all to understand its own prior state. This orientation overhead consumed ~5 turns"
- **Root cause:** Rule gap — the validator template had no guidance on how to determine iteration number efficiently
- **Change:** Added a "Determine your iteration number" subsection to the Input section with an explicit `ls | sort -V` procedure, and the instruction "Do not read your own prior output files — you only need the count." This eliminates the 5-turn orientation overhead observed in v3.

### 3. Mandate independent build verification
- **File:** `profiles/ralph-docs/agents/ralph.ralph-validator.agent.md`
- **Finding:** Gap Identification → Tool/MCP Gaps — "v1 relied on 'Confirmed by orchestrator (build already passed)' without independent verification. v3 independently checked buildlog.log"; Improvement Suggestion #3 — "The validator prompt says 'check npm run build output if provided' but doesn't mandate independent verification"
- **Root cause:** Rule gap — the original phrasing "check `npm run build` output if provided" was permissive, allowing the validator to skip build verification
- **Change:** Replaced the permissive build check item with an explicit mandatory rule: "Always verify independently — run `grep -i 'error|fatal|failed' {{ artifactDir }}/../buildlog.log` or check the build log directly. Never rely on orchestrator confirmation or prior validator iterations for build status." Includes a concrete grep command so the validator doesn't have to figure out how to check.

### 4. Clarify task_id semantics in validator rules
- **File:** `profiles/ralph-docs/agents/ralph.ralph-validator.agent.md`
- **Finding:** Artifact Quality → status.json — "v1 wrote task_id: 'DOC-3189', v2 overwrote it to 'TASK-01', v3 corrected back to 'DOC-3189'"; Improvement Suggestion #4 — "Add to the artifact contract or validator prompt: task_id must always be the work item ID"
- **Root cause:** Agent behavior gap — the artifact contract template uses `{{ taskId }}` which resolves to the work item ID, but the v2 validator substituted a subtask ID
- **Change:** Added explicit rule: "`task_id` is always the work item ID — use `{{ taskId }}` (e.g., DOC-3189) in status.json, never a subtask ID like TASK-01. Subtask IDs belong in your output prose, not in artifact contract fields." Also added `task_id` documentation to the shared artifact contract field table (see change #6).

### 5. Prohibit non-standard artifact files
- **File:** `profiles/ralph-docs/agents/ralph.ralph-validator.agent.md`
- **Finding:** Artifact Quality → status.json — "The v2 validator created [status-v2.json] as a safety copy after edit conflicts. This file is outside the artifact contract and could confuse downstream readers"; Improvement Suggestion #5 — "The artifact contract specifies a single status.json"
- **Root cause:** Agent behavior gap — the validator created a non-standard file when encountering an edit conflict instead of properly retrying
- **Change:** Added explicit rule: "Single status.json only — overwrite status.json in place per the artifact contract. Never create versioned copies like status-v2.json or backup files. If an edit fails, read the current file content and retry with the correct old_str."

### 6. Add task_id semantics to shared artifact contract
- **File:** `shared/agent-includes/agent-as-function-contract.md`
- **Finding:** Improvement Suggestion #4 — "Add to the artifact contract or validator prompt: task_id must always be the work item ID"; Gap Identification → Dispatch Prompt Gaps — "task_id ambiguity"
- **Root cause:** Rule gap — the shared artifact contract's field table documented all status.json fields except `task_id`, leaving its semantics undefined
- **Change:** Added `task_id` row to the field description table: "Always the **work item ID** (e.g., DOC-3189) from {{ taskId }} — never a subtask ID like TASK-01". This prevents the ambiguity across all subagents, not just the validator.

### 7. Improve writer's validator dispatch prompt
- **File:** `profiles/ralph-docs/agents/ralph.ralph-writer.agent.md`
- **Finding:** Gap Identification → Dispatch Prompt Gaps — "The writer dispatches the validator but doesn't always communicate which prior validator outputs exist"; Efficiency section — "the high turn count suggests context-reading overhead"
- **Root cause:** Rule gap — the writer's dispatch instruction was terse ("Use the ralph-validator sub-agent to validate the active task before returning") with no guidance on what context to include
- **Change:** Enhanced step 7 to: "Dispatch the ralph-validator sub-agent to validate the active task before returning. In your dispatch prompt, include: the active subtask ID (e.g., TASK-01), the files you changed, and the build result. Do not include prior validator results — the validator determines its own iteration number from the filesystem." Also clarified step 8 to include re-dispatching the validator after fixes.

## Proposed (Not Implemented)

### Infrastructure Issues

None identified. All MCP disconnection errors were infrastructure-level session teardown signals, not behavioral failures.

### New Skills / MCP Servers

**Validation checklist skill** — The analysis identified (Gap Identification → Skill Gaps) that "A reusable skill could codify the standard checks (file exists, acceptance criteria coverage, build passes, cross-links resolve, frontmatter correct) so the validator doesn't need to derive them from scratch each invocation." While the immediate orientation overhead is now addressed by changes #2 and the new rules, a checklist skill could further standardize validation across different task types if the validator continues to show inconsistent check coverage. Recommend monitoring the next 3-5 runs with the current changes before investing in a separate skill.

### Alternative Flow Proposals

None. The validator's current position in the workflow (dispatched by writer, read-only validation, writer fixes issues) is appropriate. The analysis found no structural problems with the flow — only efficiency and rule-gap issues within the existing pattern.

### SOTA Suggestions

None identified. The validator's task (structured checklist verification) is well-served by standard prompting improvements. No novel multi-agent patterns apply.

## No Action Needed

- **Tool selection (rated good)** — The validator used appropriate tools (view, bash, create, grep) and correctly respected the read-only rule. No changes needed.
- **Output quality (rated good)** — All three output files were well-structured with specific line numbers and source code cross-references. No false positives or false negatives detected.
- **manifest.json compliance** — All three iterations had correct entries. No changes needed.
- **Template resolution** — Artifact paths, agent name, and identity all resolved correctly. No changes needed.
- **MCP disconnection errors** — Infrastructure-level teardown signals that didn't affect the validator. No changes needed.
