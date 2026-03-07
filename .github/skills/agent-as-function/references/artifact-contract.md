# Artifact Contract

Detailed schemas and conventions for the filesystem artifact handoff between orchestrator and subagents.

## Artifact Directory Structure

Each task gets a shared artifact directory. Every subagent writes to its own subdirectory.

```
{artifact-root}/{task-id}/
├── manifest.json              # append-only audit log
├── {agent-name}/
│   ├── output.md              # primary artifact (or output-v1.md, output-v2.md for iterations)
│   ├── status.json            # structured status — the ONLY thing the orchestrator reads
│   └── ...                    # any additional files (e.g., jira-findings.json)
```

The artifact root varies by execution context:
- **Container agents**: `.ralph/tasks/{task-id}/artifacts/`
- **Local/post-hook agents**: `{hook.outputDir}/artifacts/`

## status.json

Every subagent writes this before exiting. This is the **only** file the orchestrator reads.

```json
{
  "agent": "ralph-reviewer",
  "task_id": "DOC-3167",
  "status": "completed",
  "result": "fail",
  "summary": "2 pattern violations, 1 missing test. See output-v1.md.",
  "artifacts": ["ralph-reviewer/output-v1.md"],
  "next_hint": "ralph-coder",
  "iteration": 1
}
```

| Field | Type | Purpose |
|---|---|---|
| `agent` | string | Subagent name |
| `task_id` | string | Task identifier (JIRA key, etc.) |
| `status` | `completed` · `failed` · `blocked` | Did the agent finish its work? |
| `result` | string | Agent-defined outcome code. The orchestrator routes on this. |
| `summary` | string | One-line description, ~100 tokens max. Enough for routing, not a report. |
| `artifacts` | string[] | Paths relative to `{artifact-root}/{task-id}/` |
| `next_hint` | string? | Suggested next subagent. Orchestrator can override. |
| `iteration` | number | Loop counter. Orchestrator uses this for termination checks. |

**Design rule**: if the orchestrator needs more info than `status.json` provides to route, make `result` or `summary` more informative — don't make the orchestrator read artifacts.

## manifest.json

Append-only audit log. Each subagent appends an entry when writing artifacts. The orchestrator doesn't read this during normal flow — it exists for debugging, recovery, and letting downstream subagents discover execution history.

```json
[
  {
    "timestamp": "2026-03-06T14:22:00Z",
    "agent": "ralph-analyst",
    "artifacts": ["ralph-analyst/output.md"],
    "status": "completed",
    "result": "analyzed",
    "iteration": 1
  }
]
```

Subagents can also use `manifest.json` to discover what ran before them — for example, a scribe agent can enumerate all reviewer entries to know which review files to aggregate.

## Iterative Versioning

When a subagent runs multiple times (coder → reviewer → coder), each iteration produces a versioned artifact:

```
ralph-coder/
├── output-v1.md       # first attempt
├── output-v2.md       # after reviewer feedback
└── status.json        # always reflects latest iteration

ralph-reviewer/
├── output-v1.md       # review of coder's v1
└── status.json        # always reflects latest iteration
```

**Rules:**
- `status.json` is **overwritten** each iteration (current state only)
- `manifest.json` **preserves** the full history (append-only)
- Downstream subagents read the specific versioned file they need (coder v2 reads `ralph-reviewer/output-v1.md`)
- Orchestrator enforces max iteration limits to prevent infinite loops
- Version numbers match the `iteration` field in `status.json`

## Writing status.json: When and How

**Always write `status.json` before returning.** This includes failure cases — the orchestrator can't route without it.

Successful completion:
```json
{
  "agent": "ralph-analyst",
  "task_id": "DOC-3167",
  "status": "completed",
  "result": "analyzed",
  "summary": "5 sections identified, 2 require restructuring. See output.md.",
  "artifacts": ["ralph-analyst/output.md"],
  "next_hint": "ralph-coder",
  "iteration": 1
}
```

Failure:
```json
{
  "agent": "ralph-coder",
  "task_id": "DOC-3167",
  "status": "failed",
  "result": "build-broken",
  "summary": "TypeScript compilation failed after changes. 3 type errors in api-client.ts.",
  "artifacts": ["ralph-coder/output-v1.md"],
  "next_hint": null,
  "iteration": 1
}
```

Blocked (needs human intervention):
```json
{
  "agent": "ralph-reviewer",
  "task_id": "DOC-3167",
  "status": "blocked",
  "result": "ambiguous-requirements",
  "summary": "AC #3 contradicts AC #5. Cannot proceed without clarification.",
  "artifacts": ["ralph-reviewer/output-v1.md"],
  "next_hint": null,
  "iteration": 1
}
```

## Appending to manifest.json

After writing artifacts and `status.json`, append an entry to the task-level `manifest.json`:

```javascript
// Pseudo-code for the append pattern
const manifest = JSON.parse(readFile(`${artifactRoot}/${taskId}/manifest.json`) || '[]');
manifest.push({
  timestamp: new Date().toISOString(),
  agent: agentName,
  artifacts: writtenArtifactPaths,
  status: statusValue,
  result: resultCode,
  iteration: currentIteration
});
writeFile(`${artifactRoot}/${taskId}/manifest.json`, JSON.stringify(manifest, null, 2));
```

If `manifest.json` doesn't exist yet (first subagent in the pipeline), create it as a new array with one entry.
