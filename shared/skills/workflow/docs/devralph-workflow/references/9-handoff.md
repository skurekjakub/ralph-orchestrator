{%- unless isRevision %}

# Phase 9: Handoff & Exit

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 9.
2. PR must be created.

## Instructions

1. **Write the handoff file** at `.ralph/tasks/{{ taskId }}/handoff.md`:

   ```markdown
   # Handoff: {{ taskId }} — {{ taskTitle }}
   
   ## Status
   <completed | partial | blocked>
   
   ## Summary
   <What was done — 2-3 sentences>
   
   ## Changes Made
   <Bullet list of all changes with file paths>
   
   ## Affected Components
   <Which parts of the stack were modified>
   
   ## Testing Results
   - Build: <pass/fail>
   - RSpec: <pass/fail, test count>
   - E2E: <pass/fail/skipped>
   - Visual: <verified via BrowserSync / not applicable>
   
   ## Pull Request
   <PR URL>
   
   ## Known Issues / Follow-ups
   <Any remaining items, edge cases noted, or future work>
   
   ## Key Decisions
   <Major technical decisions made during implementation>
   ```

2. **Comment on JIRA** ({{ taskId }}) — post a summary with:
   - What was implemented
   - PR link
   - Any caveats or follow-up items

3. **Attach the handoff file** to the JIRA issue.

4. **Post task report to Ralphchives** — follow the `ralph-ralphchives` skill's "After Completing Work" section: search for an existing task topic, reply or create a new task report summarizing what was done and any patterns/gotchas discovered.

5. **Return your result**, as `<result-contract>` describes — this signals the orchestrator that you're done:
   - `STATUS`: `completed`, `partial` or `blocked`
   - `PR_URL`: the PR URL; leave it out when there is none
   - `SUMMARY`: one line on the outcome

## Completion

This is the final phase. After returning your result, your session ends. The orchestrator picks up the result and transitions the JIRA issue.

{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
