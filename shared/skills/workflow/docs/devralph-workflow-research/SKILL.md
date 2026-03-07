---
name: devralph-workflow-research
description: "Phase 2 of the standard development workflow — dispatch the stacky-analyst sub-agent to research the codebase before implementation. Capture the resulting implementation plan and risks in state.md."
---
{% raw %}

# Phase 2: Research

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 2.
2. Read domain skills listed in `state.md` under "Skills for this phase" — these contain architecture knowledge for the affected components.

## Instructions

1. **Read the JIRA issue carefully** — identify exactly what needs to change and what the acceptance criteria are.

2. **Dispatch `stacky-analyst`** with the issue details, the current branch context, and any relevant domain-skill hints.

3. **Validate the analyst result** — confirm the returned analysis includes:
   - Impacted files
   - Cross-layer integration points
   - Existing test coverage
   - A concrete implementation plan
   - Risks and edge cases

4. **Document findings in `state.md`** under "Source References" and "Implementation Plan":
   - Exact file paths from the analyst report
   - Key data flows and dependencies
   - Constraints or edge cases discovered
   - Existing test coverage

## Before moving to Phase 3

Update `state.md`:
- Set "Current Phase" to `Phase 3: Implement`
- Set "Skills for this phase" to:
  - devralph-workflow-implement
  - (domain skills for the affected components)
- Add Phase 2 to "Completed Phases" with key findings
- Ensure "Implementation Plan" has concrete steps

{% endraw %}
