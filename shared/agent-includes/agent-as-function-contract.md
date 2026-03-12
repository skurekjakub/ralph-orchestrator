## Artifact Contract

You are a **subagent** in a multi-agent pipeline. You communicate results through the **filesystem**, not through conversation. The orchestrator that dispatched you will only read your `status.json` — never your output artifacts.

### Artifact directory
{% raw %}
Your artifact directory is: `{{ artifactDir }}/{{ agentName }}/`

Create it if it doesn't exist. Write all output files here.
{% endraw %}

### Required files

**1. Primary artifact** — your main output:
{% raw %}
- Non-iterative agents: `{{ artifactDir }}/{{ agentName }}/output.md`
- Iterative agents (writer, coder, reviewer, validator): `{{ artifactDir }}/{{ agentName }}/output-v{N}.md` where N is your **cumulative dispatch count** (monotonically increasing across all dispatches for this task, regardless of which planned subtask each dispatch handles)
- **Agents with custom artifact lists:** If your prompt defines specific named output files (e.g., `handoff.md`, `jira-comment.md`), those replace `output.md` as your primary artifacts. List all of them in your `status.json` `artifacts` array. You do not need to also produce `output.md`.
{% endraw %}

⚠️ **Determining N:** Before writing your output file, list existing `output-v*.md` files in your artifact directory. Set N = highest existing number + 1. If no files exist, N = 1. **Never reset N** when switching between planned subtasks — the version sequence must be continuous across all dispatches.

**2. status.json** — structured status the orchestrator reads for routing:
{% raw %}
```json
{
  "agent": "{{ agentName }}",
  "task_id": "{{ taskId }}",
  "status": "completed",
  "result": "<your result code>",
  "summary": "<one line, max ~100 tokens>",
  "artifacts": ["{{ agentName }}/output.md"],
  "next_hint": "<suggested next agent or null>",
  "iteration": 1
}
```

Write to: `{{ artifactDir }}/{{ agentName }}/status.json`
{% endraw %}

| Field | Description |
|---|---|
| `status` | `completed` · `failed` · `blocked` — did you finish? |
| `result` | Your task-specific outcome code (e.g. `analyzed`, `implemented`, `pass`, `fail`) |
| `task_id` | Always the **work item ID** (e.g., `DOC-3189`) from `{{ taskId }}` — never a subtask ID like `TASK-01` |
| `summary` | Enough for a routing decision. Not a report. |
| `artifacts` | Paths relative to the artifact root — **must list ALL output files** written across all iterations, not just the latest |
| `next_hint` | Suggested next agent. Orchestrator can override. |
| `iteration` | Cumulative dispatch count for this task (monotonically increasing — if the orchestrator dispatches you 3 times, your 3rd dispatch writes `iteration: 3` regardless of which subtask each dispatch handled) |

**3. manifest.json** — **REQUIRED**: append an entry to the shared audit log:
{% raw %}
Read `{{ artifactDir }}/manifest.json`. If it doesn't exist, create it as `[]`. Append your entry and write it back. **You must do this after writing status.json — it is not optional.**

⚠️ **Timestamp must be real.** Run `date -u +%Y-%m-%dT%H:%M:%SZ` and use the output — never guess or hardcode a date.

```json
{
  "timestamp": "<run date command above>",
  "agent": "{{ agentName }}",
  "artifacts": ["{{ agentName }}/output.md"],
  "status": "completed",
  "result": "<your result code>",
  "iteration": 1
}
```
{% endraw %}

### Completion Sequence

After finishing your primary work, always execute this sequence:

1. Write your primary artifact (`output.md` or `output-v{N}.md`)
2. Write `status.json`
3. Read `manifest.json`, append your entry, write it back

### Reading upstream artifacts

Read artifacts from other subagents directly from the filesystem. The orchestrator does not relay content between subagents. Look for upstream artifacts at:
{% raw %}
`{{ artifactDir }}/{upstream-agent-name}/output.md` (or `output-v{N}.md` for versioned artifacts)
{% endraw %}

### Control-file exception

Some workflows define explicit **control files** such as `state.md` or `tasks.json`.

These files are an exception to the normal routing rule:
- The orchestrator still routes on subagent `status.json` results
- The orchestrator may also read or update designated control files for phase, task-lifecycle, or per-task-attempt bookkeeping
- Subagents may read those control files only when their prompt explicitly tells them to

Never use another subagent's narrative artifact (`output.md`, `output-v{N}.md`) as a substitute for `status.json` routing or for a workflow's designated control file.

### Conversational return

When you finish, return **one line** to the orchestrator:

```
Done. Status: {status}, result: {result}.
```

Never include artifact content in your conversational return. The orchestrator doesn't need it — it reads `status.json`.
