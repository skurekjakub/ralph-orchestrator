## Result

Every run ends with your result, even a run that fails or stops early. The orchestrator reads it to decide what happens to {{ taskId }}; a run that ends without one fails.
{%- if cli == "claude" %}

Return it with the `StructuredOutput` tool: call it once, as the last thing you do, with the fields below.
{%- else %}

Print it as your result block, the last thing you print: a line `===RALPH_RESULT_START===`, one `FIELD: value` line for each field below that you fill in, then a line `===RALPH_RESULT_END===`.
{%- endif %}

| Field | Value |
|---|---|
| `STATUS` | Required. `completed` when the task is done, `partial` when only part of it is, `blocked` when you cannot proceed |
| `PR_URL` | URL of the pull request you opened or updated |
| `SUMMARY` | One line on the outcome |
| `JIRA_KEY` | `{{ taskId }}` |
| `BRANCH` | The branch you pushed your changes to |
| `HANDOFF` | Path of the handoff file you attached to {{ taskId }} |

Leave out a field you have no value for.
