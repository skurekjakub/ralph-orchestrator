---
name: ralph-workflow-write
description: "Standard workflow Phase 3. Read this skill when you're ready to turn the research report into concrete documentation changes. Dispatch the ralph-writer sub-agent, validate its result, and prepare the review phase."
---

# Phase 3: Write

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm you have the research findings from Phase 2.

## Instructions

Dispatch the **ralph-writer** sub-agent to implement all documentation changes based on the researcher's report.

### Step 1: Preparation

1. **Read the style guides** before writing — consult these skills:
   - **ralph-style-guide-review** — writing standards, typography, terminology
   - **ralph-documentation-syntax** — full Liquid tag reference and syntax
   - **ralph-callout-selection** — choosing between callout types (tip/info/note/warning/key)

2. **Extract the subtask list** from the researcher's report — look for the `### Recommended Changes` section. Each `CREATE-XXX`, `UPDATE-XXX`, `MODIFY-XXX`, or `DELETE-XXX` item is one subtask. Record them in `state.md` under a new `## Subtasks` section so you can verify the writer covered the full plan.

{%- if triggerParams.release_notes %}

3. **Add a release notes subtask** — this task was triggered with the `release_notes` parameter. After recording the researcher's subtasks, add one more:

```markdown
- [ ] WRITE-RELEASE-NOTES — Write release notes based on the documentation changes (skill: ralph-write-release-notes)
```

This subtask goes through the same loop as all others. Read the **ralph-write-release-notes** skill for format and examples. Write the release notes to `/tmp/mcp-attachments/release-notes.md` and include them in the handoff file.
{%- endif %}

### Step 2: Delegate the write phase

Invoke **ralph-writer** with:

- The research report context
- The subtask list from `state.md`
- Any task-specific skills or constraints that matter for the implementation
{%- if triggerParams.release_notes %}
- The release-notes requirement so it can include the output in its implementation pass
{%- endif %}

The writer is responsible for:

- Creating and modifying documentation files
- Running `npm run build`
- Using `ralph-validator` for subtask checks
- Addressing any validator findings before returning success

### Step 3: Record the writer result

After the writer returns:

1. Read `status.json`
2. Record the iteration result in `state.md`
3. Copy the changed file list and any tracked identifiers from the writer artifact into `state.md`
4. If the writer returned `partial`, record the blocker clearly for the handoff

{%- if triggerParams.skip_review %}

## Before moving to Phase 6

Review using dedicated subagent is skipped for this task. Proceed directly to Phase 6: Commit & Push.

Update `state.md`:
- Set "Current Phase" to `Phase 6: Commit & Push`
- Set "Skills for this phase" to:
  - ralph-workflow-commit
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 3 to "Completed Phases" with files created/modified
- Record any new identifiers in "Tracked Identifiers"
- Note: "Phases 4-5 skipped (skip_review)"

{%- else %}

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Review`
- Set "Skills for this phase" to:
  - ralph-workflow-review
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase 3 to "Completed Phases" with the writer iteration result, files created/modified, and validation outcomes
- Record any new identifiers in "Tracked Identifiers"

{%- endif %}
