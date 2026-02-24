## Revision Workflow

**This is a revision of a previous attempt for {{ issueKey }}.** A human reviewer has looked at your previous work, found issues, and transitioned the JIRA issue back for fixes.

Your prompt already contains:
- The **previous handoff file** (your earlier decisions and what was accomplished)
- All **JIRA comments** (including reviewer feedback)
- The original JIRA issue details

### Revision Phase 1: Understand Feedback

1. **Read the previous handoff file** embedded in your prompt — understand what was done, what decisions were made, and the PR details
2. **Read ALL JIRA comments** embedded in your prompt — identify what the reviewer wants changed
3. You are revising **{{ issueKey }}: {{ issueSummary }}** — use this key for branch/commit naming

### Revision Phase 2: Find Existing PR & Branch

1. **Find the existing branch** matching the pattern `ralph/{{ issueKey }}-*`:
   ```bash
   git fetch origin
   git branch -r | grep "ralph/{{ issueKey }}"
   ```
2. **Switch to the existing branch** (do NOT create a new one):
   ```bash
   git checkout ralph/{{ issueKey }}-<slug>
   git pull origin ralph/{{ issueKey }}-<slug>
   ```
3. **Find the existing PR** using the ADO MCP server:
   - Use `ado_list_pull_requests` with `repositoryId: "kentico-docs-jekyll"` and `project: "CustomerEducation"`, filtering by source branch `refs/heads/ralph/{{ issueKey }}-<slug>`
   - Note the PR ID from the result
4. **Read ALL PR review threads** to understand inline feedback:
   - Use `ado_list_pull_request_threads` with the PR ID from above

### Revision Phase 3: Implement Fixes

Fix the specific issues raised by the reviewer — do NOT restart from scratch:

1. **Address each feedback item** from the JIRA comments and PR threads
2. **Preserve previous decisions** unless explicitly contradicted by feedback
3. **Validate the build** with `npm run build` after each change

{%- if triggerParams.skip_review %}

### Revision Phase 4: Review (SKIPPED)

Review was skipped for this task (`skip_review` parameter). Proceed directly to Phase 5.

{%- else %}

### Revision Phase 4: Review (Optional)

If the changes are substantial, delegate to the **ralph-reviewer** sub-agent for a quick check. For minor fixes (typos, small corrections), skip the review and proceed directly.

{%- endif %}

### Revision Phase 5: Commit, Push & Respond to PR

1. Stage and commit changes:
   ```bash
   git add -A
   git commit -m "docs({{ issueKey }}): address review feedback"
   ```
2. Push to the **existing branch** (not a new one):
   ```bash
   git push origin ralph/{{ issueKey }}-<slug>
   ```
3. **Respond to PR review threads** — for each comment thread that you addressed, use `ado_reply_to_comment` with the thread ID and a brief explanation of the fix.

### Revision Phase 6: Update Handoff & Report

1. **Update the handoff file** at `/tmp/mcp-attachments/handoff-{{ issueKey }}.md` — add a "Revision" section at the top documenting what feedback was addressed and what changed
2. **Attach the updated handoff** to **{{ issueKey }}** using the `jira_add_attachment` MCP tool with file name `handoff.md`
3. **Post a completion comment** on **{{ issueKey }}** summarizing what was changed and linking to the PR

### Revision Phase 7: Exit

Print the result block:

```
===RALPH_RESULT_START===
JIRA_KEY: {{ issueKey }}
STATUS: <completed|partial|blocked>
BRANCH: ralph/{{ issueKey }}-<slug>
PR_URL: <full ADO PR URL>
HANDOFF: /tmp/mcp-attachments/handoff-{{ issueKey }}.md
SUMMARY: <one-line description of revision changes>
===RALPH_RESULT_END===
```

**CRITICAL:** The orchestrator uses this block to detect task completion.
