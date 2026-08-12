# Fractal Factory — Routing Architecture

Execution path reference for the Fractal Factory pipeline. Documents coordinator dispatch order, graph-driven execution flow, gap-hunting re-entry, and failure handling.

## Path Index

| ID | Name | Entry Condition | Terminal State |
|---|---|---|---|
| P-01 | Happy Path | All passes succeed, gap hunting converges | `delivered` |
| P-02 | Graph Re-Entry | Gap-hunting coordinator reports `gaps-found` within cycle limit | Re-enters P-01 at execution |
| P-03 | Forced Convergence | Gap-hunting coordinator reports `gaps-found` at max cycles | `delivered-with-gaps` |
| P-04 | Discovery Blocked | Discovery coordinator returns `blocked` | `failed` |
| P-05 | Analysis Failed | Analysis coordinator returns `failed` | `failed` |
| P-06 | Planning Failed | Planning coordinator returns `failed` | `failed` |
| P-07 | Execution Failed | Execution coordinator returns `failed` | `failed` |
| P-08 | Execution Partial | Execution returns `complete-with-blocked` | Continues to verification |
| P-09 | Verification Failed | Verification coordinator returns `failed` | `failed` |
| P-10 | Gap-Hunting Failed | Gap-hunting coordinator returns `failed` | `delivered-with-gaps` |
| P-11 | Crash Recovery | Active pass found on startup | Resets to pending, re-dispatches |
| P-12 | Knowledge Curator Cold Start | No meta store available | Pass 0 completes without prior knowledge |
| P-13 | Knowledge Curator Failed | Knowledge curator returns `failed` | Pass 0 completes in degraded mode |
| P-14 | Synthesis Degraded | Synthesis returns `degraded` or `failed` | Continues to delivery |

## Path Descriptions

### P-01: Happy Path

```
Pass 0 → Pass 1 → Pass 2 → Pass 3 → Pass 4 → Pass 5 → Pass 6 → Synthesis → Pass 7
  ↓        ↓        ↓        ↓        ↓        ↓        ↓          ↓          ↓
curator  disc-c   anal-c   plan-c   exec-c   veri-c   gaph-c    synth-c    delv-c
           ↓        ↓        ↓        ↓        ↓        ↓          ↓          ↓
        scanr    p-arch    rost-p   p-writ   chk-v   cov-h      f-sig     packgr
        inv-x    art-d     rout-p   p-revw   aud-o   art-h      c-sig     doc-wr
        ast-a    dep-a     test-p   infr-w           inf-h      k-int     rpt-wr
        exm-a               p-graph
```

Planning produces `production-graph.json`. The execution coordinator repeatedly selects one eligible task from the graph, runs `prompt-writer` then `prompt-reviewer`, updates task state, and continues until all tasks are `verified` or `blocked`. Gap hunting finds no new mutations, so the pipeline proceeds to synthesis and delivery. Orchestrator writes `result: "delivered"`.

### P-02: Graph Re-Entry

Triggered when gap-hunting-coordinator returns `result: "gaps-found"` and `gapHunting.currentCycle < maxCycles`.

1. Gap hunters have already mutated `production-graph.json`
2. Orchestrator increments `gapHunting.currentCycle` in `progress.json`
3. Orchestrator resets only `execution`, `verification`, and `gapHunting` passes to `pending`
4. Orchestrator deletes status.json for agents in those three passes
5. Pass 0, discovery, analysis, planning, and synthesis remain untouched
6. Routing resumes from execution, which naturally picks up newly added or re-planned tasks from the graph

**Pass-to-agent mapping for status deletion:**

| Pass | Agents (status.json deleted on reset) |
|---|---|
| execution | prompt-writer, prompt-reviewer, infra-writer, execution-coordinator |
| verification | checklist-validator, audit-oracle, verification-coordinator |
| gapHunting | coverage-hunter, artifact-hunter, infrastructure-hunter, gap-hunting-coordinator |

### P-03: Forced Convergence

Triggered when gap-hunting returns `gaps-found` but `gapHunting.currentCycle >= maxCycles`.

1. Orchestrator sets gapHunting to `completed`
2. Pipeline advances to synthesis and delivery
3. Delivery artifacts report tasks that remain `blocked`, `planned`, `implemented`, or annotated with unresolved gaps
4. Orchestrator writes `result: "delivered-with-gaps"`

### P-04 through P-07: Coordinator Failures

Any coordinator returning `result: "failed"` halts the pipeline:

1. Orchestrator writes own status with `result: "failed"` and summary referencing the failing coordinator
2. No further passes are dispatched
3. All completed artifacts remain available for debugging

### P-08: Execution Partial

Execution coordinator returns `result: "complete-with-blocked"`:
- Some graph tasks exhausted writer-reviewer retries and were marked `blocked`
- Pipeline continues to verification and gap hunting
- Delivery reports blocked tasks explicitly

### P-09: Verification Failed

Verification coordinator returns `result: "failed"`:
- Cross-reference safety-net validation found systemic issues
- Pipeline halts and orchestrator writes `result: "failed"`

### P-10: Gap-Hunting Failed

Gap-hunting coordinator returns `result: "failed"`:
- All three specialist hunters failed
- Orchestrator treats this as forced convergence
- Pipeline advances to synthesis then delivery
- Orchestrator writes `result: "delivered-with-gaps"`

### P-11: Crash Recovery

On startup, orchestrator detects `passes.X.status == "active"`:

1. Reset the active pass to `pending`
2. Delete the active coordinator's status.json
3. Resume routing from that pass

Children with completed status files are reused unless that pass is part of execution/verification/gap-hunting re-entry.

### P-12 & P-13: Pass 0 Degraded/Failed

Knowledge curator returns `cold-start` or `failed`:
- Pass 0 is marked `completed`
- Pipeline continues without `knowledge-brief.json`
- Later passes operate without prior meta-knowledge context

### P-14: Synthesis Degraded

Synthesis coordinator returns `degraded` or `failed`:
- Meta-knowledge integration did not fully succeed
- Delivery still proceeds
- Produced system artifacts remain usable

## Coordinator Dispatch Sequences

### Discovery Coordinator (Pass 1)

```
domain-scanner → invariant-extractor → asset-auditor → exemplar-analyzer
```

Sequential. Each specialist reads the evolving `domain-model.json` and writes its own additions without deleting prior entries.

### Analysis Coordinator (Pass 2)

```
pipeline-architect → artifact-designer → depth-analyzer
```

Sequential. Produces `architecture.json` and depth decisions. Analysis is not re-entered after gap hunting in the graph model.

### Planning Coordinator (Pass 3)

```
roster-planner → routing-planner → test-planner → production-graph-planner
```

Sequential. Produces the stateless design artifacts plus `production-graph.json`, which becomes the sole runtime-state artifact for execution.

### Execution Coordinator (Pass 4)

```
select next eligible graph task
→ prompt-writer
→ prompt-reviewer
→ on reject: retry same task up to 3 times
→ on approve: mark task verified and select next task
→ when no eligible tasks remain: infra-writer
```

The execution coordinator drives a dependency-gated single-task loop.

1. Read `production-graph.json`
2. Select the highest-priority task with `status: planned` whose `dependsOn` tasks are all `verified`
3. Dispatch `prompt-writer` for that task only
4. Dispatch `prompt-reviewer` for that same task
5. On approval, run the task's verification hooks and mark it `verified`
6. On rejection below retry limit, mark task `failed-review` and retry writer with feedback
7. On exhausted retries, mark task `blocked`
8. After all tasks are terminal or no eligible tasks remain, run `infra-writer`

New work discovered by gap hunters appears directly in `production-graph.json`, so re-entry requires no roster mutation and no batch selection.

### Verification Coordinator (Pass 5)

```
checklist-validator → audit-oracle
```

Sequential. This pass is now a post-completion safety net. Primary verification happens per task during execution via task-level verification hooks.

### Gap-Hunting Coordinator (Pass 6)

```
coverage-hunter → artifact-hunter → infrastructure-hunter
```

The gap-hunting coordinator dispatches the three specialist hunters sequentially. Each hunter mutates `production-graph.json` directly by either:
- adding new tasks with `addedBy` and `addedInCycle`, or
- annotating existing tasks with `gapAnnotations` and resetting them to `planned`

The coordinator then observes graph mutations for the current cycle and returns:
- `converged` if no new tasks or annotations were added
- `gaps-found` if any mutations occurred

### Synthesis Coordinator (Post-convergence)

```
factory-signal-analyzer → context-signal-analyzer → knowledge-integrator
```

Sequential. Synthesizes reusable learnings from the run, including process failures and repeated gap patterns.

### Delivery Coordinator (Pass 7)

```
packager → documentation-writer → report-writer
```

Sequential. Uses `production-graph.json` and the verification artifacts to summarize final system state and any outstanding issues.

## Progress State Machine

### Pass States

```
pending ──→ active ──→ completed
  ↑                         │
  └─────── (re-entry) ──────┘
```

- `pending`: Not yet started, or reset by re-entry
- `active`: Currently executing
- `completed`: Coordinator returned a result

Only `execution`, `verification`, and `gapHunting` re-enter after gap detection.

### Task States in production-graph.json

```
planned → in-progress → implemented → verified
   │                         │
   └────→ failed-review ─────┘
   └────────────────────────→ blocked
```

- `planned`: Ready or waiting on dependencies
- `in-progress`: Currently assigned to writer/reviewer loop
- `implemented`: Writer output exists and is awaiting final validation
- `verified`: Task fully accepted
- `failed-review`: Reviewer rejected current attempt
- `blocked`: Retry budget exhausted or progress impossible

### Gap-Hunting Cycle

```
Pass 6 active → hunters mutate graph → mutations found?
                         │                  │
                        no                 yes
                         │                  │
                         ↓             cycle < max?
                   converged            │        │
                                        yes      no
                                         │        │
                                         ↓        ↓
                                   re-enter    forced
                                   execution  convergence
```

## Artifact Dependency Graph

```
context.json
    │
    ├──→ knowledge-brief.json (Pass 0, optional)
    │
    ├──→ domain-model.json + invariants/*.json (Pass 1)
    │        │
    │        ├──→ architecture.json (Pass 2)
    │        │        │
    │        │        ├──→ roster.json (Pass 3)
    │        │        ├──→ test-plan.json (Pass 3)
    │        │        └──→ production-graph.json (Pass 3)
    │        │                     │
    │        │                     ├──→ produced-output/agents/*.agent.md (Pass 4)
    │        │                     ├──→ produced-output/bootstrap.sh (Pass 4)
    │        │                     ├──→ produced-output/schemas/*.md (Pass 4)
    │        │                     └──→ gap mutations (Pass 6)
    │        │
    │        ├──→ verification-report.json (Pass 5)
    │        └──→ audit-report.json (Pass 5)
    │
    ├──→ meta/index.json + entries/ (Synthesis)
    │
    └──→ packaging-report.json (Pass 7)
```

## Directive Propagation

### Gap Context Flow

Gap context now lives on task nodes in `production-graph.json`:

```
production-graph.json
    │
    ├──→ execution-coordinator (selects re-planned or newly added tasks)
    │        ├──→ prompt-writer (reads constraintRefs, acceptanceCriteria, gapAnnotations)
    │        └──→ prompt-reviewer (checks acceptanceCriteria and verificationHooks)
    │
    ├──→ report-writer (summarizes unresolved annotations and blocked tasks)
    └──→ packager/documentation-writer (final outstanding work reporting)
```

Analysis and planning are not re-entered. Gap hunters express all required follow-up work as graph mutations, and execution picks it up directly.

### Convergence Limits

- `maxGapCycles` from `context.json` bounds the re-entry loop
- Each dirty cycle increments `gapHunting.currentCycle` in `progress.json`
- At max cycles, orchestrator forces convergence regardless of remaining mutations
- Hunters must avoid duplicate task creation and should annotate existing tasks when the gap is best addressed by rework

## Error Classification

| Category | Examples | Pipeline Effect |
|---|---|---|
| Fatal | Discovery blocked, coordinator failed, verification safety-net failure | Pipeline halts, `result: "failed"` |
| Degraded | Execution returns `complete-with-blocked`, forced convergence | Pipeline continues, `delivered-with-gaps` possible |
| Non-fatal | Pass 0 cold start, synthesis degraded | Pipeline continues without optional data |
| Recoverable | Crash with active pass, graph re-entry after gaps | Reset pass to pending, re-dispatch |

### Coordinator Result Code Summary

| Coordinator | Success | Degraded | Failed |
|---|---|---|---|
| knowledge-curator | `curated` | `cold-start` | `failed` |
| discovery-coordinator | `complete` | — | `blocked` |
| analysis-coordinator | `complete` | — | `failed` |
| planning-coordinator | `complete` | — | `failed` |
| execution-coordinator | `complete` | `complete-with-blocked` | `failed` |
| verification-coordinator | `verified` | — | `failed` |
| gap-hunting-coordinator | `converged` | `gaps-found` | `failed` |
| synthesis-coordinator | `synthesized` | `degraded` | `failed` |
| delivery-coordinator | `complete` | — | — |

### Gap-Hunting Specialist Result Code Summary

| Specialist | Success | Degraded | Failed |
|---|---|---|---|
| coverage-hunter | `clean` | `dirty` | `failed` |
| artifact-hunter | `clean` | `dirty` | `failed` |
| infrastructure-hunter | `clean` | `dirty` | `failed` |
