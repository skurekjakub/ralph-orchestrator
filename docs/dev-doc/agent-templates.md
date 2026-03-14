# Agent Templates & Parameterization

How agent templates are authored, rendered, and parameterized at runtime.

For prompt architecture decisions (inline vs. deferred, ordering, sizing), see [AGENT-PROMPT-AUTHORING.md](../AGENT-PROMPT-AUTHORING.md).

## Template Locations

```
profiles/<id>/agents/*.agent.md      — Profile-specific agent templates (Liquid source)
profiles/<id>/.build/*.agent.md      — Rendered output (gitignored, mounted into container)
shared/agent-includes/               — Shared Liquid partials
  ├── ado-api.md                     — ADO MCP tool reference
  ├── ado-pr-format.md               — PR description template
  ├── prompt-security.md             — Prompt injection defense rules
  ├── source-references.md           — Xperience source browser URL format
  ├── personality/                   — Agent personality partials
  │   ├── ralph.md
  │   └── malph.md
  └── ralph-docs/                    — Profile-specific workflow partials
      ├── ralph-standard-workflow.md
      ├── ralph-revision-workflow.md
      └── ralph-codesamples.md
```

## Rendering Pipeline

1. `TaskRunner.run()` calls `buildTemplateContext()` with the profile, JIRA issue, revision flag, and trigger params
2. `buildTemplateContext()` produces a `TemplateContext` — a typed object with all template variables
3. `AgentTemplateRenderer.render()` creates a LiquidJS engine with `shared/agent-includes/` as the root and the context as globals
4. Each `.agent.md` file is parsed and rendered — `{% render %}`, `{% if %}`, `{% section %}` tags are resolved
5. Output goes to `.build/` and is mounted read-only into the container

The Liquid engine uses `extname: ".md"` — partials are referenced without extensions (e.g. `{% render 'personality/ralph' %}` resolves to `shared/agent-includes/personality/ralph.md`).

Context variables are passed as **Liquid globals**, not just `parseAndRender` scope. This is critical because `{% render %}` creates an isolated scope — globals are the only way to make variables like `{{ taskId }}` accessible inside partials.

## Template Variable Reference

All variables are available in templates via `{{ variableName }}` interpolation and `{% if variableName %}` conditionals.

### Profile Metadata

| Variable | Type | Example | Description |
|---|---|---|---|
| `profileId` | `string` | `"ralph-docs"` | Profile directory name |
| `repo` | `string` | `"/workspace"` | Absolute path to target repo in container |
| `cli` | `string` | `"copilot"` | CLI type (`copilot` or `claude`) |
| `model` | `string` | `"claude-opus-4.6"` | Model override, empty string for CLI default |
| `agentName` | `string` | `"ralph.ralph"` | Raw CLI agent name |
| `displayName` | `string` | `"ralph"` | Human-friendly name (prefix stripped) |
| `mcpServers` | `string[]` | `["jira-kentico", "ado"]` | MCP servers available to this profile |

### Task Data

| Variable | Type | Example | Description |
|---|---|---|---|
| `taskId` | `string` | `"DOC-3143"` | JIRA issue key |
| `taskTitle` | `string` | `"Document custom modules"` | Issue title |
| `taskStatus` | `string` | `"To Do"` | Current JIRA workflow status |
| `taskType` | `string` | `"Task"` | Issue type, or empty string |
| `taskPriority` | `string` | `"High"` | Priority, or empty string |
| `taskLabels` | `string[]` | `["xperience", "migration"]` | Labels attached to the issue |
| `taskComponents` | `string[]` | `["Documentation"]` | Component names |
| `taskProject` | `string` | `"DOC"` | Project key (derived from issue key) |
| `taskDescription` | `string` | *(normalized text)* | Plain-text description (untrusted content) |
| `taskCreated` | `string` | `"2026-01-15T10:30:00.000+0000"` | ISO-8601 creation timestamp |
| `taskUpdated` | `string` | `"2026-02-20T14:00:00.000+0000"` | ISO-8601 last-updated timestamp |

### Trigger Metadata

| Variable | Type | Example | Description |
|---|---|---|---|
| `commentTrigger` | `string` | `"@Ralph"` | The trigger string that matched this variant |
| `triggerParams` | `Record<string, string>` | `{ codesamples: "true", branch_name: "xyz" }` | Parsed key-value map (see below) |

### Runtime Flags

| Variable | Type | Description |
|---|---|---|
| `isRevision` | `boolean` | `true` when the issue status matches `revisionStatuses` in the variant config |

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

#### `@RalphDf` / `@Ralph` → `ralph.ralph` (ralph-docs)

Both callsigns invoke the same agent template. `@RalphDf` targets the DF project, `@Ralph` targets the DOC project.

| Param | Type | Effect |
|---|---|---|
| `codesamples` | flag | Renders ASP.NET code project instructions (build commands, namespace conventions, `code_link` tag usage) |
| `branch_name` | key=value | Adds Xperience source branch context — git diff commands against `master` for the specified branch |
| `source_branch` | key=value | Overrides `main` as the base branch for `git checkout -b` and the PR target branch |
| `scope` | key=value | Restricts file changes to the specified path; out-of-scope work goes to handoff as follow-up |

Example: `@Ralph(codesamples, branch_name=feature/custom-modules, source_branch=release/30)`

#### `@Malph` → `ralph.malph` (ralph-docs)

| Param | Type | Effect |
|---|---|---|
| `codesamples` | flag | Adds code review checklist (code_link paths, explicit types, Generated/ protection, namespace patterns) |
| `branch_name` | key=value | Instructs the investigator sub-agent to diff against the specified branch instead of `master` |
| `scope` | key=value | Restricts review scope to the specified path; findings outside are out of bounds |

Example: `@Malph(codesamples, branch_name=feature/custom-modules, scope=src/_documentation/developers)`

#### `@OverRalph` → `ralph.overralph` (ralph-docs)

No trigger params are currently recognized by this template.

#### `@McpProbe` → `ralph.mcp-probe` (ralph-docs)

No trigger params are currently recognized by this template.

#### `@RalphAutocomplete` / `@MalphAutocomplete` (ralph-vscode)

No trigger params are currently recognized by these templates.

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
4. Check `profiles/<id>/.build/` for the rendered output after a task run (or manual render)
