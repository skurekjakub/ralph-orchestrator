## Azure DevOps

The target repository is hosted in Azure DevOps. Use the **ado MCP server** for all pull request operations.

### Error handling

- If a tool returns an authorization error (401/403) — likely an expired PAT. Note it in the handoff and set the PR URL to "none" in the result block.
- If a tool returns a conflict or validation error — check the request parameters and retry once.
- Other unrecoverable errors — note in the handoff but do not block the workflow.
