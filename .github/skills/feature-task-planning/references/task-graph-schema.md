# Task Graph JSON Schema

Complete schema reference for `task-graph-<family>.json` files. The task graph is the execution tracking artifact — it maps every discrete task to an ID, its phase, prerequisites, target files, and acceptance criteria.

## Top-Level Structure

```json
{
  "$schema": "Human-readable description of this graph",
  "version": 1,
  "family": "<family-name>",
  "generatedAt": "ISO-8601 timestamp",
  "description": "What this graph implements and its scope",
  "summary": { ... },
  "assumptions": [ ... ],
  "designDecisions": [ ... ],
  "tasks": [ ... ],
  "executionOrder": { ... }
}
```

### Header Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | string | Yes | Human-readable one-liner describing the graph |
| `version` | number | Yes | File version number — must match the `-v<N>` suffix in the filename |
| `family` | string | Yes | Logical grouping (e.g., `"manual"`, `"orchestrator"`, `"directives"`) |
| `generatedAt` | string | Yes | ISO-8601 creation timestamp |
| `versionNote` | string | No | One-line summary of what changed from the previous version (required for v2+) |
| `description` | string | Yes | What this graph implements, one paragraph max |
| `implementedAt` | string | No | ISO-8601 date when all tasks were completed (added post-implementation) |
| `implementationStatus` | string | No | `"complete"` when all tasks are done |

### Summary Block

Quick scope overview for readers who don't want to count tasks.

```json
"summary": {
  "totalTasks": 30,
  "phases": 7,
  "newAgentFiles": 7,
  "modifiedAgentFiles": 9,
  "newDirectories": 2,
  "agentCount": {
    "before": 22,
    "after": 29,
    "delta": "+7 (1 coordinator + 6 specialists)"
  }
}
```

Adapt the fields to the feature — `agentCount` only makes sense for agent work. Use descriptive fields like `newFiles`, `modifiedFiles`, `newServices`, whatever fits.

### Assumptions

Array of strings — preconditions that must be true for this graph to be valid.

```json
"assumptions": [
  "22 base docwriter agents already exist",
  "VS Code Copilot Chat is the invocation surface",
  "Internet access is available for the research gate"
]
```

### Design Decisions (Optional)

Array of `{ decision, rationale }` objects. Use for graph-wide decisions. Per-task decisions belong in the phase spec.

```json
"designDecisions": [
  {
    "decision": "Single file rather than drop folder",
    "rationale": "One file is easier to find and edit. No consumption tracking needed."
  }
]
```

## Task Schema

```json
{
  "id": "M-001",
  "phase": 1,
  "ref": "phase-1-foundation-bootstrap.md § 1.1",
  "title": "Modify bootstrap — meta directories + seed files",
  "description": "Detailed description of what this task does and why.",
  "type": "create | modify | specification | verification",
  "target": ".github/agents/docwriter-bootstrap.sh",
  "prerequisites": [],
  "status": "not-started",
  "artifacts": {
    "creates": ["path/to/new/file"],
    "modifies": ["path/to/existing/file"]
  },
  "acceptanceCriteria": [
    "Concrete, verifiable criterion 1",
    "Concrete, verifiable criterion 2"
  ]
}
```

### Task Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique ID with family prefix: `M-001`, `D-001`, `O-001` |
| `phase` | number | Yes | Which phase this task belongs to |
| `ref` | string | Yes | Cross-reference to phase spec: `phase-N-name.md § N.M` |
| `title` | string | Yes | Short imperative title |
| `description` | string | Yes | What the task does and why. 1-3 sentences. |
| `type` | string | Yes | One of: `create`, `modify`, `specification`, `verification` |
| `target` | string | Yes | Primary file or directory this task acts on |
| `prerequisites` | string[] | Yes | Task IDs that must complete first (empty array if none) |
| `status` | string | Yes | `not-started`, `in-progress`, `implemented`, `blocked`, `deferred` |
| `artifacts` | object | No | `{ creates: string[], modifies: string[] }` — files touched |
| `acceptanceCriteria` | string[] | Yes | Verifiable statements (2-6 per task) |

### ID Conventions

- Use a consistent prefix per graph: `M-` (manual), `D-` (directives), `O-` (orchestrator)
- Sequential numbering: `M-001`, `M-002`, ..., `M-030`
- Zero-padded to 3 digits for sorting

### Type Definitions

| Type | When to use |
|---|---|
| `create` | New file from scratch |
| `modify` | Change to an existing file |
| `specification` | Design document, format spec, convention reference |
| `verification` | End-to-end consistency check, cross-reference validation |

## Execution Order Block

Groups tasks into ordered steps, noting parallelism opportunities: 

```json
"executionOrder": {
  "steps": [
    {
      "step": 1,
      "phase": 1,
      "tasks": ["M-001", "M-002"],
      "parallelSafe": true,
      "note": "Foundation — bootstrap + skill scaffold (independent)"
    },
    {
      "step": 2,
      "phase": 1,
      "tasks": ["M-003"],
      "parallelSafe": false,
      "note": "Bootstrap --clean depends on M-001"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `step` | number | Sequential step number (1-based) |
| `phase` | number | Which phase these tasks belong to |
| `tasks` | string[] | Task IDs to execute in this step |
| `parallelSafe` | boolean | Whether the tasks in this step can run simultaneously |
| `note` | string | Human-readable explanation of this step |

## Marking Completion

When all tasks are implemented, create a **new version** of the task graph:

1. Increment `version` and create a new file with matching `-v<N>` suffix
2. Set every task's `status` to `"implemented"`
3. Add `"implementedAt": "<ISO-date>"` to the header
4. Add `"implementationStatus": "complete"` to the header
5. Set `"versionNote": "All tasks implemented — final"`
6. Update `"description"` to reflect completion (past tense)

Previous versions are never modified. The version history serves as an audit trail of plan evolution.

## Versioning

Task graphs are immutable once created. Every change — whether from debrief feedback, mid-implementation discovery, or status updates — produces a new file:

```
task-graph-manual-v1.json    ← initial plan
task-graph-manual-v2.json    ← post-debrief revision
task-graph-manual-v3.json    ← mid-implementation addition
task-graph-manual-v4.json    ← final (all implemented)
```

The `version` field in the JSON must match the file suffix. The `ref` fields in tasks must point to the correct version of each phase spec (e.g., `"phase-2-core-v2.md § 2.1"`).
