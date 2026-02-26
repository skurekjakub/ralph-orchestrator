---
name: ralph-ado-pr-workflow
description: "Error handling and PR description format for Azure DevOps pull requests. Use this skill whenever creating a pull request, writing a PR description, handling ADO API errors, or preparing changes for review in Azure DevOps — even if the task doesn't explicitly mention PRs, since most documentation tasks end with a PR."
---

# ADO Pull Request Workflow Skill

Instructions for creating and managing pull requests in Azure DevOps for the target repository.

## Azure DevOps

The target repository is hosted in Azure DevOps. Use the **ado MCP server** for all pull request operations.

### Error handling

- If a tool returns an authorization error (401/403) — likely an expired PAT. Note it in the handoff and set the PR URL to "none" in the result block.
- If a tool returns a conflict or validation error — check the request parameters and retry once.
- Other unrecoverable errors — note in the handoff but do not block the workflow.

## Pull Request Description Format

### Template

```markdown
## <JIRA-KEY>: <One-line summary of the change>

Link: <JIRA issue link>

### Changes
- <File path> — <what was changed and why>
- <File path> — <what was changed and why>

### Context
<Brief explanation of why these changes were made — reference the JIRA issue requirements>

### Review Notes
- <Anything the reviewer should pay attention to>
- <Decisions made autonomously and their rationale>
- <Known limitations or trade-offs>
```
