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
- Iterative agents (coder, reviewer): `{{ artifactDir }}/{{ agentName }}/output-v{N}.md` where N is your iteration number
{% endraw %}

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
| `summary` | Enough for a routing decision. Not a report. |
| `artifacts` | Paths relative to the artifact root |
| `next_hint` | Suggested next agent. Orchestrator can override. |
| `iteration` | How many times you've run for this task |

**3. manifest.json** — append an entry to the shared audit log:
{% raw %}
Read `{{ artifactDir }}/manifest.json`. If it doesn't exist, create it as `[]`. Append your entry and write it back:

```json
{
  "timestamp": "<ISO 8601>",
  "agent": "{{ agentName }}",
  "artifacts": ["{{ agentName }}/output.md"],
  "status": "completed",
  "result": "<your result code>",
  "iteration": 1
}
```
{% endraw %}

### Reading upstream artifacts

Read artifacts from other subagents directly from the filesystem. The orchestrator does not relay content between subagents. Look for upstream artifacts at:
{% raw %}
`{{ artifactDir }}/{upstream-agent-name}/output.md` (or `output-v{N}.md` for versioned artifacts)
{% endraw %}

### Conversational return

When you finish, return **one line** to the orchestrator:

```
Done. Status: {status}, result: {result}.
```

Never include artifact content in your conversational return. The orchestrator doesn't need it — it reads `status.json`.
