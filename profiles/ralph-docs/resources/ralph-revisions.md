Mode: REVISION

This is a revision of a previous attempt. The issue has been reviewed and moved back to revision status.

You MUST follow the Revision Workflow (not the standard workflow):
1. Find the existing pull request (branch pattern: ralph/<jira-key>-*)
2. Read ALL PR review threads/comments for inline feedback
3. Switch to the existing branch and make the requested changes
4. Do NOT create a new branch — work on the existing one
5. Push updates, respond to PR comments, and update the handoff file

Previous Handoff File:
========================================
<full content of the previous handoff.md>
========================================

JIRA Comments (oldest first):
========================================
[timestamp] Author Name:
Comment text...
---
[timestamp] Another Author:
Another comment...
========================================

JIRA Issue: DF-XXXX

Title: <issue summary>

<...remaining fields same as standard prompt...>
```

**If your prompt starts with `Mode: REVISION`, follow the Revision Workflow below. Otherwise, follow the Standard Workflow.**

---

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
   ```
   git fetch origin
   git branch -r | grep "ralph/<jira-key>"
   ```
2. **Switch to the existing branch** (do NOT create a new one):
   ```
   git checkout ralph/<jira-key>-<slug>
   git pull origin ralph/<jira-key>-<slug>
   ```
3. **Find the existing PR** via the Azure DevOps REST API:
   ```bash
   curl -s -u ":${ADO_PAT_DOCS}" \
     "https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_apis/git/repositories/kentico-docs-jekyll/pullrequests?searchCriteria.sourceRefName=refs/heads/ralph/<jira-key>-<slug>&api-version=7.1"
   ```
4. **Read ALL PR review threads** to understand inline feedback:
   ```bash
   curl -s -u ":${ADO_PAT_DOCS}" \
     "https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_apis/git/repositories/kentico-docs-jekyll/pullrequests/<PR_ID>/threads?api-version=7.1"
   ```

### Revision Phase 3: Implement Fixes

Delegate to the **ralph-tech-writer** sub-agent:
- Pass the **original task description**, the **reviewer feedback** (from JIRA comments and PR threads), and the **previous handoff** so the tech-writer has full context
- Instruct the tech-writer that this is a **revision** — it should fix the specific issues raised, not restart from scratch
- The tech-writer must validate the build with `npm run build` after changes

### Revision Phase 4: Review (Optional)

If the changes are substantial, delegate to the **ralph-reviewer** sub-agent for a quick check. For minor fixes (typos, small corrections), skip the review and proceed directly.

### Revision Phase 5: Commit, Push & Respond to PR

1. Stage and commit changes:
   ```
   git add -A
   git commit -m "docs(<jira-key>): address review feedback"
   ```
2. Push to the **existing branch** (not a new one):
   ```
   git push
   ```
3. **Respond to PR review threads** — for each comment thread that you addressed, post a reply via the ADO API:
   ```bash
   curl -s -u ":${ADO_PAT_DOCS}" \
     -H "Content-Type: application/json" \
     -X POST "https://dev.azure.com/KenticoCustomerSuccess/CustomerEducation/_apis/git/repositories/kentico-docs-jekyll/pullrequests/<PR_ID>/threads/<THREAD_ID>/comments?api-version=7.1" \
     -d '{"content": "Fixed — <brief explanation of what was changed>", "parentCommentId": 0, "commentType": 1}'
   ```

### Revision Phase 6: Update Handoff & Report

1. **Update the handoff file** at `resources/chats/<jira-key>/handoff.md` — add a "Revision" section at the top documenting what feedback was addressed and what changed
2. **Attach the updated handoff** to the JIRA issue (same API as standard workflow)
3. **Post a completion comment** on the JIRA issue:

```
🤖 Ralph has addressed the review feedback.

**Status:** <completed|partial|blocked>
**Branch:** ralph/<jira-key>-<slug>
**Pull Request:** <ADO PR URL>

**Changes in this revision:**
- <bullet list of what was fixed/changed>

See the updated handoff.md for full details.
```

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
