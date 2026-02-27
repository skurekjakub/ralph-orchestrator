# ADO MCP Server — Configuration

Azure DevOps pull request management — create PRs, manage review threads, push progress commits.

**Sidecar port:** 9101

## Environment Variables

### Required (orchestrator `.env`)

| Variable | Description |
|---|---|
| `ADO_PAT` | Azure DevOps personal access token with Code (Read & Write) scope |

These are set in the orchestrator's `.env` file and injected into the sidecar at startup via `requiredEnv` in the manifest.

### Required (profile `env` block)

| Variable | Description | Macro support |
|---|---|---|
| `ADO_PROJECT` | ADO project name (e.g. `CustomerEducation`) | Static value |
| `ADO_REPO` | ADO repository name or GUID | Static value |

### Optional (profile `env` block)

| Variable | Description | Macro support |
|---|---|---|
| `TASK_BRANCH` | Source branch for the task (e.g. `refs/heads/feature`) | `$task.branch` |

When `ADO_PROJECT`, `ADO_REPO`, or `TASK_BRANCH` are set, the corresponding parameters are removed from tool input schemas — simplifying the agent's interface by pre-scoping tools to the task context.

## Profile Wiring

Add to the `mcpServers` array in `profile.json`:

```json
{
  "name": "ado",
  "env": {
    "ADO_PROJECT": "CustomerEducation",
    "ADO_REPO": "kentico-docs-jekyll",
    "TASK_BRANCH": "$task.branch"
  }
}
```

The `$task.branch` macro resolves to the task's branch name at runtime (built from the JIRA issue key via `slugifyBranch()`).

## Tools

### `ado_create_pull_request`

Create a new pull request. Source branch name must include the `refs/heads/` prefix. Target branch defaults to `main`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Pull request title |
| `description` | string | no | Pull request description (max 4000 chars) |
| `isDraft` | boolean | no | Create as draft PR |
| `project` | string | conditional | ADO project name — hidden when `ADO_PROJECT` is set |
| `repositoryId` | string | conditional | Repository name or GUID — hidden when `ADO_REPO` is set |
| `sourceRefName` | string | conditional | Source branch — hidden when `TASK_BRANCH` is set |

### `ado_list_pull_requests`

List pull requests in a repository. Filter by status, source branch, or target branch.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | enum | no | `active` \| `completed` \| `abandoned` \| `all` (default: `active`) |
| `targetRefName` | string | no | Filter by target branch |
| `top` | number | no | Max results (default: 25) |
| `project` | string | conditional | ADO project name — hidden when `ADO_PROJECT` is set |
| `repositoryId` | string | conditional | Repository name or GUID — hidden when `ADO_REPO` is set |
| `sourceRefName` | string | conditional | Filter by source branch — hidden when `TASK_BRANCH` is set |

### `ado_list_pull_request_threads`

List comment threads on a pull request. Returns thread status, file context, and all comments with authors.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pullRequestId` | number | yes | Pull request ID |
| `project` | string | conditional | ADO project name — hidden when `ADO_PROJECT` is set |
| `repositoryId` | string | conditional | Repository name or GUID — hidden when `ADO_REPO` is set |

### `ado_create_pull_request_thread`

Create a new comment thread on a pull request. Can be a general comment or a file-level comment with line context.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pullRequestId` | number | yes | Pull request ID |
| `content` | string | yes | Comment text (markdown supported) |
| `status` | enum | no | `active` \| `fixed` \| `wontFix` \| `closed` \| `byDesign` \| `pending` (default: `active`) |
| `filePath` | string | no | File path for file-level comment (e.g. `/src/file.ts`) |
| `startLine` | number | no | Start line number |
| `endLine` | number | no | End line number |
| `project` | string | conditional | ADO project name — hidden when `ADO_PROJECT` is set |
| `repositoryId` | string | conditional | Repository name or GUID — hidden when `ADO_REPO` is set |

### `ado_reply_to_comment`

Reply to an existing comment thread on a pull request.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pullRequestId` | number | yes | Pull request ID |
| `threadId` | number | yes | Thread ID to reply to |
| `content` | string | yes | Reply text (markdown supported) |
| `project` | string | conditional | ADO project name — hidden when `ADO_PROJECT` is set |
| `repositoryId` | string | conditional | Repository name or GUID — hidden when `ADO_REPO` is set |

### `ado_push_progress`

Stage all changes, commit, and push to the task branch. Use this to save work-in-progress to the remote repository.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | string | yes | Commit message |
