# Fractal Factory — Routing Architecture

Execution path reference for the Fractal Factory pipeline. Documents every path through the system, coordinator dispatch sequences, the progress state machine, and error classification.

## Path Index

| ID | Name | Entry Condition | Terminal State |
|---|---|---|---|
| P-01 | Happy Path | All passes succeed, gap hunting converges | `delivered` |
| P-02 | Gap Re-Entry | Gap-hunting coordinator reports `gaps-found` within cycle limit | Re-enters P-01 at Pass 2 or 3 |
| P-03 | Forced Convergence | Gap-hunting coordinator reports `gaps-found` at max cycles | `delivered-with-gaps` |
| P-04 | Discovery Blocked | Discovery coordinator returns `blocked` | `failed` |
| P-05 | Analysis Failed | Analysis coordinator returns `failed` | `failed` |
| P-06 | Planning Failed | Planning coordinator returns `failed` | `failed` |
| P-07 | Execution Failed | Execution coordinator returns `failed` | `failed` |
| P-08 | Execution Partial | Execution returns `complete-with-blocked` | Continues to verification (P-01) |
| P-09 | Verification With Issues | Verification returns `verified-with-issues` | Continues to gap hunting (P-01) |
| P-10 | Verification Failed | Verification coordinator returns `failed` | `failed` |
| P-11 | Gap-Hunting Failed | Gap-hunting coordinator returns `failed` | `delivered-with-gaps` (forced) |
| P-12 | Crash Recovery | Active pass found on startup | Resets to pending, re-dispatches |
| P-13 | Knowledge Curator Cold Start | No meta/ store available | Pass 0 completes without prior knowledge |
| P-14 | Knowledge Curator Failed | Knowledge curator returns `failed` | Pass 0 completes in degraded mode |
| P-15 | Synthesis Degraded | Synthesis returns `degraded` or `failed` | Continues to delivery (non-fatal) |

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
        exm-a
```

All coordinators return success. Gap hunting converges with zero aggregated gaps. Pipeline proceeds through synthesis to delivery. Orchestrator writes `result: "delivered"`.

### P-02: Gap Re-Entry

Triggered when gap-hunting-coordinator returns `result: "gaps-found"` and `gapHunting.currentCycle < maxCycles`.

1. Orchestrator reads `gap-report.json` → gets `suggestedReEntryPass` (typically `pass2` or `pass3`)
2. Increments `gapHunting.currentCycle` in progress.json
3. Resets all passes from re-entry target through gapHunting to `pending`
4. Deletes status.json for all agents in reset passes (see pass-to-agent mapping below)
5. Does NOT delete `gap-report.json` (coordinators need it for context)
6. Does NOT reset Pass 0 or Synthesis
7. Resumes routing from the reset pass

**Pass-to-agent mapping for status deletion:**

| Pass | Agents (status.json deleted on reset) |
|---|---|
| analysis | pipeline-architect, artifact-designer, depth-analyzer, analysis-coordinator |
| planning | roster-planner, routing-planner, test-planner, planning-coordinator |
| execution | prompt-writer, prompt-reviewer, infra-writer, execution-coordinator |
| verification | checklist-validator, audit-oracle, verification-coordinator |
| gapHunting | coverage-hunter, artifact-hunter, infrastructure-hunter, gap-hunting-coordinator |

### P-03: Forced Convergence

Triggered when gap-hunting returns `gaps-found` but `gapHunting.currentCycle >= maxCycles`.

1. Orchestrator sets gapHunting to `completed`
2. Advances to Synthesis (gap-report.json available for synthesis agents)
3. Advances to delivery — delivery coordinator notes outstanding gaps in the report
4. Orchestrator writes `result: "delivered-with-gaps"`

### P-04 through P-07: Coordinator Failures

Any coordinator returning `result: "failed"` halts the pipeline:

1. Orchestrator writes own status with `result: "failed"` and summary referencing the failing coordinator
2. No further passes are dispatched
3. All completed artifacts remain available for debugging

### P-08: Execution Partial

Execution coordinator returns `result: "complete-with-blocked"`:
- Some agents were blocked (coder-reviewer loop exhausted retries)
- Pipeline continues to verification — partial coverage is better than none
- Blocked agents are recorded in roster.json with `status: "blocked"`

### P-09: Verification With Issues

Verification coordinator returns `result: "verified-with-issues"`:
- Some verification checks failed but didn't block
- Pipeline continues to gap hunting — issues may be caught as gaps
- Issues recorded in verification-report.json

### P-10: Verification Failed

Verification coordinator returns `result: "failed"`:
- Critical verification failure (e.g., no agents could be validated at all)
- Pipeline halts — orchestrator writes `result: "failed"`

### P-11: Gap-Hunting Failed

Gap-hunting coordinator returns `result: "failed"`:
- All 3 specialist hunters failed
- Orchestrator treats as forced convergence — sets gapHunting to `completed`
- Advances to Synthesis then delivery
- Orchestrator writes `result: "delivered-with-gaps"`

### P-12: Crash Recovery

On startup, orchestrator detects `passes.X.status == "active"`:

1. Reset the active pass to `pending`
2. Delete the coordinator's status.json (coordinator will re-dispatch children)
3. Children with existing status.json are skipped (already completed)
4. Resume routing from the reset pass

### P-13 & P-14: Pass 0 Degraded/Failed

Knowledge curator returns `cold-start` (no meta/ store) or `failed`:
- Pass 0 set to `completed` (non-fatal)
- Pipeline continues to Pass 1 without knowledge-brief.json
- Specialists operate without meta-knowledge context (reduced quality but functional)

### P-15: Synthesis Degraded

Synthesis coordinator returns `degraded` or `failed`:
- Meta-knowledge wasn't fully extracted
- Pipeline continues to delivery (non-fatal)
- Future factory runs won't benefit from this run's learnings

## Coordinator Dispatch Sequences

### Discovery Coordinator (Pass 1)

```
domain-scanner → invariant-extractor → asset-auditor → exemplar-analyzer
```

Sequential. Each specialist reads the evolving `domain-model.json` and adds its entries (preserving others via read-modify-write).

### Analysis Coordinator (Pass 2)

```
pipeline-architect → artifact-designer → depth-analyzer
```

Sequential. Pipeline architect creates `architecture.json`, artifact designer adds artifact definitions, depth analyzer adjusts depth levels.

**Re-entry awareness:** If `gap-report.json` exists and the pass was reset, the coordinator passes gap context to each specialist so they can address identified gaps.

### Planning Coordinator (Pass 3)

```
roster-planner → routing-planner → test-planner
```

Sequential. Roster planner creates `roster.json`, routing planner adds routing tables, test planner creates `test-plan.json`.

**Re-entry awareness:** Same gap-context passing as analysis coordinator.

### Execution Coordinator (Pass 4)

```
prompt-writer → prompt-reviewer
(on rejection: loop up to 3 times)
infra-writer
```

The execution coordinator dispatches the prompt-writer once for the full roster, then dispatches the prompt-reviewer against the resulting prompt set, and finally dispatches the infra-writer.

1. Prompt-writer reads `roster.json` and writes prompt files for all agents whose status is `designed`
2. Prompt-reviewer reviews the produced prompt set
3. On rejection (up to 3 retries), the coordinator re-dispatches prompt-writer with reviewer feedback
4. On max retries, the coordinator proceeds with blocked agents noted
5. Infra-writer then generates bootstrap/schema infrastructure

**Re-entry awareness:** The coordinator resets only targeted agents in `roster.json` from `written` back to `designed` before re-dispatching prompt-writer.

### Verification Coordinator (Pass 5)

```
checklist-validator → audit-oracle
```

Sequential. Checklist validator runs structural checks. Audit oracle applies the eval skill perspectives.

### Gap-Hunting Coordinator (Pass 6)

```
coverage-hunter → artifact-hunter → infrastructure-hunter
```

The gap-hunting coordinator dispatches the three specialist hunters sequentially. Each specialist writes its own `output.json`, and the gap-hunting coordinator aggregates those outputs into the unified `gap-report.json`.

### Synthesis Coordinator (Post-convergence)

```
factory-signal-analyzer → context-signal-analyzer → knowledge-integrator
```

Sequential. Factory signal analyzer extracts factory-side learnings. Context signal analyzer extracts domain-side learnings. Knowledge integrator merges both into `meta/` store.

### Delivery Coordinator (Pass 7)

```
packager → documentation-writer → report-writer
```

Sequential. Packager assembles the final output directory. Documentation writer creates user-facing docs. Report writer creates the delivery report.

## Progress State Machine

### Pass States

```
pending ──→ active ──→ completed
  ↑                         │
  └─────── (re-entry) ──────┘
```

- `pending`: Not yet started, or reset by re-entry
- `active`: Currently executing (coordinator dispatched)
- `completed`: Coordinator returned a result

### Gap-Hunting Cycle

```
                    ┌──────────────────────┐
                    ↓                      │
Pass 6 active → specialist hunters run → clean?──┤──yes──→ completed
                                          │
                                     no (dirty)
                                          │
                                   cycle < max?
                                    │         │
                                   yes        no
                                    │         │
                                    ↓         ↓
                              re-entry    completed
                              (P-02)    (forced, P-03)
```

### Orchestrator Terminal States

| Result | Meaning |
|---|---|
| `delivered` | All passes completed, gap hunting converged |
| `delivered-with-gaps` | Forced convergence or all gap-hunting specialists failed |
| `failed` | Critical blocker halted the pipeline |

## Artifact Dependency Graph

```
context.json (user input)
    │
    ├──→ knowledge-brief.json (Pass 0, optional)
    │        │
    │        └──→ [all specialists read if available]
    │
    ├──→ domain-model.json (Pass 1)
    │        │
    │        ├──→ architecture.json (Pass 2)
    │        │        │
    │        │        ├──→ roster.json (Pass 3)
    │        │        │        │
    │        │        │        ├──→ produced-output/agents/*.agent.md (Pass 4)
    │        │        │        ├──→ produced-output/bootstrap.sh (Pass 4)
    │        │        │        └──→ produced-output/schemas/*.md (Pass 4)
    │        │        │
    │        │        └──→ test-plan.json (Pass 3)
    │        │
    │        └──→ verification-report.json (Pass 5)
    │
    ├──→ audit-report.json (Pass 5)
    │
    ├──→ gap-report.json (Pass 6)
    │        │
    │        └──→ [coordinators read on re-entry for gap context]
    │
    ├──→ meta/index.json + entries/ (Synthesis)
    │
    └──→ packaging-report.json (Pass 7)
```

## Directive Propagation

### Gap Context Flow

On re-entry, gap context flows from `gap-report.json` through coordinators to specialists:

```
gap-report.json
    │
    ├──→ analysis-coordinator (reads gap context, passes to children)
    │        ├──→ pipeline-architect (receives targeted gap feedback)
    │        ├──→ artifact-designer (receives targeted gap feedback)
    │        └──→ depth-analyzer (receives targeted gap feedback)
    │
    ├──→ planning-coordinator (reads gap context, passes to children)
    │        ├──→ roster-planner
    │        ├──→ routing-planner
    │        └──→ test-planner
    │
    └──→ execution-coordinator (reads gap context, passes to children)
             ├──→ prompt-writer (re-entry aware: reads progress.json + gap-report.json)
             └──→ prompt-reviewer
```

Coordinators don't just reset — they relay relevant gap items to their specialists so the specialists know what to fix.

### Convergence Limits

- `maxGapCycles` (from context.json) bounds the re-entry loop
- Each cycle increments `gapHunting.currentCycle` in progress.json
- At max cycles, orchestrator forces convergence regardless of the aggregated gap-hunting verdict
- Anti-laziness: gap-hunting specialists must check previous cycle's gaps were addressed

## Error Classification

| Category | Examples | Pipeline Effect |
|---|---|---|
| **Fatal** | Discovery blocked, coordinator crashed without status | Pipeline halts, `result: "failed"` |
| **Degraded** | Execution partial, verification with issues | Pipeline continues with reduced quality |
| **Non-fatal** | Pass 0 cold start, synthesis failed | Pipeline continues without optional data |
| **Recoverable** | Crash with active pass | Reset to pending, re-dispatch |

### Coordinator Result Code Summary

| Coordinator | Success | Degraded | Failed |
|---|---|---|---|
| knowledge-curator | `curated` | `cold-start` | `failed` |
| discovery-coordinator | `complete` | — | `blocked` |
| analysis-coordinator | `complete` | — | `failed` |
| planning-coordinator | `complete` | — | `failed` |
| execution-coordinator | `complete` | `complete-with-blocked` | `failed` |
| verification-coordinator | `verified` | `verified-with-issues` | `failed` |
| gap-hunting-coordinator | `converged` | `gaps-found` | `failed` |
| synthesis-coordinator | `synthesized` | `degraded` | `failed` |
| delivery-coordinator | `complete` | — | — |

### Gap-Hunting Specialist Result Code Summary

| Specialist | Success | Degraded | Failed |
|---|---|---|---|
| coverage-hunter | `clean` | `dirty` | `failed` |
| artifact-hunter | `clean` | `dirty` | `failed` |
| infrastructure-hunter | `clean` | `dirty` | `failed` |
