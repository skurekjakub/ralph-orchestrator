# Template Variables

All variables listed below are available in `.agent.md` Liquid templates via `{{ variableName }}` interpolation and `{% if variableName %}` conditionals.

Templates are rendered JIT before each task by the `AgentTemplateRenderer`. Output goes to `profiles/<id>/.build/` and is mounted read-only into the container.

## Liquid Syntax

Templates use [LiquidJS](https://liquidjs.com/) with `.md` file extension for partials.

### Standard Tags

| Syntax                                   | Description                                            |
| ---------------------------------------- | ------------------------------------------------------ |
| `{{ variable }}`                         | Output a variable value                                |
| `{% if condition %}...{% endif %}`       | Conditional block                                      |
| `{% render 'partial-name' %}`            | Include a shared partial from `shared/agent-includes/` |
| `{% for item in array %}...{% endfor %}` | Loop over an array                                     |

### Custom Tags

| Syntax                                    | Description                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `{% section "name" %}...{% endsection %}` | Wraps content in `<name>...</name>` XML boundaries. Provides structural delimiters for LLM prompt sections |

### Partial Resolution

`{% render 'name' %}` resolves to `shared/agent-includes/name.md`. Subdirectories are supported:

```liquid
{% render 'personality/ralph' %}        → shared/agent-includes/personality/ralph.md
{% render 'ralph-docs/workflow' %}      → shared/agent-includes/ralph-docs/workflow.md
```

Partials run in an **isolated scope** but receive all template variables as Liquid globals.

## Profile Metadata

| Variable         | Type       | Example                                         | Description                                                                                                                          |
| ---------------- | ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `profileId`      | `string`   | `"ralph-docs"`                                  | Profile directory name                                                                                                               |
| `repo`           | `string`   | `"/home/user/repositories/kentico-docs-jekyll"` | Absolute path to the target repo on the host (`profile.json` `repo`, `~` expanded). Inside the container the repo is at `/workspace` |
| `targetRepoPath` | `string`   | `"/home/user/repositories/kentico-docs-jekyll"` | Alias for `repo` (useful in `mode: "local"` stages, which run in the orchestrator repo)                                              |
| `cli`            | `string`   | `"copilot"`                                     | CLI type: `"copilot"` or `"claude"`                                                                                                  |
| `model`          | `string`   | `"claude-opus-4.6"`                             | Model override. Empty string = CLI default                                                                                           |
| `agentName`      | `string`   | `"ralph.ralph"`                                 | Raw CLI agent name                                                                                                                   |
| `displayName`    | `string`   | `"ralph"`                                       | Human-friendly name (`ralph.` prefix stripped)                                                                                       |
| `mcpServers`     | `string[]` | `["jira-kentico", "ado"]`                       | MCP servers deployed for this profile                                                                                                |
| `skills`         | `string[]` | `["git-workflow"]`                              | Skill folder names available to this stage                                                                                           |

## Work Item Data

| Variable          | Type       | Example                          | Description                                                               |
| ----------------- | ---------- | -------------------------------- | ------------------------------------------------------------------------- |
| `taskId`          | `string`   | `"DOC-3143"`                     | JIRA issue key                                                            |
| `taskTitle`       | `string`   | `"Document custom modules"`      | Issue summary                                                             |
| `taskStatus`      | `string`   | `"To Do"`                        | Current JIRA workflow status                                              |
| `taskType`        | `string`   | `"Task"`                         | Issue type. Empty string if unavailable                                   |
| `taskPriority`    | `string`   | `"High"`                         | Priority. Empty string if unavailable                                     |
| `taskLabels`      | `string[]` | `["xperience"]`                  | Labels attached to the issue                                              |
| `taskComponents`  | `string[]` | `["Documentation"]`              | Component names                                                           |
| `taskProject`     | `string`   | `"DOC"`                          | Project key                                                               |
| `taskDescription` | `string`   | _(normalized text)_              | Plain-text issue description. Normalized and treated as untrusted content |
| `taskCreated`     | `string`   | `"2026-01-15T10:30:00.000+0000"` | ISO-8601 creation timestamp                                               |
| `taskUpdated`     | `string`   | `"2026-02-20T14:00:00.000+0000"` | ISO-8601 last-update timestamp. Empty string if unavailable               |

## Trigger & Runtime Metadata

| Variable             | Type                     | Example                                | Description                                                                                                                                    |
| -------------------- | ------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `commentTrigger`     | `string`                 | `"@Ralph"`                             | The trigger string that matched this variant                                                                                                   |
| `triggerParams`      | `Record<string, string>` | `{ codesamples: "true" }`              | Parsed parameters from the trigger comment. See [Trigger Parameters](trigger-parameters.md)                                                    |
| `isRevision`         | `boolean`                | `false`                                | `true` when the issue status matches `revisionStatuses` in the variant config                                                                  |
| `prUrl`              | `string`                 | `"https://dev.azure.com/.../pull/123"` | PR URL from a previous run (extracted from comments). Empty string if none                                                                     |
| `ralphchivesEnabled` | `boolean`                | `true`                                 | Whether Ralphchives knowledge base is enabled globally                                                                                         |
| `artifactDir`        | `string`                 | `".ralph/tasks/DOC-3143/artifacts"`    | Relative subagent artifact root. Resolves under `/workspace` in container stages and under the orchestrator repo root in local and hook stages |

## Pipeline Stage Context

| Variable             | Type       | Example       | Description                                                |
| -------------------- | ---------- | ------------- | ---------------------------------------------------------- |
| `stageRole`          | `string`   | `"primary"`   | Role identifier for the current stage                      |
| `stageMode`          | `string`   | `"container"` | Execution mode: `"container"` or `"local"`                 |
| `stageIndex`         | `number`   | `0`           | 0-based index of the current stage                         |
| `stageCount`         | `number`   | `2`           | Total stages in the pipeline                               |
| `isFirstStage`       | `boolean`  | `true`        | `true` when `stageIndex === 0`                             |
| `isLastStage`        | `boolean`  | `false`       | `true` when this is the final stage                        |
| `previousStageRoles` | `string[]` | `["writer"]`  | Roles of previously completed stages. Empty on first stage |

## Post-Task Hook Context

These variables are populated only for post-task hook stages. They are empty/default for main pipeline stages. All standard variables above (profile metadata, work item data, trigger metadata, stage context) are also available in hook stages.

| Variable             | Type                     | Example                                           | Description                                 |
| -------------------- | ------------------------ | ------------------------------------------------- | ------------------------------------------- |
| `hook.taskOutputDir` | `string`                 | `/path/to/DOC-3143-1709000000/`                   | Absolute path to the task's log directory   |
| `hook.collectedLogs` | `Record<string, string>` | `{ audit: "/path/audit.jsonl" }`                  | Map of log file IDs to their absolute paths |
| `hook.name`          | `string`                 | `"run-analysis"`                                  | Name of the current post-task hook          |
| `hook.outputDir`     | `string`                 | `/path/to/DOC-3143-1709000000/hooks/run-analysis` | Hook-specific output directory              |
