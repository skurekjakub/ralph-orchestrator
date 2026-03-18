# Agent Roster Template

Use this template when designing the agent roster for a new fractal orchestrator system. Replace `<domain>` with the actual domain name (migration, security-audit, test-gen, etc.).

## Roster Spreadsheet

| # | Agent Name | Role | Level | Parent | Dispatches | Key Artifacts Written | Key Artifacts Read |
|---|---|---|---|---|---|---|---|
| 1 | `<domain>` | Session Orchestrator | 0 | — | Coordinators | `progress.json` | All `status.json`, `progress.json`, `context.json` |
| 2 | `<domain>-discovery-coordinator` | Discovery Coordinator | 1 | Orchestrator | Discovery specialists | — | Specialist `status.json` |
| 3 | `<domain>-planning-coordinator` | Planning/Analysis Coordinator | 1 | Orchestrator | Analysis + planning specialists | — | Specialist `status.json` |
| 4 | `<domain>-execution-coordinator` | Execution Coordinator | 1 | Orchestrator | Coder, reviewer, test-writer | `task-graph.json` (status updates) | Specialist `status.json`, `task-graph.json` |
| 5 | `<domain>-verification-coordinator` | Verification Coordinator | 1 | Orchestrator | Oracle validators, parity checker, gap-hunter | — | Specialist `status.json`, `verification-matrix.json` |
| 6 | `<domain>-delivery-coordinator` | Delivery Coordinator | 1 | Orchestrator | Hardening, docs, handoff | — | Specialist `status.json` |
| 7+ | `<domain>-<specialist-name>` | Specialist | 2 | Coordinator | — | Domain artifacts + `status.json` + `output.md` | Context + upstream artifacts |

## Role Descriptions

### Session Orchestrator (1 agent)
- Reads `context.json` for task parameters
- Reads `progress.json` for current state
- Reads coordinator `status.json` files for routing
- Dispatches coordinators in pipeline order
- After each coordinator returns, recomputes progress counters
- Handles re-entry: gap-hunter results trigger re-dispatch of earlier coordinators

### Discovery Coordinator (1 agent)
- Dispatches N domain-specific mapper/scanner agents
- Usually dispatches them sequentially (but they could be parallelized if the AI runtime supports it)
- Validates completeness: all expected domains present in inventory, counts match
- Does NOT read the inventory content — only validates structural completeness

### Planning/Analysis Coordinator (1 agent)
- Handles two pipeline phases (analysis + planning) via mode detection
- Mode detection: checks which artifacts exist to determine current phase
- Dispatches analysis specialists THEN planning specialists, in order
- Sequential dispatch within each phase (analysis results feed planning)

### Execution Coordinator (1 agent)
- Most complex coordinator — manages the coder→reviewer loop
- Reads `task-graph.json` to find the next executable slice
- Dependency gate: all `dependsOn` slices must have `status: "verified"`
- Dispatches coder → reads reviewer result → loops or advances
- Updates slice status in `task-graph.json` after each iteration

### Verification Coordinator (1 agent)
- Dual mode: per-slice verification (during execution) + batch gap-hunting (after all slices)
- Per-slice: dispatches oracle validators from slice's `verificationOracles` array, then dispatches parity aggregator
- Batch: dispatches gap-hunter agent
- Reports convergence signal to orchestrator

### Delivery Coordinator (1 agent)
- Strictly sequential: hardening → documentation → handoff
- Each agent builds on prior agent's output
- Simplest coordinator — no loops, no mode detection

### Discovery Specialists (2–8 agents)
- One per domain (e.g., UI features, API endpoints, routes, data models, background jobs, configuration)
- Read source material and write to the shared inventory file
- Read-modify-write pattern on the inventory (add own entries, preserve others)
- Fixed ID scheme: sequential within domain (e.g., F-001, F-002)
- Confidence scoring (1.0 = certain, 0.2 = barely visible)
- Explicit unknowns list

### Analysis Specialists (1–3 agents)
- Semantics analyzer: extracts rules, invariants, state transitions, error paths per item
- Dependency analyzer: builds directed graph between items, identifies clusters
- Run sequentially (semantics before dependencies)

### Planning Specialists (1–3 agents)
- Slice/task-graph planner: decomposes items into dependency-ordered execution units → writes `task-graph.json`. **Required** when Pass 3 is included.
- Risk analyzer: assesses risk per slice across multiple categories
- Slice planner runs before risk analyzer (risk needs slices to exist)

### Execution Specialists (2–4 agents)
- Coder: implements one slice at a time, scope-enforced to declared files
- Reviewer: checks implementation against invariants, error paths, scope boundaries
- Test writer: writes runnable tests for each invariant + error path
- Optional: refactorer, optimizer, formatter (domain-dependent)

### Verification Specialists (2–5 agents)
- Oracle validators: one per verification type (journey tests, contract diffs, static analysis, etc.)
- Parity aggregator: reads all oracle results, determines overall slice pass/fail
- Gap-hunter: adversarial search for missed items, reports re-entry needs

### Delivery Specialists (2–4 agents)
- Hardening checker: production-readiness beyond functional parity
- Documentation writer: compiles all artifacts into human-readable docs
- Handoff writer: executive summary with coverage stats, outstanding items, recommendations

## Naming Convention

```
<domain>                           — session orchestrator
<domain>-<phase>-coordinator       — coordinators
<domain>-<specialist-name>         — specialists
```

All lowercase, hyphen-separated. The domain prefix groups the whole family.
