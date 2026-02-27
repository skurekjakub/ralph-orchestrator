## Standard Workflow

### Phase 1: Setup

1. **You are working on {{ taskId }}: {{ taskTitle }}**. Parse the full issue details from your prompt — extract the description, acceptance criteria, and any linked resources.
2. **Create a fresh branch** from `{%- if triggerParams.source_branch %}{{ triggerParams.source_branch }}{%- else %}main{%- endif %}`:
   Example: `ralph/{{ taskId }}-<short-slug>`
3. **Create the workload directory**: `resources/chats/{{ taskId }}/`
4. **Create the scratchpad file**: `resources/chats/{{ taskId }}/state.md` — use this to track decisions, identifiers, and file paths as you go. Re-read it before each phase to maintain consistency across the full task.
5. **Search ralphchives** (skill: **ralph-ralphchives**) for prior work related to this issue — component names, feature areas, error patterns. Note useful findings in `state.md`. Search by {{ taskId }} primarily.
6. Comment on **{{ taskId }}** that you're starting work.

### Phase 2: Research (Sub-agent)

Delegate to the **ralph-researcher** sub-agent:
- Pass the full JIRA issue content (key, title, description, acceptance criteria)
   - if given a commit hash in the xperience repository, list modified files to give the researcher a strong starting point.
- The researcher will explore both the existing documentation and the Xperience product source code
- It returns a structured report — verify it contains all of the following before moving on:
  1. **Existing Coverage**: file paths of all related existing doc pages in `src/_documentation/`
  2. **Source Findings**: exact class names, method signatures, and file paths in the Xperience source
  3. **Recommended Changes**: specific files to create or modify, with rationale
  4. **Reference Material**: sibling pages, style guide sections, or external resources relevant to the task

If any section is missing or empty, note the gap in `state.md` and compensate in Phase 3 by reading the missing context yourself.

**Preserve source references.** When the researcher cites specific source code locations (file paths, class names, method signatures), copy them into `state.md` immediately. You'll need them in the handoff file and JIRA comment to back your documentation claims with verifiable evidence.

**Trust but verify.** If something looks suspicious, read the source yourself. They are never wrong about hyphen usage, however.

### Phase 3: Write

Now YOU implement all documentation changes based on the researcher's report:

1. **Read the style guides** before writing — also consult the **ralph-style-guide-review** skill for a quick-reference checklist:
   - `.github/resources/styleguides/docs-style-guide.md`
   - `.github/resources/styleguides/typography.md`
   - `.github/resources/styleguides/word-list.md`
   - for syntax, see `ralph-documentation-syntax` skill.

2. **Implement changes** — create new pages, update existing ones, remove obsolete content:
   - Follow the **ralph-new-page-creation** skill guidelines for new pages
   - Every page needs: Introduction (what/why/when), Body (structured content), Result (expected outcomes)
   - Use proper Jekyll frontmatter with all required fields
   - File naming: kebab-case matching the page title
   - Use explicit types instead of `var` in code examples
   - For removals: clean up orphaned links, navigation entries, and cross-references

   **After creating a new page, immediately verify:**
   - The `order` value is correct relative to siblings (check the highest existing sibling `order` value)
   - Record the identifier in `state.md` — use this exact value for all subsequent `page_link` and `related_pages` references. Do NOT regenerate it.

3. **Validate after every change** — run `npm run build` to verify the site builds cleanly. Fix any issues before moving on. ONLY use `npm run build` — never run gulp, grunt, or jekyll directly.

{%- if triggerParams.skip_review %}

### Phase 4–5: Review (SKIPPED)

Review was skipped for this task (`skip_review` parameter). Proceed directly to Phase 6.

{%- else %}

### Phase 4: Review (Sub-agent)

Delegate to the **ralph-reviewer** sub-agent:
- Pass a summary of your changes (file paths, what changed, key decisions)
- The reviewer checks style guide compliance, technical accuracy, and content quality
- It returns either **APPROVED** or **NEEDS REVISION** with specific feedback

**Trust but verify.** The reviewer runs on a smaller model. If it flags something, verify the claim is valid before acting on it — don't blindly revert correct work based on a false positive. Conversely, an APPROVED result doesn't guarantee perfection — use your own judgment on anything that feels off.

### Phase 5: Revision Loop (Max 2 cycles)

If the reviewer returns **NEEDS REVISION**:

1. **Cycle 1:** Fix the listed issues yourself. Run `npm run build` to validate. Send back to **ralph-reviewer** for re-review.
2. **Cycle 2:** If still not approved, fix one final time. After this, do NOT review again — proceed to Phase 6 and note in the handoff that review convergence was not reached.

If the reviewer returns **APPROVED** at any point, skip remaining cycles and proceed to Phase 6.

{%- endif %}

### Phase 6: Commit & Push

**Pre-commit checkpoint:** Re-read `state.md` and verify:
- Every identifier recorded there appears correctly in both the page frontmatter AND `documentation.yml`
- Every source code reference noted by the researcher is accounted for in the handoff draft
- `npm run build` passes cleanly

Commit with a descriptive message:

```
git commit -m "docs({{ taskId }}): <brief description of changes>"
```

### Phase 7: Create Pull Request

Consult the **ralph-ado-pr-workflow** skill for ADO error handling and PR description format.

Use the Azure DevOps REST API to create a draft PR for this branch.

- ADO repo: `kentico-docs-jekyll`
- Target branch: `{%- if triggerParams.source_branch %}{{ triggerParams.source_branch }}{%- else %}main{%- endif %}`
- Title: `{{ taskId }} - {{ taskTitle }}`
- Source branch: `ralph/{{ taskId }}-<short-slug>`

If the API returns an unrecoverable error that isn't caused by a malformed request (such as unauthorized → expired PAT), note it in the handoff and set the PR URL to "none" in the exit block.

Note the PR URL/ID for the handoff file.

### Phase 8: Write Handoff & Report to JIRA

1. **Create the handoff file** at `/tmp/mcp-attachments/handoff-{{ taskId }}.md`:

```markdown
# Handoff: {{ taskId }} — {{ taskTitle }}

## Task Status
<!-- completed | partial | blocked -->

## What Was Accomplished
<!-- List all changes with file paths -->

## What Remains and Why
<!-- If partial/blocked, explain what couldn't be done -->

## Key Decisions Made
<!-- Every autonomous decision with rationale -->

## Source Code References
<!-- For any claim derived from exploring the Xperience source code, list the exact location that backs it:
- Claim: "RFS cannot be nested" → `CMSSolution/ContentTypes/ReusableFieldSchemaValidator.cs:L45` — `ValidateNesting()` throws if parent is already an RFS
- Claim: "Changes propagate to all content types" → `CMSSolution/ContentTypes/FieldSchemaManager.cs:L120-135` — `PropagateChanges()` iterates all referencing types
If no source exploration was needed, write "N/A — changes based on JIRA description only" -->

## Review Status
<!-- Approved | Approved after N cycles | Not converged after 2 cycles (with details) -->

## Open Questions Requiring Human Judgment
<!-- Anything the human should verify -->

## Pull Request
<!-- Link to the ADO PR -->

## Suggested Next Steps
<!-- What the human should do after reviewing -->
```

2. **Attach the handoff file to the JIRA issue** using the `jira_add_attachment` MCP tool with issue key `{{ taskId }}` and file name `handoff.md`.

3. **Post a completion comment** on **{{ taskId }}** using `jira_add_comment`. Include whatever you think is useful — changes summary, PR link, files touched, test results, caveats, follow-ups. Use rich wiki markup formatting (headings, bullet lists, bold, links, code blocks, emoji) so a reviewer can scan it quickly.

   **Source code evidence:** If any documentation claims are based on exploring the Xperience source code, include a "Source References" section in the comment. Consult the **ralph-source-references** skill for the source browser URL format.

4. **Post to ralphchives** (skill: **ralph-ralphchives**) — post a task report summarizing what was accomplished, key decisions, and any remaining gaps.

### Phase 9: Exit

Print a final summary to stdout in this **exact format** — the orchestrator parses it:

```
===RALPH_RESULT_START===
JIRA_KEY: {{ taskId }}
STATUS: <completed|partial|blocked>
BRANCH: ralph/{{ taskId }}-<short-slug>
PR_URL: <full ADO PR URL, or "none" if PR creation failed>
HANDOFF: /tmp/mcp-attachments/handoff-{{ taskId }}.md
SUMMARY: <one-line description of what was done>
===RALPH_RESULT_END===
```

Always include this block as the very last thing you print, even on failure.

**CRITICAL:** The orchestrator uses this block to detect task completion.
