---
name: ralph-ado-pr-workflow
description: "Use this skill whenever creating a pull request, writing a PR description."
---

# ADO Pull Request Workflow Skill

Instructions for creating and managing pull requests in Azure DevOps for the target repository.

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
