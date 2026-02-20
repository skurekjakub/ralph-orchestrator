## Revision Workflow

**Follow this workflow when the prompt starts with `Mode: REVISION`.** This means a human reviewer has looked at your previous work, found issues, and transitioned the JIRA issue back for fixes.

Your prompt already contains:
- The **previous handoff file** (your earlier decisions and what was accomplished)
- All **JIRA comments** (including reviewer feedback)
- The original JIRA issue details

### Revision Phase 1: Understand Feedback

1. **Read the previous handoff file** embedded in your prompt — understand what was done, what decisions were made, and the PR details
2. **Read ALL JIRA comments** embedded in your prompt — identify what the reviewer wants changed
3. **Extract the JIRA key** from the prompt for branch/commit naming

### Revision Phase 2: Find Existing PR & Branch

1. **Find the existing branch** matching the pattern `ralph/<jira-key>-*`:
   ```bash
   git fetch origin
   git branch -r | grep "ralph/<jira-key>"
   ```
2. **Switch to the existing branch** (do NOT create a new one):
   ```bash
   git checkout ralph/<jira-key>-<slug>
   git pull origin ralph/<jira-key>-<slug>
   ```
3. **Find the existing PR** using the ADO MCP server:
   - Use `ado_list_pull_requests` with `repositoryId: "kentico-docs-jekyll"` and `project: "CustomerEducation"`, filtering by source branch `refs/heads/ralph/<jira-key>-<slug>`
   - Note the PR ID from the result
4. **Read ALL PR review threads** to understand inline feedback:
   - Use `ado_list_pull_request_threads` with the PR ID from above

### Revision Phase 3: Implement Fixes

Fix the specific issues raised by the reviewer — do NOT restart from scratch:

1. **Address each feedback item** from the JIRA comments and PR threads
2. **Preserve previous decisions** unless explicitly contradicted by feedback
3. **Validate the build** with `npm run build` after each change

### Revision Phase 4: Review (Optional)

If the changes are substantial, delegate to the **ralph-reviewer** sub-agent for a quick check. For minor fixes (typos, small corrections), skip the review and proceed directly.

### Revision Phase 5: Commit, Push & Respond to PR

1. Stage and commit changes:
   ```bash
   git add -A
   git commit -m "docs(<jira-key>): address review feedback"
   ```
2. Push to the **existing branch** (not a new one):
   ```bash
   git push origin ralph/<jira-key>-<slug>
   ```
3. **Respond to PR review threads** — for each comment thread that you addressed, use `ado_reply_to_comment` with the thread ID and a brief explanation of the fix.

### Revision Phase 6: Update Handoff & Report

1. **Update the handoff file** at `resources/chats/<jira-key>/handoff.md` — add a "Revision" section at the top documenting what feedback was addressed and what changed
2. **Attach the updated handoff** to the JIRA issue (same JIRA attachments API as standard workflow)
3. **Post a completion comment** on the JIRA issue summarizing what was changed and linking to the PR

### Revision Phase 7: Exit

Same exit block format as the standard workflow:

```
===RALPH_RESULT_START===
JIRA_KEY: <key>
STATUS: <completed|partial|blocked>
BRANCH: ralph/<jira-key>-<slug>
PR_URL: <full ADO PR URL>
HANDOFF: resources/chats/<jira-key>/handoff.md
SUMMARY: <one-line description of revision changes>
===RALPH_RESULT_END===
```
