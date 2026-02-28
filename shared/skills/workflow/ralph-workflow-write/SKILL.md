---
name: ralph-workflow-write
description: "Standard workflow Phase 3. Read this skill when you're ready to implement documentation changes. Covers writing based on the researcher's report, consulting style guides and domain skills, validating builds with npm run build, and creating/modifying pages with proper frontmatter and identifiers."
---

# Phase 3: Write

## Before you begin

1. **Read `state.md`** at `resources/chats/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review completed phases** — confirm you have the research findings from Phase 2.

## Instructions

Now YOU implement all documentation changes based on the researcher's report:

1. **Read the style guides** before writing — also consult the **ralph-style-guide-review** skill for a quick-reference checklist:
   - `.github/resources/styleguides/docs-style-guide.md`
   - `.github/resources/styleguides/typography.md`
   - `.github/resources/styleguides/word-list.md`
   - For syntax and the full Liquid tag reference, see the **ralph-documentation-syntax** skill
   - For choosing between callout types (tip/info/note/warning/key), see the **ralph-callout-selection** skill

2. **Implement changes** — create new pages, update existing ones, remove obsolete content:
   - Follow the **ralph-new-page-creation** skill guidelines for new pages (includes identifier conventions and documentation.yml registration)
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

3. **Validate after every change** — run `npm run build` to verify the site builds cleanly. Fix any issues before moving on. ONLY use `npm run build` — never run gulp, grunt, or jekyll directly. If the build fails, consult the **ralph-build-errors** skill for common error patterns and fixes.

{%- if triggerParams.skip_review %}

## Before moving to Phase 6

Review was skipped for this task (`skip_review` parameter). Proceed directly to Phase 6: Commit & Push.

Update `state.md`:
- Set "Current Phase" to `Phase 6: Commit & Push`
- Set "Skills for this phase" to:
  - ralph-workflow-commit
- Add Phase 3 to "Completed Phases" with files created/modified
- Record any new identifiers in "Tracked Identifiers"
- Note: "Phases 4-5 skipped (skip_review)"

{%- else %}

## Before moving to Phase 4

Update `state.md`:
- Set "Current Phase" to `Phase 4: Review`
- Set "Skills for this phase" to:
  - ralph-workflow-review
- Add Phase 3 to "Completed Phases" with files created/modified
- Record any new identifiers in "Tracked Identifiers"

{%- endif %}
