---
name: devralph-workflow-revision-setup
description: "Phase 1 of the revision workflow — triggered when a task returns with Defect Found status. Review the previous handoff, extract specific defects from JIRA comments and reviewer feedback, and create a concrete fix plan. Understanding exactly what was wrong prevents fixing symptoms instead of root causes."
---
{% raw %}

# Revision Phase 1: Setup

## Before you begin

This is a **revision** — you're fixing defects found in a previous implementation for **{{ taskId }}**.

## Context

The orchestrator has:
- Checked out the existing task branch
- Provided the previous handoff content and reviewer feedback in your prompt

## Instructions

1. **Read the previous handoff** — understand what was implemented before and what the reviewer found wrong.

2. **Read all JIRA comments** — extract specific defect descriptions, reviewer feedback, and any requested changes.

3. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md` — this contains the history from the previous run.

4. **Update `state.md`** with a new "Revision" section:

   ```markdown
   ## Revision — Defect Fix
   
   ### Reviewer Feedback
   <summarize each defect/issue raised>
   
   ### Fix Plan
   <concrete steps to address each issue>
   ```

5. **Search ralphchives** for any new context since the last run.

## Before moving to Revision Phase 2

Update `state.md`:
- Set "Current Phase" to `Revision Phase 2: Fix`
- Set "Skills for this phase" to:
  - devralph-workflow-revision-fix
  - (domain skills for affected components)

{% endraw %}
