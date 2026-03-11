# Trigger Parameters

Agent invocations are triggered by JIRA comments matching a variant's `commentTrigger` string. Parameters can be passed in parentheses after the trigger.

## Syntax

```
@TriggerString
@TriggerString(param1, param2)
@TriggerString(key=value)
@TriggerString(param1, key1=value1, key2=value2)
```

### Parsing Rules

| Input | Parsed As | Notes |
|---|---|---|
| `codesamples` | `{ codesamples: "true" }` | Bare params map to `"true"` |
| `branch=feature-xyz` | `{ branch: "feature-xyz" }` | Key-value split on first `=` |
| `config=a=b` | `{ config: "a=b" }` | Only first `=` is the delimiter |
| `key=` | `{ key: "" }` | Empty string value (still truthy in Liquid `{% if %}`) |

Parameters are **case-sensitive**. Commas separate parameters — values cannot contain commas.

### Template Access

All trigger parameters are available in agent templates via the `triggerParams` object:

```liquid
{% if triggerParams.codesamples %}
  Code sample instructions here
{% endif %}

{% if triggerParams.scope %}
  Restrict changes to: {{ triggerParams.scope }}
{% endif %}
```

Any parameter name is valid — new parameters can be used in templates without code changes.

## Orchestrator-Level Parameters

These parameters are recognized by the orchestrator itself (not just templates):

| Parameter | Type | Used By | Description |
|---|---|---|---|
| `source_branch` | `key=value` | RepoSyncHook | Base branch for repo checkout and task branch creation. Default: `main` |
| `branch` | `key=value` | RepoSyncHook, `$task.branch` macro | Overrides the computed task branch name. Use for pre-existing branches that don't follow the `ralph/<id>-<slug>` naming convention |
| `skip_hooks` | bare | TaskRunner | Skips post-task hook execution. Writes a `hook-manifest.json` to the output directory for manual replay |

### source_branch

Controls which branch the orchestrator syncs to before creating the task branch.

```
@Ralph(source_branch=release/30)
```

The task branch is created from the HEAD of this branch. Also used as the PR target branch by workflow skills.

### branch

Overrides the auto-generated task branch name (`ralph/<taskId>-<slugified-title>`). Use when working on a pre-existing branch with a different naming convention.

```
@Ralph(branch=code/my-existing-feature-branch)
```

When set, the orchestrator checks out this branch directly instead of creating a new one. The `$task.branch` runtime macro also resolves to this value.

When both `branch` and `source_branch` are provided, `source_branch` still controls the initial repo sync (fetch + checkout + reset), then `branch` is checked out as the working branch. This is useful when you need to sync the repo to a specific base but work on a pre-existing feature branch.

### skip_hooks

Skips post-task hook execution (e.g. the scientist/analysis pipeline). The main agent still runs, logs are collected, and JIRA transitions happen — only the `postTaskHooks` pipeline is bypassed.

```
@Ralph(skip_hooks)
@Ralph(codesamples, skip_hooks)
```

When hooks are skipped, the orchestrator writes a `hook-manifest.json` to the task output directory (`output/logs/<key>-<startTs>/hook-manifest.json`). This file contains the full context needed to replay hooks later:

```json
{
  "taskId": "DOC-3189-1773218420974",
  "workItemId": "DOC-3189",
  "source": "jira",
  "profileId": "ralph-docs",
  "variantKey": "ralph-docs:ralph.ralph:@RalphDf",
  "triggerParams": { "skip_hooks": "true" },
  "isRevision": false,
  "outputDir": "output/logs/DOC-3189-1773218420974",
  "status": "completed",
  "collectedLogs": { "primary-audit": "...", "primary-transcript": "..." },
  "hooks": [ { "name": "run-analysis", "stages": [...] } ],
  "createdAt": "2025-07-09T10:00:00.000Z"
}
```

#### Replaying hooks manually

Use the `run-hooks.ts` script to replay skipped hooks:

```bash
# Run all hooks from the manifest
npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974

# Run a specific hook only
npx tsx scripts/run-hooks.ts output/logs/DOC-3189-1773218420974 --hook run-analysis
```

The script loads the current config (runs `AppStartup`), finds the matching profile, and executes hooks using local executors — identical to how `TaskRunner` runs them. This enables running analysis pipelines asynchronously or selectively.

The JIRA start comment includes a notice when hooks are skipped, with the replay command.

## Profile-Specific Parameters

These parameters are recognized by agent templates and workflow skills. Availability depends on the profile and agent.

### ralph-docs Profile

| Parameter | Agent | Description |
|---|---|---|
| `codesamples` | `ralph.ralph` | Includes ASP.NET code project authoring instructions. When combined with `xpversion`, triggers the coder subagent to bootstrap the project before research. |
| `xpversion` | `ralph.ralph` | Version or URL for Xperience package installation. Only meaningful when `codesamples` is also set. See [xpversion formats](#xpversion-formats) below. |
| `adminui` | `ralph.ralph` | Enables admin UI interaction via Playwright. The coder verifies access; the writer can create admin objects. Only meaningful when `codesamples` is also set. |
| `branch_name` | `ralph.ralph` | Xperience source branch for `git diff` context |
| `skip_review` | `ralph.ralph` | Skips the review cycle phases in the standard workflow |
| `release_notes` | `ralph.ralph` | write release notes |
| `scope` | `ralph.ralph` | Restricts file changes to a specified path |
| `codesamples` | `ralph.malph` | Adds code sample review checklist |
| `branch_name` | `ralph.malph` | Instructs reviewer to diff against specified Xperience branch |
| `scope` | `ralph.malph` | Restricts review scope to a specified path |

### xpversion Formats

The `xpversion` parameter accepts multiple formats. The value is passed verbatim to the docs-repo `npm run codesamples:setversion` script.

| Format | Example | Description |
|---|---|---|
| Semver (public NuGet) | `31.0.0` | Stable public release from nuget.org |
| Private feed version | `31.1.0-hash` | Pre-release build from the Kentico private NuGet feed (requires `ADO_PAT_XPERIENCE`) |
| PR URL | `https://dev.azure.com/kenticoxperience/CMS/_git/xperience/pullrequest/24735` | Downloads artifacts from the PR's latest build |
| Build URL | `https://dev.azure.com/kenticoxperience/CMS/_build/results?buildId=550290` | Downloads artifacts from a specific CI build |

#### Usage examples

```
# Stable public version
@Ralph(codesamples, xpversion=31.0.0)

# Pre-release from private feed
@Ralph(codesamples, xpversion=31.2.0-build1)

# From PR artifacts
@Ralph(codesamples, xpversion=https://dev.azure.com/kenticoxperience/CMS/_git/xperience/pullrequest/24735)

# From build artifacts
@Ralph(codesamples, xpversion=https://dev.azure.com/kenticoxperience/CMS/_build/results?buildId=550290)

# With admin UI access
@Ralph(codesamples, xpversion=31.2.0-build1, adminui)

# Codesamples without bootstrap (project pre-configured externally)
@Ralph(codesamples)
```

#### Behavioral notes

- `xpversion` without `codesamples` is ignored — the coder only runs when both are present
- `adminui` without `codesamples` is ignored — admin UI requires a running codesamples server
- `codesamples` without `xpversion` preserves existing behavior (no coder, writer handles project manually)
- `xpversion` value is passed verbatim to `npm run codesamples:setversion --`

### ralph-vscode Profile

| Parameter | Agent | Description |
|---|---|---|
| *(No profile-specific params defined yet)* | | |

## Adding New Parameters

To add a new trigger parameter:

1. Choose a parameter name (lowercase, no spaces)
2. Use it in your agent template: `{% if triggerParams.my_param %}...{% endif %}`
3. Pass it in the JIRA comment: `@Ralph(my_param)` or `@Ralph(my_param=value)`

No code changes required. The parameter is parsed automatically and available in the template context.
