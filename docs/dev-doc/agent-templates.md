# Agent Templates & Parameterization

How agent templates are authored, rendered, and parameterized at runtime. The operator-facing variable reference is [docs/user-guide/template-variables.md](../user-guide/template-variables.md).

## Template Locations

```
profiles/<id>/agents/*.agent.md      — Profile-specific agent templates (Liquid source)
profiles/<id>/.build/<cli>/agents/   — Rendered output per CLI (gitignored, mounted into container)
shared/agent-includes/               — Shared Liquid partials
  ├── ado-api.md                     — ADO MCP tool reference
  ├── ado-pr-format.md               — PR description template
  ├── agent-as-function-contract.md  — Subagent artifact contract
  ├── prompt-security.md             — Prompt injection defense rules
  ├── ralphchives.md                 — Ralphchives usage
  ├── rules.md                       — Shared agent rules
  ├── source-references.md           — Xperience source browser URL format
  ├── personality/                   — Agent personality partials
  │   ├── ralph.md
  │   └── malph.md
  ├── post-hooks/                    — Scientist subagent bodies
  ├── ralph-docs/                    — ralph-docs workflow partials
  │   ├── ralph-standard-workflow.md
  │   ├── ralph-revision-workflow.md
  │   ├── ralph-codesamples.md
  │   └── ...
  └── ralph-vscode/                  — ralph-vscode workflow partials
```

## Rendering Pipeline

1. `ProfileSetupService.prepareForTask()` (called from `TaskRunner`) calls `buildTemplateContext()` with the `TaskContext` (profile, work item, revision flag, trigger params); `prepareForStage()` repeats this before each pipeline stage with stage overrides
2. `buildTemplateContext()` produces a `TemplateContext` — a typed object with all template variables
3. `AgentTemplateRenderer.render()` takes the profile's `AgentCatalog` (canonical frontmatter, `subagents` graph) from `AgentCatalogProvider` and creates a LiquidJS engine with `shared/agent-includes/` as the root
4. Each agent reachable from the stage's root agent has its body rendered with the context plus its own `self` — `{% render %}`, `{% if %}`, `{% section %}` tags are resolved
5. The agent file writer of the stage CLI's runtime (`ICliRuntime.agentWriter`) serialises each agent; the output is synced into `profiles/<id>/.build/<cli>/agents/` and mounted read-only into the container

The Liquid engine uses `extname: ".md"` — partials are referenced without extensions (e.g. `{% render 'personality/ralph' %}` resolves to `shared/agent-includes/personality/ralph.md`).

Context variables are passed as **Liquid globals**, not just `parseAndRender` scope. This is critical because `{% render %}` creates an isolated scope — globals are the only way to make variables like `{{ taskId }}` accessible inside partials.

## Template Variable Reference

All variables are available in templates via `{{ variableName }}` interpolation and `{% if variableName %}` conditionals.

### Profile Metadata

| Variable         | Type       | Example                                                                  | Description                                  |
| ---------------- | ---------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `profileId`      | `string`   | `"ralph-docs"`                                                           | Profile directory name                       |
| `repo`           | `string`   | `"/home/user/ralph-orchestrator/cache/workspaces/DOC-123-1767225600000"` | Absolute host path of the task's workspace   |
| `targetRepoPath` | `string`   | _(same as `repo`)_                                                       | Alias for `repo`                             |
| `cli`            | `string`   | `"copilot"`                                                              | CLI type (`copilot` or `claude`)             |
| `model`          | `string`   | `"claude-opus-4.6"`                                                      | Model override, empty string for CLI default |
| `agentName`      | `string`   | `"ralph.ralph"`                                                          | Raw CLI agent name                           |
| `displayName`    | `string`   | `"ralph"`                                                                | Human-friendly name (prefix stripped)        |
| `mcpServers`     | `string[]` | `["jira-kentico", "ado"]`                                                | MCP servers available to this profile        |

### Task Data

| Variable          | Type       | Example                          | Description                                |
| ----------------- | ---------- | -------------------------------- | ------------------------------------------ |
| `taskId`          | `string`   | `"DOC-3143"`                     | JIRA issue key                             |
| `taskTitle`       | `string`   | `"Document custom modules"`      | Issue title                                |
| `taskStatus`      | `string`   | `"To Do"`                        | Current JIRA workflow status               |
| `taskType`        | `string`   | `"Task"`                         | Issue type, or empty string                |
| `taskPriority`    | `string`   | `"High"`                         | Priority, or empty string                  |
| `taskLabels`      | `string[]` | `["xperience", "migration"]`     | Labels attached to the issue               |
| `taskComponents`  | `string[]` | `["Documentation"]`              | Component names                            |
| `taskProject`     | `string`   | `"DOC"`                          | Project key (derived from issue key)       |
| `taskDescription` | `string`   | _(normalized text)_              | Plain-text description (untrusted content) |
| `taskCreated`     | `string`   | `"2026-01-15T10:30:00.000+0000"` | ISO-8601 creation timestamp                |
| `taskUpdated`     | `string`   | `"2026-02-20T14:00:00.000+0000"` | ISO-8601 last-updated timestamp            |

### Trigger Metadata

| Variable         | Type                     | Example                                       | Description                                  |
| ---------------- | ------------------------ | --------------------------------------------- | -------------------------------------------- |
| `commentTrigger` | `string`                 | `"@Ralph"`                                    | The trigger string that matched this variant |
| `triggerParams`  | `Record<string, string>` | `{ codesamples: "true", branch_name: "xyz" }` | Parsed key-value map (see below)             |

### Runtime Flags

| Variable             | Type      | Description                                                                   |
| -------------------- | --------- | ----------------------------------------------------------------------------- |
| `isRevision`         | `boolean` | `true` when the issue status matches `revisionStatuses` in the variant config |
| `ralphchivesEnabled` | `boolean` | `ralphchives.enabled` from `config.json`                                      |
| `prUrl`              | `string`  | PR URL from a previous run, extracted from comments; empty string if none     |

### Skills, Artifacts, Stages and Hooks

| Variable                                                                                                      | Type       | Description                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| `skills`                                                                                                      | `string[]` | Skill names for the current stage                                                                                           |
| `artifactDir`                                                                                                 | `string`   | `.ralph/tasks/<taskId>/artifacts` in containers; absolute in host stages (see [agent-as-function.md](agent-as-function.md)) |
| `stageRole`, `stageMode`, `stageIndex`, `stageCount`, `isFirstStage`, `isLastStage`, `previousStageRoles`     | —          | Pipeline stage context (see [multistage-pipelines.md](multistage-pipelines.md))                                             |
| `hook.taskOutputDir`, `hook.collectedLogs`, `hook.name`, `hook.outputDir`, `hook.cli`, `hook.orchestratorDir` | —          | Post-task hook context; empty for main pipeline stages                                                                      |

## Trigger Parameters

Trigger parameters extend agent behavior per-invocation without changing the template. They're extracted from the JIRA comment callsign.

### Syntax

```
@Ralph(param1, param2, key=value)
```

- **Bare params** (flags): `codesamples`, `verbose`
- **Key-value params**: `branch_name=feature/new-api`, `source_branch=release/30`, `scope=src/_documentation/developers`

### Parsing

`parseTriggerParams()` in `trigger-scanner.ts` extracts the raw comma-separated strings from parentheses. `buildTriggerParams()` in `agent-includes.ts` converts them into a `Record<string, string>`:

- Bare param `"codesamples"` → `{ codesamples: "true" }`
- Key-value `"branch_name=feature/xyz"` → `{ branch_name: "feature/xyz" }`
- Values containing `=` are handled: `"config=key=value"` → `{ config: "key=value" }` (splits on first `=` only)

### Using in Templates

**Flag check** — render a section only when a bare param is present:

```liquid
{%- if triggerParams.codesamples %}
{% render 'ralph-docs/ralph-codesamples' %}
{%- endif %}
```

**Value interpolation** — use a key-value param's value:

```liquid
{%- if triggerParams.branch_name %}
Check branch: **{{ triggerParams.branch_name }}**
{%- endif %}
```

### Parameter Reference by Callsign

Trigger params are open-ended — any param can be passed in any callsign. If a param isn't recognized by the agent template, it's silently ignored (`triggerParams.unknown` is `undefined` → falsy in Liquid).

The bundled callsigns are:

| Callsign             | Agent          | Profile              |
| -------------------- | -------------- | -------------------- |
| `@Ralph`             | `ralph.ralph`  | ralph-docs (DOC, DF) |
| `@Malph`             | `ralph.malph`  | ralph-docs (DOC, DF) |
| `@RalphDev`          | `ralph.stacky` | ralph-docs (DOC, DF) |
| `@RalphAutocomplete` | `ralph.ralph`  | ralph-vscode (DOC)   |
| `@MalphAutocomplete` | `ralph.malph`  | ralph-vscode (DOC)   |

Orchestrator-level params (`source_branch`, `branch`, `skip_hooks`) and the params each agent recognizes (`codesamples`, `xpversion`, `adminui`, `branch_name`, `release_notes`, `scope`, `skip_planner`, …) are listed in [docs/user-guide/trigger-parameters.md](../user-guide/trigger-parameters.md).

Example: `@Ralph(codesamples, branch_name=feature/custom-modules, source_branch=release/30)`

### Adding New Parameters

1. No code changes needed — `triggerParams` automatically includes any param
2. Add a `{% if triggerParams.your_param %}` conditional in the template
3. For shared content, create a partial in `shared/agent-includes/` and `{% render %}` it
4. Add tests if the param affects non-template behavior (e.g. container setup)

### Limitations

- **Case-sensitive** — param names are case-sensitive in Liquid. `@Ralph(CodeSamples)` produces key `CodeSamples`, which won't match `{% if triggerParams.codesamples %}`. Users must use lowercase.
- **No commas in values** — the parser splits on commas first, so `scope=path/a,path/b` becomes two separate params (`scope=path/a` and `path/b`).
- **Empty values are truthy** — `key=` (with nothing after `=`) produces `{ key: "" }`, which is still truthy in Liquid (`{% if %}` passes). Only `nil`/`undefined` and `false` are falsy in Liquid. To check for non-empty values, use `{% if triggerParams.key != "" %}`.

## Custom Liquid Tags

### `{% section "name" %}...{% endsection %}`

Wraps content in XML boundary tags: `<name>...</name>`. Gives the LLM clear structural delimiters between prompt sections. Supports nested Liquid tags and variable interpolation.

```liquid
{% section "security" %}
{% render 'prompt-security' %}
{% endsection %}
```

Rendered output:

```xml
<security>
[rendered prompt-security content]
</security>
```

Standard section names: `agent-identity`, `api-reference`, `security`, `workflow`, `error-handling`, `review-principles`, `ordering-constraints`, `known-failure-patterns`, `codesamples`, `source-branch`, `scope-restriction`.

## Whitespace Control

Use `{%- -%}` (Liquid whitespace control) to prevent blank lines when conditionals evaluate to false:

```liquid
{%- if triggerParams.codesamples %}
{% render 'ralph-docs/ralph-codesamples' %}
{%- endif %}
```

Without the `-`, a false condition leaves a blank line in the rendered output where the `{% if %}{% endif %}` block was.

## Template Development Workflow

1. Edit the `.agent.md` source in `profiles/<id>/agents/`
2. Run `npx vitest run tests/container/agent-includes.test.ts` to validate rendering
3. To preview the rendered output with specific context, use the test pattern in `agent-includes.test.ts` — create a temp directory, copy the template, and call `resolveAgentIncludes()` with a custom context object
4. Check `profiles/<id>/.build/<cli>/agents/` for the rendered output after a task run (or manual render)
