{%- if isRevision %}
{% raw %}

# Revision Phase 4: Handoff & Exit

## Before you begin

1. **Read `state.md`** — confirm you're in Revision Phase 4.
2. All revision commits must be pushed.

## Instructions

1. **Update the handoff file** at `.ralph/tasks/{{ taskId }}/handoff.md`:
   - Append a "Revision" section describing what was fixed
   - Update the status (completed / partial / blocked)
   - Note any remaining issues

2. **Comment on JIRA** ({{ taskId }}) with:
   - Summary of defects fixed
   - Any remaining issues
   - Confirmation that builds and tests pass

3. **Attach the updated handoff file** to the JIRA issue.

4. **Post task report to Ralphchives** — follow the `ralph-ralphchives` skill's "After Completing Work" section: search for an existing task topic, reply or create a new task report summarizing the revision fixes and any patterns/gotchas discovered.

5. **Return your result**, as `<result-contract>` describes:
   - `STATUS`: `completed`, `partial` or `blocked`
   - `PR_URL`: the PR URL; leave it out when there is none
   - `SUMMARY`: one line on the revision fixes

## Completion

This is the final revision phase. After returning your result, your session ends. The orchestrator picks up the result and transitions the JIRA issue.

{% endraw %}
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
