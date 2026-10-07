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

| Variable         | Type       | Example                                                                  | Description                                                                                                                                                                                                                                                                    |
| ---------------- | ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `profileId`      | `string`   | `"ralph-docs"`                                                           | Profile directory name                                                                                                                                                                                                                                                         |
| `repo`           | `string`   | `"/home/user/ralph-orchestrator/cache/workspaces/DOC-123-1767225600000"` | Absolute host path of the task's workspace, its own clone of `profile.json` `repoUrl` on the task branch. Inside the container it is `/workspace`                                                                                                                              |
| `targetRepoPath` | `string`   | _(same as `repo`)_                                                       | Alias for `repo` (useful in `mode: "local"` stages, which run on the host in a workspace of their own)                                                                                                                                                                         |
| `cli`            | `string`   | `"claude"`                                                               | CLI the current stage runs: `"copilot"` or `"claude"`                                                                                                                                                                                                                          |
| `cliTools`       | `object`   | `{ subagent: "Agent", … }`                                               | The stage CLI's tool names: `subagent`, `skill`, `shell`, `read`, `askUser` (Claude Code `Agent`… / Copilot `task`…)                                                                                                                                                           |
| `model`          | `string`   | `"claude-opus-4.6"`                                                      | The stage's model override. Empty string = the agent definition decides                                                                                                                                                                                                        |
| `agentName`      | `string`   | `"ralph.ralph"`                                                          | File id of the current stage's root agent. Use `self.name` for the rendering agent's own name                                                                                                                                                                                  |
| `displayName`    | `string`   | `"ralph"`                                                                | `agentName` with the `ralph.` prefix stripped                                                                                                                                                                                                                                  |
| `self`           | `object`   | `{ name: "malph-reviewer-opus", … }`                                     | Agent templates and their partials only: the rendering agent's `name`, `fileId`, `isStageRoot`, `subagents`, the `model` the stage's CLI runs it on (empty when the CLI or the parent decides) and its `subagentModels` by name (`self.subagentModels["malph-reviewer-opus"]`) |
| `mcpServers`     | `string[]` | `["jira-kentico", "ado"]`                                                | MCP servers deployed for this profile                                                                                                                                                                                                                                          |
| `skills`         | `string[]` | `["git-workflow"]`                                                       | Skill folder names available to this stage                                                                                                                                                                                                                                     |

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

| Variable             | Type                     | Example                                | Description                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commentTrigger`     | `string`                 | `"@Ralph"`                             | The trigger string that matched this variant                                                                                                                                                                                                                                     |
| `triggerParams`      | `Record<string, string>` | `{ codesamples: "true" }`              | Parsed parameters from the trigger comment. See [Trigger Parameters](trigger-parameters.md)                                                                                                                                                                                      |
| `isRevision`         | `boolean`                | `false`                                | `true` when the issue status matches `revisionStatuses` in the variant config                                                                                                                                                                                                    |
| `prUrl`              | `string`                 | `"https://dev.azure.com/.../pull/123"` | PR URL from a previous run (extracted from comments). Empty string if none                                                                                                                                                                                                       |
| `ralphchivesEnabled` | `boolean`                | `true`                                 | Whether Ralphchives knowledge base is enabled globally                                                                                                                                                                                                                           |
| `artifactDir`        | `string`                 | `".ralph/tasks/DOC-3143/artifacts"`    | Subagent artifact root. Relative to `/workspace` in container stages; absolute on the host in local stages: the container stages' artifacts in the task's workspace for a variant stage, `<taskOutputDir>/hooks/<hook>/artifacts` (shared by the hook's stages) for a hook stage |

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

| Variable               | Type                     | Example                                           | Description                                                                                      |
| ---------------------- | ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `hook.taskOutputDir`   | `string`                 | `/path/to/DOC-3143-1709000000/`                   | Absolute path to the task's log directory                                                        |
| `hook.collectedLogs`   | `Record<string, string>` | `{ audit: "/path/audit.jsonl" }`                  | Map of log file IDs to their absolute paths                                                      |
| `hook.name`            | `string`                 | `"run-analysis"`                                  | Name of the current post-task hook                                                               |
| `hook.outputDir`       | `string`                 | `/path/to/DOC-3143-1709000000/hooks/run-analysis` | Hook-specific output directory                                                                   |
| `hook.cli`             | `string`                 | `"claude"`                                        | CLI the task's first stage ran (`claude` or `copilot`): the run the hook analyses                |
| `hook.orchestratorDir` | `string`                 | `/srv/ralph-orchestrator`                         | Absolute path of the orchestrator checkout, whose `profiles/` and `shared/` hook stages may read |
