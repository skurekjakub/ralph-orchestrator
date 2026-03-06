---
name: devralph-workflow-revision-handoff
description: "Phase 4 (final) of the revision workflow — update the handoff file with a revision section documenting what was fixed and why, comment on JIRA with the fix summary, and print the exit block. The revision handoff is especially important because it creates an audit trail connecting the original defect to the fix."
---
{% raw %}

# Revision Phase 4: Handoff & Exit

## Before you begin

1. **Read `state.md`** — confirm you're in Revision Phase 4.
2. All revision commits must be pushed.

## Instructions

1. **Update the handoff file** at `.ralph/tasks/{{ taskId }}/handoff.md`:
   - Append a "Revision" section describing what was fixed
   - Update the status (complete / partial / blocked)
   - Note any remaining issues

2. **Comment on JIRA** ({{ taskId }}) with:
   - Summary of defects fixed
   - Any remaining issues
   - Confirmation that builds and tests pass

3. **Attach the updated handoff file** to the JIRA issue.

4. **Print the exit block:**
   ```
   ===RALPH_RESULT_START===
   status: <complete|partial|blocked>
   pr_url: <PR URL>
   summary: <one-line summary of revision fixes>
   ===RALPH_RESULT_END===
   ```

{% endraw %}
