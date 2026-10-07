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

| Input                | Parsed As                   | Notes                                                  |
| -------------------- | --------------------------- | ------------------------------------------------------ |
| `codesamples`        | `{ codesamples: "true" }`   | Bare params map to `"true"`                            |
| `branch=feature-xyz` | `{ branch: "feature-xyz" }` | Key-value split on first `=`                           |
| `config=a=b`         | `{ config: "a=b" }`         | Only first `=` is the delimiter                        |
| `key=`               | `{ key: "" }`               | Empty string value (still truthy in Liquid `{% if %}`) |

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

| Parameter       | Type        | Used By                                    | Description                                                                                                                                                      |
| --------------- | ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_branch` | `key=value` | TaskWorkspaceManager                       | Base branch the task's workspace is cloned on and the task branch is created from. Default: `main`, or the existing PR target branch on revisions when available |
| `branch`        | `key=value` | TaskWorkspaceManager, `$task.branch` macro | Overrides the resolved task branch name. Use for pre-existing branches that don't follow the `ralph/<id>-<slug>` naming convention                               |
| `skip_hooks`    | bare        | TaskRunner                                 | Skips post-task hook execution. Writes a `hook-manifest.json` to the output directory for manual replay                                                          |

### source_branch

Sets the base branch: the task's workspace is cloned on it, and a task branch the remote does not have yet is created from it.

```
@Ralph(source_branch=release/30)
```

The task branch is created from the HEAD of this branch. Also used as the PR target branch by workflow skills.

If this parameter is omitted for a revision task and the issue already has a supported pull request URL in comments, the orchestrator tries to infer the base branch from that PR's target branch.

### branch

Overrides the resolved task branch name. Without this parameter, the orchestrator uses the existing PR source branch for revision tasks when available; otherwise it falls back to the auto-generated name (`ralph/<taskId>-<slugified-title>`).

```
@Ralph(branch=code/my-existing-feature-branch)
```

When the remote has this branch, the task's workspace checks it out instead of creating a new one; otherwise the branch is created from the base branch. The `$task.branch` runtime macro also resolves to this value.

When both `branch` and `source_branch` are provided, the workspace is cloned on `source_branch`, then `branch` is checked out as the working branch. This is useful when you need a specific base but work on a pre-existing feature branch.

This explicit override always wins over automatic PR-based inference.

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
  "collectedLogs": { "audit": "...", "transcript": "...", "claude-run-telemetry": "..." },
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

The script loads the current config (runs `AppStartup`), finds the matching profile, and runs the hooks through the same post-task hook runner a task uses: each stage on the host, in its own workspace under the output directory's `hooks/<hook>/<role>/`. This enables running analysis pipelines asynchronously or selectively.

The JIRA start comment includes a notice when hooks are skipped, with the replay command.

## Profile-Specific Parameters

These parameters are recognized by agent templates and workflow skills. Availability depends on the profile and agent.

### ralph-docs Profile

| Parameter       | Agent          | Description                                                                                                                                                  |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `codesamples`   | `ralph.ralph`  | Includes ASP.NET code project authoring instructions. When combined with `xpversion`, triggers the coder subagent to bootstrap the project before research.  |
| `xpversion`     | `ralph.ralph`  | Version or URL for Xperience package installation. Only meaningful when `codesamples` is also set. See [xpversion formats](#xpversion-formats) below.        |
| `adminui`       | `ralph.ralph`  | Enables admin UI interaction via Playwright. The coder verifies access; the writer can create admin objects. Only meaningful when `codesamples` is also set. |
| `branch_name`   | `ralph.ralph`  | Xperience source branch for `git diff` context                                                                                                               |
| `release_notes` | `ralph.ralph`  | Writes release notes                                                                                                                                         |
| `scope`         | `ralph.ralph`  | Restricts file changes to a specified path                                                                                                                   |
| `codesamples`   | `ralph.malph`  | Adds code sample review checklist                                                                                                                            |
| `branch_name`   | `ralph.malph`  | Instructs reviewer to diff against specified Xperience branch                                                                                                |
| `scope`         | `ralph.malph`  | Restricts review scope to a specified path                                                                                                                   |
| `component`     | `ralph.stacky` | Names the component area the task targets; changes outside it are noted in the handoff                                                                       |

### xpversion Formats

The `xpversion` parameter accepts multiple formats. The value is passed verbatim to the docs-repo `npm run codesamples:setversion` script.

| Format                | Example                                                                       | Description                                                                          |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Semver (public NuGet) | `31.0.0`                                                                      | Stable public release from nuget.org                                                 |
| Private feed version  | `31.1.0-hash`                                                                 | Pre-release build from the Kentico private NuGet feed (requires `ADO_PAT_XPERIENCE`) |
| PR URL                | `https://dev.azure.com/kenticoxperience/CMS/_git/xperience/pullrequest/24735` | Downloads artifacts from the PR's latest build                                       |
| Build URL             | `https://dev.azure.com/kenticoxperience/CMS/_build/results?buildId=550290`    | Downloads artifacts from a specific CI build                                         |

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

| Parameter      | Agent         | Description                                                                                                                                                                                                                                                      |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skip_planner` | `ralph.ralph` | Bare flag. Skips `ralph-planner`: the analyst's plan goes straight to a `ralph-coder` → `ralph-reviewer` loop (max 2 iterations) instead of planned task files with a per-task loop (max 3 rounds) and planner verification. Applies to fresh and revision runs. |

Example: `@RalphAutocomplete(skip_planner)`

## Adding New Parameters

To add a new trigger parameter:

1. Choose a parameter name (lowercase, no spaces)
2. Use it in your agent template: `{% if triggerParams.my_param %}...{% endif %}`
3. Pass it in the JIRA comment: `@Ralph(my_param)` or `@Ralph(my_param=value)`

No code changes required. The parameter is parsed automatically and available in the template context.
