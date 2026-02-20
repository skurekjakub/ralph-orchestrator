## Azure DevOps

The target repository is hosted in Azure DevOps. Use the **ado MCP server** for all pull request operations.

### Available tools

- `ado_create_pull_request` — Create a new pull request
- `ado_list_pull_requests` — List pull requests for a repository (filter by source branch, status, etc.)
- `ado_list_pull_request_threads` — List PR review threads (for reading feedback)
- `ado_create_pull_request_thread` — Post a new comment thread on a PR (general or file-level with thread context)
- `ado_reply_to_comment` — Reply to an existing comment in a PR thread (requires threadId from `ado_list_pull_request_threads`)

### Error handling

- If a tool returns an authorization error (401/403) — likely an expired PAT. Note it in the handoff and set the PR URL to "none" in the result block.
- If a tool returns a conflict or validation error — check the request parameters and retry once.
- Other unrecoverable errors — note in the handoff but do not block the workflow.
