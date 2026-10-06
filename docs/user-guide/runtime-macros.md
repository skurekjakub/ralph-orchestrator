# Runtime Macros

MCP server `env` blocks in `profile.json` support runtime macros — values starting with `$` that are resolved per-task before the container starts.

```json
{
  "name": "ado",
  "env": {
    "ADO_PROJECT": "CustomerEducation",
    "TASK_BRANCH": "$task.branch",
    "JIRA_KEY": "$task.id",
    "TARGET_BRANCH": "$trigger.source_branch",
    "NODEBB_TOKEN": "$variantEnv.NODEBB_TOKEN"
  }
}
```

Static values (no `$` prefix) pass through unchanged. All macro values resolve to strings.

## $task.\* — Work Item Macros

Resolved from the current JIRA issue.

| Macro           | Returns          | Example                                    |
| --------------- | ---------------- | ------------------------------------------ |
| `$task.id`      | Issue key        | `"DOC-3143"`                               |
| `$task.project` | Project key      | `"DOC"`                                    |
| `$task.branch`  | Task branch name | `"ralph/DOC-3143-document-custom-modules"` |
| `$task.title`   | Issue summary    | `"Document custom modules"`                |

### $task.branch Details

By default, computed as `ralph/<taskId>-<slugified-title>` (max 80-char slug, lowercase, non-alphanumeric replaced with hyphens).

If the `branch` trigger parameter is set (e.g. `@Ralph(branch=code/my-branch)`), `$task.branch` resolves to that value instead.

## $trigger.&lt;key&gt; — Trigger Parameter Macros

Resolved from the JIRA comment trigger parameters.

| Macro                    | Trigger Comment                    | Resolves To         |
| ------------------------ | ---------------------------------- | ------------------- |
| `$trigger.branch`        | `@Ralph(branch=feature-xyz)`       | `"feature-xyz"`     |
| `$trigger.source_branch` | `@Ralph(source_branch=release/30)` | `"release/30"`      |
| `$trigger.anything`      | `@Ralph` (param not provided)      | `""` (empty string) |

Returns empty string when the parameter is missing or when no trigger params were provided.

## $variantEnv.&lt;PREFIX&gt; — Variant-Scoped Environment Macros

Resolves an environment variable using a naming convention scoped to the profile and variant:

```
<PREFIX>_<PROFILEID>_<DISPLAYNAME>
```

All uppercase, dashes/dots/slashes converted to underscores.

| Macro                      | Profile        | Display Name | Env Var Resolved                |
| -------------------------- | -------------- | ------------ | ------------------------------- |
| `$variantEnv.NODEBB_TOKEN` | `ralph-docs`   | `ralph`      | `NODEBB_TOKEN_RALPH_DOCS_RALPH` |
| `$variantEnv.NODEBB_TOKEN` | `ralph-docs`   | `malph`      | `NODEBB_TOKEN_RALPH_DOCS_MALPH` |
| `$variantEnv.API_KEY`      | `ralph-vscode` | `ralph`      | `API_KEY_RALPH_VSCODE_RALPH`    |

Throws an error at task start if the resolved env var is not set in `.env` or the environment.

## Validation

- Unknown `$`-prefixed values that don't match any macro pattern cause an error at task start
- `requiredConfig` in server manifests is validated at startup — profiles must provide all required env vars
- `$variantEnv` macros fail fast if the env var is missing
- `$trigger` macros never fail — they return empty string for missing params
