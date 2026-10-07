# Agent Templates & Parameterization

How agent templates are authored, rendered, and parameterized at runtime. The operator-facing variable reference is [docs/user-guide/template-variables.md](../user-guide/template-variables.md).

## Template Locations

```
profiles/<id>/agents/*.agent.md      — Profile-specific agent templates (canonical frontmatter + Liquid body)
profiles/<id>/.build/<cli>/agents/   — Rendered output of container stages per CLI (gitignored, mounted read-only)
shared/agent-includes/               — Shared Liquid partials
  ├── ado-api.md                     — ADO MCP tool reference
  ├── ado-pr-format.md               — PR description template
  ├── agent-as-function-contract.md  — Subagent artifact contract
  ├── headless-contract.md           — Never ask questions or wait for human input
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

A `mode: "local"` stage renders into its own workspace on the host instead (see [multistage-pipelines.md](multistage-pipelines.md#local-mode-local)): Claude Code agents into the stage's `home/agents/`, Copilot agents into its `work/.github/agents/`.

## Agent Frontmatter

Every template carries one canonical, CLI-neutral frontmatter (`agentFrontmatterSchema` in `src/cli/agent-definition.ts`). `AgentCatalog` (`src/cli/agent-catalog.ts`) parses a profile's templates and holds the `subagents` graph. Unknown keys are rejected, including the Copilot agent-file keys `agents` (use `subagents`) and `user-invocable`.

| Key             | Required | Meaning                                                                                                                                                                                                                                  |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | yes      | Lowercase words joined by hyphens, unique in the profile. Claude Code resolves `--agent` and `Agent(...)` by it; it names the agent's artifact directory (`self.name`)                                                                   |
| `description`   | yes      | Non-empty                                                                                                                                                                                                                                |
| `model`         | no       | Claude Code alias (`opus`, `sonnet`, `haiku`, `fable`, with an optional `[1m]`) or full hyphenated id, or `inherit` for a subagent that runs its parent's model. A stage root must not `inherit`. Omitted: the CLI or the parent decides |
| `subagents`     | no       | Names of the agents this agent may spawn; each must be an agent of the profile, and the graph must have no cycles                                                                                                                        |
| `tools`         | no       | Claude Code built-in tools the agent may use (`Read`, `Write`, `Edit`, `Bash`, `Skill`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `WebFetch`, `WebSearch`). Omitted: every tool Ralph grants                                    |
| `skills`        | no       | Skills the agent starts with on Claude Code. Each must be one of its stage's `skills`                                                                                                                                                    |
| `effort`        | no       | Claude Code reasoning effort                                                                                                                                                                                                             |
| `maxTurns`      | no       | Claude Code turn cap for one run of the agent                                                                                                                                                                                            |
| `runtimes`      | no       | CLIs the agent can run on; default both `claude` and `copilot`. Every agent a stage can reach must run on the stage's CLI                                                                                                                |
| `copilot.model` | no       | Copilot model id used instead of the mapping of `model`                                                                                                                                                                                  |

Each CLI's runtime has an agent file writer that translates the canonical form:

- **Claude Code** (`ClaudeAgentWriter`) writes `<name>.md`. `tools` becomes the built-in list (the agent's own, or all of them), an `Agent(...)` grant, and the allowlisted tools of the variant's MCP servers as `mcp__<server>__<tool>` (`mcp__<server>` for a server whose manifest lists no `tools`). Claude Code checks a nested spawn against the stage root's grant, so the root's `Agent(...)` names every agent reachable in the stage; a subagent's names its own `subagents`, and a leaf gets none. A subagent's `skills` stay in its frontmatter, where Claude Code preloads them. A stage root's `skills` become a `<startup-skills>` instruction at the top of its body to load each one with the `Skill` tool, so its `tools` must include `Skill`. `copilot` is dropped.
- **Copilot CLI** (`CopilotAgentWriter`) writes `<fileId>.agent.md`. `subagents` becomes `agents`, the model becomes `copilot.model` or the Copilot equivalent of `model` (`inherit` leaves it out), every agent gets `user-invocable: false`, and `tools`, `skills`, `effort` and `maxTurns` are dropped.

`npm run validate` checks all of this per stage (`src/validate/agents.ts`), and `npm run prompt:vis` prints the agent → include → skill graph.

## Rendering Pipeline

1. `ProfileSetupService.prepareForTask()` (called from `TaskRunner`) calls `buildTemplateContext()` with the `TaskContext` (profile, work item, revision flag, trigger params) for every container stage before the containers start; `prepareForStage()` repeats this before each stage of a multi-stage pipeline, each local stage and each post-task hook stage, with stage overrides and the stage's workspace
2. `buildTemplateContext()` produces a `TemplateContext` — a typed object with all template variables
3. `AgentTemplateRenderer.render()` takes the profile's `AgentCatalog` (canonical frontmatter, `subagents` graph) from `AgentCatalogProvider` and creates a LiquidJS engine with `shared/agent-includes/` as the root
4. Each agent reachable from the stage's root agent has its body rendered with the context plus its own `self` — `{% render %}`, `{% if %}`, `{% section %}` tags are resolved
5. The agent file writer of the stage CLI's runtime (`ICliRuntime.agentWriter`) serialises each agent; the output is synced in place into the stage workspace's agents directory. For a container stage that is `profiles/<id>/.build/<cli>/agents/`: Claude Code sees the whole directory, mounted read-only at `/workspace/.ralph/claude/agents/`; Copilot sees one read-only mount per agent file in `/workspace/.github/agents/`, so a re-render keeps every file an earlier stage mounted

The Liquid engine uses `extname: ".md"` — partials are referenced without extensions (e.g. `{% render 'personality/ralph' %}` resolves to `shared/agent-includes/personality/ralph.md`).

Context variables are passed as **Liquid globals**, not just `parseAndRender` scope. This is critical because `{% render %}` creates an isolated scope — globals are the only way to make variables like `{{ taskId }}` accessible inside partials.

## Template Variable Reference

All variables are available in templates via `{{ variableName }}` interpolation and `{% if variableName %}` conditionals.

### Profile Metadata

| Variable         | Type       | Example                                                                  | Description                                                                                                                                                                                                                       |
| ---------------- | ---------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profileId`      | `string`   | `"ralph-docs"`                                                           | Profile directory name                                                                                                                                                                                                            |
| `repo`           | `string`   | `"/home/user/ralph-orchestrator/cache/workspaces/DOC-123-1767225600000"` | Absolute host path of the task's workspace                                                                                                                                                                                        |
| `targetRepoPath` | `string`   | _(same as `repo`)_                                                       | Alias for `repo`                                                                                                                                                                                                                  |
| `cli`            | `string`   | `"claude"`                                                               | CLI the current stage runs (`claude` or `copilot`)                                                                                                                                                                                |
| `cliTools`       | `object`   | `{ subagent: "Agent", … }`                                               | The stage CLI's names for the tools prose mentions: `subagent`, `skill`, `shell`, `read`, `askUser`                                                                                                                               |
| `model`          | `string`   | `"opus"`                                                                 | The stage's model, else the variant's or profile's; empty string when the agent definition decides                                                                                                                                |
| `agentName`      | `string`   | `"ralph.ralph"`                                                          | File id of the current stage's root agent                                                                                                                                                                                         |
| `displayName`    | `string`   | `"ralph"`                                                                | `agentName` with the `ralph.` prefix stripped                                                                                                                                                                                     |
| `mcpServers`     | `string[]` | `["jira-kentico", "ado"]`                                                | MCP servers available to this profile                                                                                                                                                                                             |
| `self`           | `object`   | `{ name: "ralph", fileId: "ralph.ralph", … }`                            | The agent being rendered: `name`, `fileId`, `isStageRoot`, `subagents`, `model` (what the stage's CLI runs it on; empty when the CLI or the parent decides) and `subagentModels` by name. Agent templates and their partials only |

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

Common section names: `agent-identity`, `artifact-contract`, `orchestration`, `security`, `workflow`, `error-handling`, `ordering-constraints`, `known-failure-patterns`, `codesamples`, `source-branch`, `scope-restriction`.

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
2. Run `npm run validate` to check the frontmatter and each stage's agent graph
3. Run `npx vitest run tests/container/template-integration.test.ts tests/container/template-context-lint.test.ts`: they render the shipped templates for each CLI and fail on Liquid errors, unresolved tags and undeclared variables
4. To preview the rendered output with specific context, follow `template-integration.test.ts`: build an `AgentCatalog`, a context with `makeTemplateContext()` (`tests/helpers/factories.ts`) and call `renderAgents()` into a temp directory
5. Check `profiles/<id>/.build/<cli>/agents/` for a container stage's rendered output after a task run, or the stage workspace of a host stage (`<outputDir>/stages/<role>/` or `<outputDir>/hooks/<hook>/<role>/`)
