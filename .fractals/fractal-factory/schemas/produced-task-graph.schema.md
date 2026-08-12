# Produced Task Graph Schema

Canonical schema for `task-graph.json` — the dependency-gated execution artifact that drives produced agent systems. The planner creates it, the execution coordinator consumes it, and feedback from any source (gap hunting, verification, analysis re-entry, or human review) can trigger planner re-dispatch to mutate it.

This schema is for **produced systems only**. The factory's own execution uses `production-graph.json` (see `production-graph.schema.md`).

## Schema

```json
{
  "version": 1,
  "lastUpdated": "<ISO-8601-UTC>",
  "summary": {
    "totalTasks": 0,
    "byStatus": {
      "planned": 0,
      "in-progress": 0,
      "implemented": 0,
      "verified": 0,
      "blocked": 0,
      "failed-parity": 0
    }
  },
  "tasks": [
    {
      "id": "T-001",
      "name": "<descriptive task name>",
      "description": "<what this task produces and why>",
      "featureIds": ["<IDs from the domain inventory that this task covers>"],
      "dependsOn": ["<T-nnn IDs that must be verified before this task can start>"],
      "status": "planned",
      "priority": 1,
      "scope": {
        "sourceFiles": ["<paths to source files this task reads>"],
        "targetPattern": "<architecture description of the target output>",
        "boundaryNotes": "<what is explicitly NOT in scope>"
      },
      "acceptanceCriteria": [
        "<criterion 1 — specific, verifiable>",
        "<criterion 2>"
      ],
      "invariants": [
        "<behavioral invariant copied from analysis — inline, not by reference>"
      ],
      "verificationOracles": ["<oracle type>"],
      "addedBy": "<agent name>",
      "addedInRevision": 0,
      "annotations": []
    }
  ]
}
```

## Field Descriptions

### Task Node

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Sequential ID in `T-nnn` format (T-001, T-002, ...) |
| `name` | string | Yes | Human-readable task name |
| `description` | string | Yes | What this task produces and why |
| `featureIds` | string[] | Yes | IDs from the domain inventory that this task covers. Must reference actual inventory item IDs. |
| `dependsOn` | string[] | Yes | Task IDs that must reach `verified` status before this task is eligible. Empty array = no dependencies. |
| `status` | enum | Yes | Current lifecycle state (see Status Lifecycle below) |
| `priority` | number | Yes | Execution priority. Lower = higher priority. Used to break ties among eligible tasks. |
| `scope` | object | Yes | Execution boundary definition |
| `scope.sourceFiles` | string[] | Yes | Paths to source files the coder reads for this task |
| `scope.targetPattern` | string | Yes | Architecture description of the target output |
| `scope.boundaryNotes` | string | Yes | What is explicitly NOT in scope — prevents coder drift |
| `acceptanceCriteria` | string[] | Yes | Specific, verifiable criteria. At least one per task. |
| `invariants` | string[] | Yes | Behavioral invariants copied inline from analysis. NOT cross-referenced by ID — the coder and reviewer must see them without reading analysis artifacts. |
| `verificationOracles` | string[] | Yes | Which oracle types apply to this task (e.g., `journey`, `contract`, `data-parity`, `visual`, `auth-parity`, `error-parity`) |
| `addedBy` | string | Yes | Agent name that created/last mutated this task. Always the planner specialist. |
| `addedInRevision` | number | Yes | Revision round that triggered this task's creation. `0` for initial planning. Incremented each time the planner is re-dispatched (from any source: gap hunting, verification failure, analysis re-entry, or human feedback). |
| `annotations` | array | Yes | Feedback-driven annotations from any source (see Annotations below) |

### Annotations

When any feedback source identifies issues with existing tasks, the planner is re-dispatched to read the feedback artifact and annotate the task graph. Each annotation records what was found, where the feedback came from, and suggested fixes.

```json
{
  "annotatedBy": "<planner agent name>",
  "revision": 1,
  "source": "gap-hunting | verification | analysis | manual",
  "description": "<what was found>",
  "severity": "critical | warning",
  "suggestedFix": "<how to address it>"
}
```

| Source | Trigger | Feedback Artifact |
|---|---|---|
| `gap-hunting` | Gap hunters find missing coverage | `gap-report.json` |
| `verification` | Oracle validators report parity failures | `verification-matrix.json` |
| `analysis` | Analysis re-entry discovers new items/invariants | Updated `analysis-matrix.json` |
| `manual` | Human writes feedback file | `human-feedback.md` |

Feedback producers do NOT mutate the task graph directly. The planner specialist is the sole writer of `task-graph.json`.

### Summary

The `summary` block is recomputed after every status transition by counting actual task statuses:

```json
{
  "totalTasks": "<count of tasks array>",
  "byStatus": {
    "planned": "<count where status == planned>",
    "in-progress": "<count where status == in-progress>",
    "implemented": "<count where status == implemented>",
    "verified": "<count where status == verified>",
    "blocked": "<count where status == blocked>",
    "failed-parity": "<count where status == failed-parity>"
  }
}
```

The orchestrator reads `summary.byStatus` to populate `progress.json.counts`.

## Status Lifecycle

```
planned ──→ in-progress ──→ implemented ──→ verified
  │              │                │
  │              │                └──→ failed-parity ──→ in-progress (retry)
  │              │
  │              └──→ blocked (max retries exhausted)
  │
  └──→ blocked (dependency task is blocked — cascade)
```

| Status | Meaning |
|---|---|
| `planned` | Task defined, not yet started |
| `in-progress` | Coder is currently working on this task |
| `implemented` | Coder finished, awaiting reviewer |
| `verified` | Reviewer approved (or oracle passed) |
| `blocked` | Cannot proceed — dependency blocked or max retries |
| `failed-parity` | Verification oracle failed — needs retry |

### Transition Rules

- `planned → in-progress`: All `dependsOn` tasks must be `verified`
- `in-progress → implemented`: Coder completed
- `implemented → verified`: Reviewer approved
- `implemented → failed-parity`: Verification oracle failed
- `failed-parity → in-progress`: Retry (within retry limit)
- `planned → blocked`: A dependency has status `blocked` (cascade blocking)
- `in-progress → blocked`: Max retries exhausted

## Dependency Rules

1. All tasks in `dependsOn` must reach `verified` before the task is eligible
2. If any dependency has `status: blocked`, the task is automatically cascade-blocked
3. No circular dependencies — the planner must validate acyclicity before writing
4. `dependsOn` references must point to valid task IDs within the same graph

## Graph Revision Triggers

The task graph can be revised from multiple sources. All revisions follow the same pattern: a feedback artifact is produced, the planner is re-dispatched to read it and mutate `task-graph.json`, and the execution coordinator picks up changes naturally.

### Gap-Hunting Revision

1. **Gap hunters** run after verification and produce `gap-report.json` with findings referencing task IDs
2. **Planner specialist** is re-dispatched to read the gap report and mutate `task-graph.json`:
   - Add new tasks for discovered gaps (`addedInRevision` = current revision, `addedBy` = planner name)
   - Annotate existing tasks with source `gap-hunting`
   - Reset `failed-parity` tasks to `planned` if fixes are needed
3. **Execution coordinator** picks up new/reset tasks naturally via the dependency gate
4. Convergence = zero new tasks or annotations from gap hunting

### Human Feedback

The orchestrator checks for `.<domain>/human-feedback.md` after each execution cycle (i.e., after the execution coordinator completes a pass over eligible tasks). If the file exists and has not been consumed:

1. Orchestrator detects the file and re-dispatches the **planner specialist** with the feedback
2. Planner reads `human-feedback.md`, creates new tasks or annotates existing ones with source `manual`
3. Orchestrator renames the file to `human-feedback-rev-{N}.md` (consumed archive) so it is not re-processed
4. Execution coordinator picks up new/modified tasks naturally

Humans can drop `human-feedback.md` at any point during execution. The file is freeform Markdown — the planner interprets it. This is the primary HITL entry point; it requires no new agents or infrastructure.

**Timing**: Human feedback is only actionable once execution has begun (after discovery, analysis, and initial planning have seeded the artifacts). Checking after each execution cycle gives the human visibility into implementation results before providing course corrections.

### Verification-Driven Revision

When oracle validators report failures in `verification-matrix.json`, the orchestrator can re-dispatch the planner to annotate affected tasks with source `verification` and adjust acceptance criteria or invariants.

### Analysis Re-Entry

When gap hunting or human feedback triggers analysis re-entry (new items discovered that need deep analysis before planning), the analysis pass runs first, then the planner is re-dispatched with the updated analysis artifacts. New tasks get source `analysis`.

## Examples

### Two tasks with a dependency edge

```json
{
  "tasks": [
    {
      "id": "T-001",
      "name": "Migrate user authentication",
      "description": "Port the login/logout flow from legacy auth to the new OAuth2 provider",
      "featureIds": ["F-003", "F-004"],
      "dependsOn": [],
      "status": "planned",
      "priority": 1,
      "scope": {
        "sourceFiles": ["src/auth/login.ts", "src/auth/session.ts"],
        "targetPattern": "New auth module under app/auth/",
        "boundaryNotes": "Do NOT touch the admin auth flow (F-012) — separate task"
      },
      "acceptanceCriteria": [
        "Login flow produces valid JWT with same claim structure as legacy",
        "Session timeout matches legacy 30-minute window",
        "Failed login returns identical error codes"
      ],
      "invariants": [
        "Session tokens expire after exactly 30 minutes of inactivity",
        "Failed login attempts are rate-limited to 5 per minute per IP"
      ],
      "verificationOracles": ["journey", "auth-parity"],
      "addedBy": "migration-slice-planner",
      "addedInRevision": 0,
      "annotations": []
    },
    {
      "id": "T-002",
      "name": "Migrate user profile page",
      "description": "Port the profile view/edit page, which depends on the auth session",
      "featureIds": ["F-007"],
      "dependsOn": ["T-001"],
      "status": "planned",
      "priority": 2,
      "scope": {
        "sourceFiles": ["src/pages/profile.tsx", "src/api/user.ts"],
        "targetPattern": "New profile page under app/profile/",
        "boundaryNotes": "Profile photo upload is a separate task (T-005)"
      },
      "acceptanceCriteria": [
        "Profile page renders all fields from legacy: name, email, avatar, bio",
        "Edit form validates email format identically to legacy"
      ],
      "invariants": [
        "Profile edits are persisted within 2 seconds",
        "Email format validation rejects the same inputs as legacy"
      ],
      "verificationOracles": ["journey", "contract"],
      "addedBy": "migration-slice-planner",
      "addedInRevision": 0,
      "annotations": []
    }
  ]
}
```
