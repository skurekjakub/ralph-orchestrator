# Pipeline Design Guide

How to adapt the 7-pass pipeline for a specific domain.

## The Universal Pipeline

```
Pass 1: Discovery    — "What exists?"
Pass 2: Analysis     — "What does it do? What are the rules?"
Pass 3: Planning     — "How do we break this into units of work?"
Pass 4: Execution    — "Do the work, unit by unit"
Pass 5: Verification — "Did we do it right?"
Pass 6: Gap Hunting  — "Did we miss anything?"
Pass 7: Delivery     — "Package it for the user"
```

## Domain Mapping Examples

### Codebase Migration (reference implementation)
| Pass | Mapping |
|---|---|
| Discovery | Feature mappers per domain (UI, API, routes, data, jobs, config) |
| Analysis | Semantics extractor (state transitions, invariants, error paths) + dependency analyzer |
| Planning | Slice planner (feature→slice decomposition) + risk analyzer |
| Execution | Coder → reviewer → test-writer loop |
| Verification | Journey validator + contract validator + parity aggregator |
| Gap Hunting | Adversarial search for missed features, uncovered invariants |
| Delivery | Hardening checker + documentation writer + handoff report |

### Security Audit
| Pass | Mapping |
|---|---|
| Discovery | Scanners per domain (auth, network, secrets, dependencies, compliance, data) |
| Analysis | Threat modeler (attack vectors, severity, exploitability) |
| Planning | Remediation planner (prioritized fix units) + risk scorer |
| Execution | Fix implementer → security reviewer loop |
| Verification | Exploit validator + regression tester |
| Gap Hunting | Red team agent (adversarial search for bypasses, missed vectors) |
| Delivery | Compliance report writer + executive summary |

### Test Suite Generation
| Pass | Mapping |
|---|---|
| Discovery | Code scanner per layer (API, services, data, utilities) |
| Analysis | Behavior extractor (inputs, outputs, error cases, edge cases per function) |
| Planning | Test plan builder (coverage targets, priority order by risk/complexity) |
| Execution | Test writer → test verifier loop (run tests, check they pass/fail correctly) |
| Verification | Coverage analyzer + mutation tester |
| Gap Hunting | Uncovered path detector |
| Delivery | Coverage report + CI integration + README |

### Documentation Overhaul
| Pass | Mapping |
|---|---|
| Discovery | Content scanner per type (API docs, guides, READMEs, changelogs, comments) |
| Analysis | Accuracy checker (match docs to actual code behavior) |
| Planning | Rewrite planner (prioritized by staleness, importance, complexity) |
| Execution | Doc writer → accuracy reviewer loop |
| Verification | Link checker + code-doc parity validator |
| Gap Hunting | Undocumented feature scanner |
| Delivery | Index/TOC generator + publishing-ready formatter |

## Deciding Which Passes to Include

**Always include:** 1 (Discovery), 4 (Execution), 7 (Delivery). These are the minimum viable pipeline.

**Include 2 (Analysis) when:** The domain has behavioral rules, invariants, or semantics that must be extracted before planning. Skip when the domain is simple enough that discovery output is sufficient for planning.

**Include 3 (Planning) when:** Execution units need dependency ordering, risk assessment, or decomposition beyond "do each item." Skip when items are independent and can be processed in any order.

**Include 5 (Verification) when:** Correctness matters (code, security, contracts). Skip when the output is advisory (documentation, reports) and verification is just proofreading.

**Include 6 (Gap Hunting) when:** Completeness is critical and items could be missed by discovery. Skip when the subject matter is bounded and enumerable (e.g., a finite list of API endpoints).

## Pipeline Pass Grouping into Coordinators

Group passes into coordinators by natural phase boundaries:

| Coordinator | Owns | Entry Condition | Exit Condition |
|---|---|---|---|
| Discovery Coordinator | Pass 1 | Always first | All domain mappers completed, inventory validated |
| Planning Coordinator | Pass 2–3 | Discovery complete | Analysis complete, slices planned, risks assessed |
| Execution Coordinator | Pass 4 | Planning complete | All slices implemented (or blocked) |
| Verification Coordinator | Pass 5–6 | Execution complete (per slice or batch) | All slices verified, gap hunting converged |
| Delivery Coordinator | Pass 7 | Verification converged | Hardening + docs + handoff complete |

Note: Analysis (Pass 2) and Planning (Pass 3) are grouped under one coordinator because they're sequential with tight dataflow between them. The coordinator uses **mode detection** — which artifact files exist? — to decide which pass to run.

## Re-Entry Design

Re-entry is the mechanism that makes the system self-correcting. When Pass 6 (Gap Hunting) finds new items:

```
Gap Hunter Output:
  newItems: [
    { "type": "feature", "reclassify": "pass-2" },   // needs deep analysis
    { "type": "feature", "reclassify": "pass-3" }     // ready for planning
  ]

Orchestrator Re-Entry Logic:
  if any item reclassified to pass-2 → re-dispatch Planning Coordinator (mode: analysis)
  elif any item reclassified to pass-3 → re-dispatch Planning Coordinator (mode: planning)
  then → re-dispatch Execution Coordinator for new slices
  then → re-dispatch Verification Coordinator
  then → re-dispatch gap-hunter again
```

**Bound the loop.** Track `gapHunting.cyclesCompleted`. After N cycles (typically 3), proceed to delivery even if items remain. Log them as "deferred items" in the handoff report.

## Pass 4 Internal Loop (Coder-Reviewer)

The execution coordinator runs a per-slice loop:

```
for each slice in dependency order:
  check dependency gate: all dependsOn slices must be "verified"
  
  attempt = 1
  loop:
    dispatch coder(slice, attempt, previousFeedback)
    dispatch reviewer(slice)
    if reviewer.result == "approved":
      dispatch test-writer(slice)    // optional
      update slice.status = "implemented"
      break
    elif attempt >= maxAttempts:
      update slice.status = "blocked"
      break
    else:
      attempt++
      previousFeedback = reviewer.output
```

**The dependency gate** ensures slices build on verified foundations. A slice with `dependsOn: ["S-001"]` cannot start until S-001 is `verified`.

**The reviewer role** is CRITICAL. The reviewer is not optional. Without it, coders produce work that looks correct in isolation but violates invariants, drifts from scope, or misses error paths. The reviewer's explicit invariant-by-invariant checklist catches these issues.
