# Worked Example: Migration Domain

This shows how the fractal orchestrator architecture was applied to the codebase migration domain. Use this as a reference when mapping a new domain to the architecture.

## Domain Profile

| Property | Value |
|---|---|
| Subject | Legacy web application codebase |
| Deliverable | Fully migrated codebase in target framework with parity verification |
| Complexity | High — behavioral invariants, state transitions, cross-feature dependencies |
| Pipeline passes used | All 7 |
| Agent count | 26 (1 orchestrator + 5 coordinators + 20 specialists) |

## Pass-to-Agent Mapping

### Pass 1: Discovery → 6 Domain Mappers

Discovery was split into 6 domain-specific scanners, each responsible for one facet:

| Agent | Domain | What It Scans |
|---|---|---|
| `migration-feature-mapper` | UI features | Components, pages, user-facing functionality |
| `migration-route-mapper` | Routes | URL patterns, route guards, navigation structure |
| `migration-api-mapper` | API surface | REST endpoints, GraphQL resolvers, request/response shapes |
| `migration-data-mapper` | Data layer | Models, schemas, queries, relationships |
| `migration-job-mapper` | Background work | Queues, scheduled tasks, event handlers |
| `migration-config-mapper` | Configuration | Environment variables, feature flags, settings files |

**Why 6 mappers?** A single "feature scanner" would miss domain-specific patterns. The API mapper knows to look for middleware chains and error formatters. The data mapper knows to trace ORM relationships. The config mapper knows to check environment-specific overrides. Domain specialization produces higher-confidence results.

**All 6 write to one shared `feature-inventory.json`** using the read-modify-write pattern with domain scoping.

### Pass 2: Analysis → 2 Specialists

| Agent | Purpose |
|---|---|
| `migration-semantics-analyzer` | Extracts per-feature behavioral semantics: state transitions, validation rules, auth rules, error paths, async behavior, and invariants |
| `migration-dependency-analyzer` | Builds directed dependency graph between features, identifies migration clusters |

**Key insight:** The semantics analyzer runs BEFORE the dependency analyzer because dependency edges include behavioral coupling (event emitter → listener) discovered during semantic analysis.

**Output:** `behavior-matrix.json` (semantics) and `dependency-graph.json` (relationships).

### Pass 3: Planning → 2 Specialists

| Agent | Purpose |
|---|---|
| `migration-slice-planner` | Decomposes analyzed features into dependency-ordered execution slices with inlined invariants → writes `task-graph.json` |
| `migration-risk-analyzer` | Assesses per-slice risk across 6 categories with specific mitigations |

**Output:** `task-graph.json` (dependency-ordered tasks with inlined invariants, scope, and acceptance criteria) and `risk-register.json` (risks).

### Pass 4: Execution → 3 Specialists (looping)

| Agent | Purpose |
|---|---|
| `migration-coder` | Implements one slice at a time, scope-enforced |
| `migration-reviewer` | Reviews implementation against invariants, error paths, scope boundaries |
| `migration-test-writer` | Writes runnable tests per slice after approval |

The execution coordinator runs the `coder → reviewer → (test-writer)` loop per slice with max 3 attempts.

**Scope enforcement:** The coder can ONLY modify files listed in `scope.targetFiles` for the current slice. This prevents drift across slice boundaries.

**Rejection protocol:** When the reviewer rejects, it writes specific feedback to `slices/<id>/review.md`. The coder reads this on re-dispatch and addresses each point.

### Pass 5: Verification → 3 Specialists

| Agent | Purpose |
|---|---|
| `migration-journey-validator` | Playwright user journey comparisons between old and new system |
| `migration-contract-validator` | API contract diffs (URLs, payloads, status codes, error shapes) |
| `migration-parity-checker` | Aggregates oracle results, determines per-slice pass/fail |

Each slice declares its `verificationOracles` array — the verification coordinator dispatches only the relevant oracles for that slice.

### Pass 6: Gap Hunting → 1 Specialist

| Agent | Purpose |
|---|---|
| `migration-gap-hunter` | Adversarial search for missed features, uncovered invariants, blind spots |

The gap-hunter searches across 6 categories:
1. Route coverage (every route in source has a feature)
2. API coverage (every endpoint has a feature)
3. UI coverage (every user-visible feature in source is discovered)
4. Data coverage (every model/table has a feature)
5. Invariant completeness (every invariant appears in at least one slice)
6. Hidden behaviors (admin routes, feature flags, race conditions, dead-code-that-isn't)

### Pass 7: Delivery → 3 Specialists

| Agent | Purpose |
|---|---|
| `migration-hardening-checker` | Production readiness checks (performance, resilience, accessibility, observability, rollback) |
| `migration-documentation-writer` | Compiles decision log, changelog, and technical notes from all artifacts |
| `migration-handoff-writer` | Executive summary with coverage stats, outstanding items, recommendations |

## Coordinator Architecture

### Planning Coordinator — Mode Detection

The planning coordinator handles both Pass 2 (analysis) and Pass 3 (planning). It uses **mode detection** via file existence:

```
if behavior-matrix.json does NOT exist → run Pass 2 (dispatch semantics-analyzer, then dependency-analyzer)
elif task-graph.json does NOT exist → run Pass 3 (dispatch slice-planner, then risk-analyzer)
else → return "already-complete"
```

This makes re-entry safe: when the gap-hunter sends items back to Pass 2, the orchestrator re-dispatches the planning coordinator, which detects that behavior-matrix.json exists but needs updating (items with status "discovered" instead of "analyzed").

### Execution Coordinator — Dependency Gate

Before dispatching the coder for a task, the execution coordinator reads `task-graph.json` and checks dependency readiness:
```
for each task in task-graph.json where status == "planned" or "failed-parity":
  for each depId in task.dependsOn:
    read task-graph entry for depId
    if status != "verified":
      skip this task (try next one)
    if status == "blocked":
      cascade-block this task
  if all deps verified:
    select this task (lowest priority value wins)
```

This ensures tasks build on verified foundations. It also means the execution order adapts dynamically — if task T-003 depends on T-001 and T-002, but T-002 is still in review, the coordinator processes other independent tasks first.

### Verification Coordinator — Dual Mode

The verification coordinator operates in two modes:
1. **Per-slice mode** (during execution): Dispatches oracle validators per slice, then parity checker
2. **Batch mode** (after all slices): Dispatches gap-hunter

The orchestrator calls it in per-slice mode after each slice is implemented, then in batch mode after all slices complete.

## Artifact Flow Diagram

```
Bootstrap → context.json, progress.json, manifest.json
                    ↓
Discovery Mappers → feature-inventory.json
                    ↓
Semantics Analyzer → behavior-matrix.json
                    ↓
Dependency Analyzer → dependency-graph.json
                    ↓
Slice Planner → task-graph.json
                    ↓
Risk Analyzer → risk-register.json
                    ↓
Coder → slices/<id>/output.md + actual code changes
                    ↓
Reviewer → slices/<id>/review.md (approved | rejected)
                    ↓
Test Writer → slices/<id>/tests.md + actual test files
                    ↓
Oracle Validators → verification-matrix.json
                    ↓
Parity Checker → verification-matrix.json (aggregate)
                    ↓
Gap Hunter → new items (loop back) OR clean (proceed)
                    ↓
Hardening → risk-register.json (resolved risks)
                    ↓
Documentation → agents/documentation-writer/output.md
                    ↓
Handoff → agents/handoff-writer/output.md (FINAL DELIVERABLE)
```

## What Made This System Work

1. **Invariants as the backbone.** Everything flows through invariants — semantics extracts them, planners inline them in slices, coders implement to them, reviewers check them by name, test-writers test them individually, gap-hunters verify completeness.

2. **Confidence scoring in discovery.** Low-confidence features get flagged for deeper analysis. The gap-hunter specifically targets unknown entries.

3. **Scope enforcement in execution.** The coder is physically constrained to declared files. This prevents the "helpful but destructive" pattern where a coder modifies unrelated code.

4. **Adversarial verification.** The gap-hunter is framed as hostile to the rest of the system. Its job is to find places where every other agent was wrong. This catches the blind spots that collaborative agents miss.

5. **The convergence loop.** Multiple gap-hunting cycles with diminishing returns. `newItemsPerCycle: [5, 2, 0]` tells you the system found 5 things everyone missed, then 2 more, then nothing. Three passes is typically sufficient.
