---
name: ralph-workflow-write
description: "Standard workflow Phase 3. Read this skill when you're ready to implement documentation changes. Covers writing based on the researcher's report, consulting style guides and domain skills, validating builds with npm run build, and creating/modifying pages with proper frontmatter and identifiers."
---

# Phase 3: Write

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm you have the research findings from Phase 2.

## Instructions

Now YOU implement all documentation changes based on the researcher's report.

### Step 1: Preparation

1. **Read the style guides** before writing — also consult the **ralph-style-guide-review** skill for a quick-reference checklist:
   - `.github/resources/styleguides/docs-style-guide.md`
   - `.github/resources/styleguides/typography.md`
   - `.github/resources/styleguides/word-list.md`
   - For syntax and the full Liquid tag reference, see the **ralph-documentation-syntax** skill
   - For choosing between callout types (tip/info/note/warning/key), see the **ralph-callout-selection** skill

2. **Extract the subtask list** from the researcher's report — look for the `### Recommended Changes` section. Each `CREATE-XXX`, `UPDATE-XXX`, `MODIFY-XXX`, or `DELETE-XXX` item is one subtask. Record them in `state.md` under a new `## Subtasks` section:

```markdown
## Subtasks
(from researcher's Recommended Changes)
- [ ] CREATE-XXX — <brief description>
- [ ] UPDATE-XXX — <brief description>
- [ ] MODIFY-XXX — <brief description>
```
{%- if triggerParams.release_notes %}

3. **Add a release notes subtask** — this task was triggered with the `release_notes` parameter. After recording the researcher's subtasks, add one more:

```markdown
- [ ] WRITE-RELEASE-NOTES — Write release notes based on the documentation changes (skill: ralph-write-release-notes)
```

This subtask goes through the same loop as all others. Read the **ralph-write-release-notes** skill for format and examples. Write the release notes to `.ralph/tasks/{{ taskId }}/release-notes.md` and include them in the handoff file.
{%- endif %}

### Step 2: Subtask Loop

Process each subtask **one at a time**. For each subtask:

1. **Implement the change:**
   - Follow the **ralph-new-page-creation** skill guidelines for new pages
   - For cross-collection links (documentation ↔ guides ↔ api), see the **ralph-cross-version-linking** skill
   - For page removals or deprecations, follow the **ralph-page-removal** checklist
   - Every page needs: Introduction (what/why/when), Body (structured content), Result (expected outcomes)
   - Use proper Jekyll frontmatter with all required fields
   - File naming: kebab-case matching the page title
   - Use explicit types instead of `var` in code examples
   - For removals: clean up orphaned links, navigation entries, and cross-references

   **After creating a new page, immediately verify:**
   - The `order` value is correct relative to siblings (check the highest existing sibling `order` value)
   - Record the identifier in `state.md` — use this exact value for all subsequent `page_link` and `related_pages` references. Do NOT regenerate it.

2. **Build** — run `npm run build` to verify the site builds cleanly. Fix any issues before proceeding. ONLY use `npm run build` — never run gulp, grunt, or jekyll directly. If the build fails, consult the **ralph-build-errors** skill for common error patterns and fixes.

3. **Validate** — delegate to the **ralph-validator** sub-agent:
   - Pass the subtask definition (the researcher's `CREATE/UPDATE/MODIFY/DELETE` item and its related reference material)
   - Pass the file paths you created or modified
   - If the validator returns **ISSUES**, fix them and re-run `npm run build`
   - If the validator returns **PASS**, proceed to the next subtask

4. **Update `state.md`** — mark the subtask as done, re-read `state.md` to ground yourself before the next iteration:
   - `- [x] CREATE-XXX — done, created path/to/file.md`
   - Verify your "Current Phase" is still Phase 3
   - Verify you haven't lost track of remaining subtasks

Repeat for every subtask in the list.

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
- Add Phase 3 to "Completed Phases" with files created/modified and validation outcomes
- Record any new identifiers in "Tracked Identifiers"

{%- endif %}
