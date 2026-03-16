# Fractal Coordinator Patterns — Romantic Fantasy Writer

## Purpose

Coordinators are **pure routers** in the romantic-fantasy-writer system. They never write creative content themselves — they dispatch specialists, read their status files, and make routing decisions. This skill documents the specific patterns used across all 9 phase coordinators and 10 sub-coordinators.

## Core Pattern: Writer → Auditor Loop

Every creative phase follows the same structure:

```
Coordinator dispatches writers (sequentially or via sub-coordinators)
  → All writers complete
  → Coordinator dispatches auditor
  → Auditor returns passed/failed
    → passed: Coordinator writes own status as "complete"
    → failed (iteration < maxAuditorRetries):
        Coordinator deletes resetOnRetry statuses
        Coordinator re-dispatches writers with feedback path
        Coordinator re-dispatches auditor
    → failed (iteration >= maxAuditorRetries):
        Coordinator writes own status as "blocked"
```

### Key Parameters
- `maxAuditorRetries`: 3 (from convergenceBounds)
- Iteration counter tracks the current attempt number
- Feedback artifact path: `audit-reports/{phase}/gate.json` — writers MUST read this on retry

## Depth-2 Coordinators (Simple Phases)

These coordinators dispatch specialists directly:

| Coordinator | Specialists | Auditor |
|-------------|-----------|---------|
| concept-coordinator | concept-developer → craft-profile-selector | concept-auditor |
| style-coordinator | style-analyzer → style-guide-writer | style-auditor |
| revision-coordinator | developmental-editor → line-editor → copy-editor → chapter-reviser | revision-auditor |
| polish-coordinator | polisher → summary-generator → delivery-assembler | *(no auditor)* |

**Dispatch order matters.** In revision, developmental editing must complete before line editing, which must complete before copy editing. The coordinator reads each specialist's status before dispatching the next.

## Depth-3 Coordinators (Complex Phases)

These coordinators dispatch sub-coordinators, which in turn dispatch specialists:

| Coordinator | Sub-Coordinators | Auditor |
|-------------|-----------------|---------|
| worldbuilding-coordinator | physical-world-coordinator, systems-world-coordinator | worldbuilding-auditor |
| character-coordinator | core-characters-coordinator, ensemble-coordinator | character-auditor |
| plotting-coordinator | structural-design-coordinator, chapter-design-coordinator | plotting-auditor |
| drafting-coordinator | creative-writing-coordinator, quality-integration-coordinator | drafting-auditor |
| beta-reading-coordinator | genre-lens-coordinator, craft-lens-coordinator | beta-reading-auditor |

### Cascade Reset on Retry
When a depth-3 auditor rejects, the coordinator must delete status files for ALL agents underneath it — sub-coordinators and their specialists. This is the `resetOnRetry` cascade:

```
worldbuilding-coordinator retry:
  Delete: physical-world-coordinator/status.json
  Delete: systems-world-coordinator/status.json
  Delete: geography-builder/status.json
  Delete: culture-builder/status.json
  Delete: history-builder/status.json
  Delete: magic-system-designer/status.json
  Delete: political-structure-builder/status.json
  Delete: worldbuilding-auditor/status.json
```

All agents then re-run from scratch, but this time with access to the auditor's feedback in `audit-reports/{phase}/gate.json`.

## Per-Chapter Iteration

Three phases iterate per-chapter: drafting, revision, and beta-reading.

The **orchestrator** manages the chapter counter in `progress.json.currentChapter`. For each chapter:
1. Dispatch drafting-coordinator for chapter N
2. Dispatch continuity-tracker after chapter N completes
3. After all chapters drafted, dispatch revision-coordinator for chapter N
4. After all chapters revised, dispatch beta-reading-coordinator

### Checkpoint Pattern
After every `maxChaptersBeforeCheckpoint` (default: 5) chapters, the orchestrator checks continuity state and may trigger craft-tracker updates.

## Parallel Fan-Out (Beta Reading)

Beta-reading-coordinator dispatches genre-lens-coordinator and craft-lens-coordinator **simultaneously**. Within each:
- genre-lens-coordinator fans out: romance-beta-reader + fantasy-beta-reader (parallel)
- craft-lens-coordinator fans out: craft-beta-reader + sensitivity-beta-reader + originality-beta-reader (parallel)

If any reader blocks, its coordinator propagates `blocked`. The beta-reading-coordinator aggregates: if either lens-coordinator is blocked, the whole beta phase is blocked.

## Routing Decision Tree

Every coordinator follows this exact read-dispatch loop:

```
1. Read all children's status.json files
2. Find the first child whose status is "missing" → dispatch it
3. If all children have statuses:
   a. Any child "blocked" → write own status "blocked"
   b. All children "completed"/"complete" → dispatch auditor (or write "complete" if no auditor)
   c. Auditor "passed" → write own status "complete"
   d. Auditor "failed" + retries left → cascade reset + re-dispatch
   e. Auditor "failed" + no retries → write own status "blocked"
```

This decision tree is identical across all coordinators. The only differences are which children they dispatch and phase-specific artifact expectations.
