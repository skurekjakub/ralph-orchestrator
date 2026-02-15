## Azure DevOps REST API

The target repository is hosted in Azure DevOps. Use the REST API for pull request operations. The `ADO_PAT_DOCS` environment variable contains the PAT.

### ADO API rules

- Always use `--http1.1` — ADO can fail with HTTP/2 protocol errors
- Always generate JSON bodies with Python to avoid bash escaping issues with backticks/quotes
- Use `printf` for base64 encoding (not `echo -n` which is inconsistent across shells)
- PR descriptions must NOT contain backticks, unescaped quotes, or other shell-special characters
- **Do NOT use MCP tools** for any Azure DevOps operations — use the REST API with `curl`

### Environment

| Variable | Value |
|---|---|
| `ADO_PAT_DOCS` | Personal access token |
| ADO org | `KenticoCustomerSuccess` |
| ADO project | `CustomerEducation` |

The repo name and default branch vary per profile — use the values matching your current project.

### Auth header

```bash
-H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)"
```

### Creating a pull request

```bash
ADO_ORG="KenticoCustomerSuccess"
ADO_PROJECT="CustomerEducation"
ADO_REPO="<repo-name>"  # e.g. kentico-docs-jekyll
API_VERSION="7.1"

python3 -c "
import json
data = {
    'sourceRefName': 'refs/heads/<branch>',
    'targetRefName': 'refs/heads/<default-branch>',
    'title': '<title>',
    'description': '<description — NO backticks>',
    'isDraft': True
}
print(json.dumps(data))
" > /tmp/pr_body.json

PR_RESPONSE=$(curl -s --http1.1 -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
  "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests?api-version=${API_VERSION}" \
  -d @/tmp/pr_body.json)
```

### Posting a comment on a pull request

Use this to post thread comments on an existing PR (e.g., to respond to review feedback or introduce yourself):

```bash
PR_ID="<pull-request-id>"

python3 -c "
import json
data = {
    'comments': [{'content': '<comment text — wiki/markdown>', 'parentCommentId': 0, 'commentType': 1}],
    'status': 1
}
print(json.dumps(data))
" > /tmp/pr_comment.json

curl -s --http1.1 -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
  "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests/${PR_ID}/threads?api-version=${API_VERSION}" \
  -d @/tmp/pr_comment.json
```

### Listing PR threads (for reading review feedback)

```bash
curl -s --http1.1 \
  -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
  "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests/${PR_ID}/threads?api-version=${API_VERSION}"
```

### Error handling

- If the API returns an authorization error (401/403) — likely an expired PAT. Note it in the handoff and set the PR URL to "none" in the result block.
- If the API returns a conflict or validation error — check the request body for issues and retry once.
- Other unrecoverable errors — note in the handoff but do not block the workflow.
