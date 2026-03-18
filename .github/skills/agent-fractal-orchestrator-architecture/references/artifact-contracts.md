# Artifact Contracts

Complete reference for the shared artifact system. Every fractal orchestrator system uses these artifact types.

## Directory Structure

```
.<domain>/                           # Root artifact directory
├── context.json                     # Task parameters (user fills before launch)
├── progress.json                    # Pipeline progress counters (orchestrator manages)
├── manifest.json                    # Prepend-only audit log (all agents append)
├── <inventory-file>.json            # Domain-specific inventory (discovery agents write)
├── <analysis-file>.json             # Deep analysis per item (analysis agents write)
├── <dependency-file>.json           # Relationship graph (dependency analyzer writes)
├── task-graph.json                  # Dependency-ordered execution tasks (planner writes, execution coordinator updates status). Schema: produced-task-graph.schema.md
├── <risk-register>.json             # Per-slice risks (risk analyzer writes)
├── <verification-matrix>.json       # Oracle results per slice (verification agents write)
├── agents/                          # Per-agent working directories
│   ├── <agent-name>/
│   │   ├── status.json              # Routing signal (agent writes on completion)
│   │   └── output.md               # Narrative output (agent writes)
│   └── ...
└── <work-units>/                    # Per-unit working directories (optional)
    ├── <unit-id>/
    │   ├── output.md               # Implementation details
    │   ├── review.md               # Reviewer feedback
    │   └── tests.md                # Test details
    └── ...
```

## context.json

User-provided task parameters. The bootstrap script creates a template; the user fills it in before launching the orchestrator.

```json
{
  "version": 1,
  "domain": "<what-is-being-processed>",
  "source": {
    "codePath": "<path/to/source>",
    "description": "Brief description of what we're working with"
  },
  "target": {
    "outputDirectory": "<where-results-go>",
    "description": "Brief description of the desired outcome"
  },
  "parameters": {
    "key1": "value1"
  }
}
```

The `parameters` object is domain-specific. Migration needs `sourceFramework`, `targetFramework`, etc. Security audit needs `complianceStandard`, `scanDepth`, etc. Design this per domain.

## progress.json

Managed exclusively by the session orchestrator. Provides at-a-glance pipeline status.

```json
{
  "version": 1,
  "lastUpdated": "<timestamp>",
  "currentPass": 1,
  "passStatus": {
    "pass1_discovery": "not-started | in-progress | completed",
    "pass2_analysis": "not-started | in-progress | completed",
    "pass3_planning": "not-started | in-progress | completed",
    "pass4_execution": "not-started | in-progress | completed",
    "pass5_verification": "not-started | in-progress | completed",
    "pass6_gapHunting": "not-started | in-progress | completed | converged",
    "pass7_delivery": "not-started | in-progress | completed"
  },
  "counts": {
    "itemsDiscovered": 0,
    "itemsAnalyzed": 0,
    "unitsPlanned": 0,
    "unitsImplemented": 0,
    "unitsVerified": 0,
    "unitsBlocked": 0,
    "unitsFailedParity": 0
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "newItemsPerCycle": [],
    "converged": false
  }
}
```

The orchestrator recomputes `counts` by reading the actual artifact files (inventory, task-graph, verification-matrix) — not by trusting agent summaries. This ensures consistency.

- `counts.unitsPlanned` = `task-graph.json.summary.byStatus.planned`
- `counts.unitsImplemented` = `task-graph.json.summary.byStatus.implemented + verified`
- `counts.unitsVerified` = `task-graph.json.summary.byStatus.verified`
- `counts.unitsBlocked` = `task-graph.json.summary.byStatus.blocked`
- `counts.unitsFailedParity` = `task-graph.json.summary.byStatus.failed-parity`

## status.json (Universal Agent Status)

Every agent writes this upon completion. The parent reads it for routing.

```json
{
  "agent": "<agent-name>",
  "task_id": "<hierarchical/task/path>",
  "status": "completed | failed",
  "result": "<fixed-vocabulary-result-code>",
  "summary": "<~100 token routing summary>",
  "artifacts": ["<relative-path-from-agents-dir>"],
  "next_hint": "<suggested-next-agent | null>",
  "iteration": 1
}
```

### Result Code Vocabulary

Define a fixed vocabulary per agent role. Common codes:

| Agent Role | Possible `result` Codes |
|---|---|
| Discovery mapper | `discovered` |
| Semantics analyzer | `deepened` |
| Dependency analyzer | `deepened` |
| Slice planner | `planned` |
| Risk analyzer | `planned` |
| Coder | `implemented` |
| Reviewer | `approved`, `rejected` |
| Test writer | `tested` |
| Oracle validator | `pass`, `fail`, `skipped` |
| Parity aggregator | `verified`, `failed-parity`, `incomplete-verification` |
| Gap hunter | `clean` (nothing found), `dirty` (items found) |
| Hardening checker | `hardened` |
| Documentation writer | `documented` |
| Handoff writer | `delivered` |

**Result codes are a routing API.** They must be:
- One word or hyphenated compound
- Fixed per agent (no ad-hoc codes)
- Documented in the agent's prompt
- Handled in the parent's routing table

## manifest.json (Audit Log)

Prepend-only array. Each agent adds an entry at index 0 upon completion.

```json
[
  {
    "timestamp": "2025-01-15T10:30:00Z",
    "agent": "feature-mapper-ui",
    "artifacts": ["feature-mapper-ui/output.md"],
    "status": "completed",
    "result": "discovered",
    "iteration": 1
  },
  ...older entries...
]
```

## Inventory File

The shared registry of discovered items. Written by discovery agents using read-modify-write.

```json
{
  "version": 1,
  "lastUpdated": "<timestamp>",
  "summary": {
    "totalItems": 0,
    "byDomain": {},
    "byStatus": {}
  },
  "items": {
    "<ITEM-ID>": {
      "id": "<ITEM-ID>",
      "name": "Human-readable name",
      "domain": "<domain-key>",
      "status": "discovered | analyzed | planned | implemented | verified",
      "confidence": 0.8,
      "source": {
        "files": ["path/to/source"],
        "evidence": "Why we believe this item exists"
      },
      "unknowns": ["Things we couldn't determine"],
      "dependencies": [],
      "lastUpdatedBy": "<agent-name>",
      "lastUpdatedAt": "<timestamp>"
    }
  }
}
```

### ID Scheme

Item IDs follow `<PREFIX>-NNN` format:
- Prefix is domain-dependent (F for features, V for vulnerabilities, T for test targets)
- NNN is zero-padded sequential (001, 002, ...)
- Each discovery agent finds the current max ID and increments

### Read-Modify-Write Protocol

When adding items to a shared file:
1. Read the entire file
2. Find the highest existing ID to determine the next ID
3. Add your entries without modifying existing entries
4. Recompute `summary` fields from the full data
5. Write the file

**Domain scoping:** Each discovery agent only adds items for its domain and only modifies its own entries (identified by domain key). It preserves all entries from other domains.

## Task Graph (Execution Slices)

The decomposition of analyzed items into ordered execution units.

```json
{
  "version": 1,
  "lastUpdated": "<timestamp>",
  "summary": {
    "totalSlices": 0,
    "byStatus": {}
  },
  "slices": [
    {
      "id": "S-001",
      "name": "Descriptive slice name",
      "description": "What this slice accomplishes",
      "itemIds": ["F-001", "F-002"],
      "dependsOn": [],
      "scope": {
        "sourceFiles": ["what to read"],
        "targetFiles": ["what to write"]
      },
      "invariants": [
        "Copied from analysis matrix — not referenced, inlined"
      ],
      "acceptanceCriteria": [
        "Testable criteria (not vague)"
      ],
      "verificationOracles": ["journey", "contract"],
      "status": "planned | in-progress | implemented | verified | failed-parity | blocked",
      "attempts": 0,
      "maxAttempts": 3
    }
  ]
}
```

### Critical: Inline Invariants

Invariants in slices are COPIED from the analysis matrix, not referenced by ID. This ensures the coder and reviewer see the invariants directly in the slice spec — they don't need to chase cross-references.

### Critical: Dependency Ordering

Slices must be ordered so that no slice has an unresolved `dependsOn`. Validation rule: for each slice, all slices in `dependsOn` must appear earlier in the array.

## Verification Matrix

Per-slice oracle results. Written by oracle validators, read by parity aggregator.

```json
{
  "version": 1,
  "lastUpdated": "<timestamp>",
  "slices": {
    "S-001": {
      "<oracle-type>": {
        "status": "pass | fail | skipped",
        "summary": "Oracle-specific result",
        "details": "<agent-name>/S-001-<oracle>.md",
        "checkedAt": "<timestamp>",
        "checkedBy": "<agent-name>"
      },
      "_aggregate": {
        "status": "verified | failed-parity | incomplete-verification",
        "oraclesPassed": 2,
        "oraclesFailed": 0,
        "oraclesSkipped": 0,
        "checkedAt": "<timestamp>",
        "checkedBy": "parity-checker"
      }
    }
  }
}
```

## Risk Register

Per-slice risks with mitigations.

```json
{
  "version": 1,
  "lastUpdated": "<timestamp>",
  "summary": {
    "totalRisks": 0,
    "bySeverity": {},
    "byCategory": {}
  },
  "risks": [
    {
      "id": "R-001",
      "unitId": "S-001",
      "itemIds": ["F-001"],
      "severity": "critical | high | medium | low",
      "category": "<domain-specific-category>",
      "description": "What could go wrong",
      "mitigation": "Specific action to mitigate (never 'be careful')",
      "status": "open | resolved | accepted",
      "addedBy": "<agent-name>",
      "addedAt": "<timestamp>",
      "resolvedBy": null,
      "resolvedAt": null
    }
  ]
}
```
