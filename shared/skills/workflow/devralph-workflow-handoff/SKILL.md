---
name: devralph-workflow-handoff
description: "Phase 9 (final) of the standard development workflow — write the handoff file, comment on JIRA with results, and print the exit block that signals the orchestrator your session is complete. The handoff captures institutional knowledge (decisions made, alternatives considered, known issues) that helps future runs and human reviewers."
---
{% raw %}

# Phase 9: Handoff & Exit

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 9.
2. PR must be created.

## Instructions

1. **Write the handoff file** at `.ralph/tasks/{{ taskId }}/handoff.md`:

   ```markdown
   # Handoff: {{ taskId }} — {{ taskTitle }}
   
   ## Status
   <complete | partial | blocked>
   
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

4. **Print the exit block** — this signals the orchestrator that you're done:

   ```
   ===RALPH_RESULT_START===
   status: <complete|partial|blocked>
   pr_url: <PR URL or empty>
   summary: <one-line summary>
   ===RALPH_RESULT_END===
   ```

## Completion

This is the final phase. After printing the exit block, your session ends. The orchestrator picks up the result and transitions the JIRA issue.

{% endraw %}
