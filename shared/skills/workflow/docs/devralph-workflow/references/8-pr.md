{%- unless isRevision %}

# Phase 8: Pull Request

## Before you begin

1. **Read `state.md`** — confirm you're in Phase 8.
2. All changes must be committed and pushed.
3. Read the **ralph-ado-pr-workflow** skill for ADO PR creation details.

## Instructions

1. **Create the PR** via the ADO MCP tool with:
   - **Title:** `{{ taskId }}: <concise description>`
   - **Source branch:** your current branch (`ralph/{{ taskId }}-...`)
   - **Target branch:** `main`

2. **PR description** — use this template:

   ```markdown
   ## Summary
   
   <One paragraph describing the change and its purpose>
   
   ## JIRA Issue
   
   [{{ taskId }}](https://kentico.atlassian.net/browse/{{ taskId }})
   
   ## Affected Components
   
   - [ ] Ruby gems: <list affected gems>
   - [ ] Gulp pipeline: <describe changes>
   - [ ] Frontend JS: <which bundle/modules>
   - [ ] CSS: <Less / Tailwind changes>
   - [ ] Jekyll templates: <layouts/includes modified>
   - [ ] Configuration: <config files changed>
   
   ## Changes
   
   <Bullet list of specific changes>
   
   ## Testing
   
   - [ ] Build passes (`npm run build`)
   - [ ] RSpec tests pass (`npx gulp rspec_tests`)
   - [ ] Visual verification via BrowserSync
   - [ ] E2E tests (if applicable)
   
   ## Breaking Changes
   
   <None / describe any breaking changes>
   ```

3. **Record the PR URL** in `state.md`.

## Before moving to Phase 9

Update `state.md`:
- Set "Current Phase" to `Phase 9: Handoff`
- Set "Reference file for this phase" to `references/9-handoff.md`
- Add Phase 8 to "Completed Phases" with PR URL

{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
