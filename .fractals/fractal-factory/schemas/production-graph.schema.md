# production-graph.json Schema

The production graph is the **sole runtime-state artifact** for execution. It decomposes the produced system into discrete tasks with explicit dependency edges, per-task acceptance criteria, and verification hooks. The execution coordinator selects tasks by dependency readiness rather than roster status or batch ordering.

Created by the production-graph-planner during Pass 3 (Planning). Mutated during execution (status transitions), verification (hook results), and gap hunting (new tasks, annotations).

## Schema

```json
{
  "version": 1,
  "lastUpdated": "<ISO-8601-UTC>",

  "tasks": [
    {
      "id": "T-001",
      "name": "<descriptive task name>",
      "description": "<what this task produces and why>",
      "category": "<category enum value>",

      "rosterAgentIds": ["<A-nnn IDs from roster.json that this task covers>"],
      "dependsOn": ["<T-nnn IDs that must be verified before this task can start>"],

      "status": "planned | in-progress | implemented | verified | blocked | failed-review",
      "priority": "<number, lower = higher priority>",

      "scope": {
        "constraintRefs": {
          "rosterEntry": "<A-nnn — the roster entry this task implements, if applicable>",
          "architecturePass": "<pass name from architecture.json, if applicable>",
          "testScenarios": ["<TS-nnn IDs from test-plan.json, if applicable>"],
          "invariants": ["<INV-nnn IDs from invariants/*.json that this task must enforce>"]
        }
      },

      "acceptanceCriteria": [
        "<criterion 1 — specific, verifiable>",
        "<criterion 2>"
      ],

      "verificationHooks": ["<hook enum values that apply to this task>"],

      "retryHistory": [
        {
          "attempt": 1,
          "result": "failed-review",
          "feedback": "<reviewer feedback summary>",
          "timestamp": "<ISO-8601-UTC>"
        }
      ],

      "addedBy": "<agent name that created this task — production-graph-planner for initial tasks, hunter names for gap-added tasks>",
      "addedInCycle": 0,

      "gapAnnotations": [
        {
          "annotatedBy": "<hunter agent name>",
          "cycle": 1,
          "description": "<what gap was found in this task>",
          "severity": "critical | warning",
          "suggestedFix": "<how to address the gap>"
        }
      ]
    }
  ],

  "summary": {
    "totalTasks": "<number>",
    "byStatus": {
      "planned": "<number>",
      "in-progress": "<number>",
      "implemented": "<number>",
      "verified": "<number>",
      "blocked": "<number>",
      "failed-review": "<number>"
    },
    "byCategory": {
      "orchestrator-prompt": "<number>",
      "coordinator-prompt": "<number>",
      "specialist-prompt": "<number>",
      "guide-prompt": "<number>",
      "skill": "<number>",
      "schema": "<number>",
      "bootstrap": "<number>",
      "documentation": "<number>",
      "test-fixture": "<number>"
    }
  }
}
```

## Task Status Lifecycle

```
planned ──→ in-progress ──→ implemented ──→ verified
  │              │                │
  │              │                └──→ failed-review ──→ in-progress (retry)
  │              │
  │              └──→ blocked (dependency unresolvable or max retries exhausted)
  │
  └──→ blocked (dependency task is blocked)
```

- **planned**: Task created by production-graph-planner or gap hunter. Not yet started.
- **in-progress**: Execution coordinator has dispatched a writer for this task.
- **implemented**: Writer completed the task. Awaiting reviewer verification.
- **verified**: Reviewer approved. Per-task verification hooks passed.
- **blocked**: Task cannot proceed — either a dependency is blocked or max retries exhausted.
- **failed-review**: Reviewer rejected. Will be retried (transitions back to in-progress).

## Category Enum

| Category | Description |
|---|---|
| `orchestrator-prompt` | Session orchestrator `.agent.md` file |
| `coordinator-prompt` | Coordinator `.agent.md` file |
| `specialist-prompt` | Specialist `.agent.md` file |
| `guide-prompt` | Guide `.agent.md` file |
| `skill` | Shared workflow router skill, auxiliary skill, or per-specialist reference files |
| `schema` | Artifact schema documentation |
| `bootstrap` | Bootstrap script |
| `documentation` | README, architecture docs, user guide |
| `test-fixture` | Golden test scenario files |

## Verification Hook Types

Each task declares which verification hooks apply. The prompt-reviewer runs these hooks per-task during the execution pass.

| Hook | Description | Applies To |
|---|---|---|
| `structural-checklist` | Frontmatter, required sections, section order per produced-agent schema | All prompt categories |
| `routing-audit` | Every child result code has a routing rule; no dead-ends | coordinator-prompt, orchestrator-prompt |
| `contract-check` | Status contract result codes match roster.json; artifact paths valid | All prompt categories |
| `anti-laziness` | Anti-laziness rules present with ≥ 4 rules for adversarial agents | specialist-prompt (where `antiLaziness: true`) |
| `content-check` | Domain-specific references, not generic placeholders | All prompt categories |
| `format-validation` | File shape matches produced-agent template; no freestyle layout | All prompt categories |
| `purity-check` | Coordinator has Purity Rule; does not do substantive work | coordinator-prompt |
| `test-coverage` | Referenced test scenarios exist in test-plan.json | test-fixture |
| `trigger-accuracy` | Workflow phase references match infra-writer contract | skill |

## Hook-to-Category Mapping

| Category | Required Hooks |
|---|---|
| `orchestrator-prompt` | structural-checklist, routing-audit, contract-check, content-check, format-validation |
| `coordinator-prompt` | structural-checklist, routing-audit, contract-check, content-check, format-validation, purity-check |
| `specialist-prompt` | structural-checklist, contract-check, content-check, format-validation |
| `specialist-prompt` (adversarial) | structural-checklist, contract-check, content-check, format-validation, anti-laziness |
| `guide-prompt` | structural-checklist, contract-check, content-check, format-validation |
| `skill` | format-validation, trigger-accuracy |
| `schema` | format-validation, content-check |
| `bootstrap` | format-validation |
| `documentation` | content-check, format-validation |
| `test-fixture` | test-coverage, format-validation |

## ConstraintRefs

Tasks carry references to their source constraints rather than copying content. Writers read the referenced artifacts directly.

| Field | References | Purpose |
|---|---|---|
| `rosterEntry` | `A-nnn` from roster.json | The agent this task implements |
| `architecturePass` | Pass name from architecture.json | Pipeline context for this task |
| `testScenarios` | `TS-nnn` from test-plan.json | Test cases that exercise this task's output |
| `invariants` | `INV-nnn` from invariants/*.json | Domain invariants this task must enforce |

## Dependency Rules

- Specialist tasks depend on their coordinator task (coordinator prompt must be verified first for routing table accuracy).
- Coordinator tasks depend on the orchestrator task (orchestrator defines the pipeline routing).
- Schema tasks have no prompt dependencies (can be written early).
- Skill tasks depend on the specialist tasks they serve (specialist defines the workflow contract).
- Bootstrap depends on all schema and prompt tasks (needs the full directory structure).
- Documentation depends on all prompt and schema tasks (needs accurate agent counts and artifact references).
- Test fixtures depend on the agents they test (need accurate result codes and routing).

## Summary Recomputation

After any status transition, the execution coordinator recomputes the `summary` section by counting tasks per status and per category. This is the source of truth for progress tracking.
