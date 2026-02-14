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

1. **Find the existing branch** matching the pattern `ralph/<jira-key>`:
   ```bash
   git fetch origin
   git branch -r | grep "ralph/${ISSUE_KEY,,}"
   ```
2. **Switch to the existing branch** (do NOT create a new one):
   ```bash
   git checkout "ralph/${ISSUE_KEY,,}"
   git pull origin "ralph/${ISSUE_KEY,,}"
   ```
3. **Find the existing PR** via the Azure DevOps REST API:
   ```bash
   ADO_ORG="KenticoCustomerSuccess"
   ADO_PROJECT="CustomerEducation"
   ADO_REPO="kentico-docs-autocomplete-vscode"

   curl -s --http1.1 \
     -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
     "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests?searchCriteria.sourceRefName=refs/heads/ralph/${ISSUE_KEY,,}&api-version=7.1"
   ```
4. **Read ALL PR review threads** to understand inline feedback:
   ```bash
   curl -s --http1.1 \
     -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
     "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests/<PR_ID>/threads?api-version=7.1"
   ```

### Revision Phase 3: Implement Fixes

Work directly on the existing branch. This is a single-agent workflow — no sub-agent delegation.

1. Review the PR feedback threads and JIRA comments to build a clear list of what needs changing
2. Optionally **delegate analysis to `ralph-analyst`** if the feedback requires understanding unfamiliar parts of the codebase
3. Make the requested changes — fix specific issues raised, do NOT restart from scratch
4. Validate with `npm run build` and `npm run lint` after changes
5. Run `npm run test:xvfb` — if tests pass, great. If display errors persist, proceed with build+lint passing

### Revision Phase 4: Commit, Push & Respond to PR

1. Stage and commit changes:
   ```bash
   git add -A
   git commit -m "ralph/${ISSUE_KEY,,}: address review feedback"
   ```
2. Push to the **existing branch** (not a new one):
   ```bash
   git push origin "ralph/${ISSUE_KEY,,}"
   ```
3. **Respond to PR review threads** — for each comment thread that you addressed, post a reply:
   ```bash
   python3 -c "
   import json
   data = {'content': 'Fixed — <brief explanation>', 'parentCommentId': 0, 'commentType': 1}
   print(json.dumps(data))
   " > /tmp/thread_reply.json

   curl -s --http1.1 -X POST \
     -H "Content-Type: application/json" \
     -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
     "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests/<PR_ID>/threads/<THREAD_ID>/comments?api-version=7.1" \
     -d @/tmp/thread_reply.json
   ```

### Revision Phase 5: Update Handoff & Report

1. **Create an updated `handoff.md`** — add a "Revision" section at the top documenting what feedback was addressed and what changed
2. **Attach the updated handoff** to the JIRA issue:
   ```bash
   curl -s -u "${JIRA_EMAIL}:${JIRA_PAT}" \
     -H "X-Atlassian-Token: no-check" \
     -X POST "${JIRA_API}/issue/${ISSUE_KEY}/attachments" \
     -F "file=@handoff.md"
   ```
3. **Post a completion comment** on the JIRA issue summarizing revision changes, linking to the PR, and referencing the updated handoff

### Revision Phase 6: Exit

Output the standard result block:

```
===RALPH_RESULT_START===
STATUS: <completed|partial|blocked>
PR_URL: <full ADO PR URL>
SUMMARY: <one-line description of revision changes>
===RALPH_RESULT_END===
```
