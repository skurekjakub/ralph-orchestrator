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

### Creating a pull request

https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/create?view=azure-devops-rest-7.1&tabs=HTTP

```bash
ADO_ORG="KenticoCustomerSuccess"
ADO_PROJECT="CustomerEducation"
ADO_REPO="<repo-name>"  # e.g. kentico-docs-jekyll
API_VERSION="7.1"

PR_RESPONSE=$(curl -s --http1.1 -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
  "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests?api-version=${API_VERSION}" \
  -d @/tmp/pr_body.json)
```

### Posting a comment on a pull request

Use this to post thread comments on an existing PR (e.g., to respond to review feedback). If need details read https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads?view=azure-devops-rest-7.1

```bash
curl -s --http1.1 -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
  "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests/${PR_ID}/threads?api-version=${API_VERSION}" \
  -d @/tmp/pr_comment.json
```

### File-level comment (targeting a specific file and line range)

To post a comment on a specific file and line range in a PR, add a `threadContext` to the thread body.
Generate the JSON with Python to avoid escaping issues.

```bash
curl -s --http1.1 -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(printf ":%s" "$ADO_PAT_DOCS" | base64 -w 0)" \
  "https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/git/repositories/${ADO_REPO}/pullrequests/${PR_ID}/threads?api-version=${API_VERSION}" \
  -d {contents}
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
