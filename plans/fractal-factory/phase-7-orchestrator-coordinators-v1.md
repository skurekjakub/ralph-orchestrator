# Phase 7: Orchestrator, Coordinators & Guide (Top-Level Hierarchy)

**Goal**: Write the session orchestrator, 5 coordinators, and the guide agent. These are written last because they reference all specialist names, result codes, and routing tables from Phases 2–6.
**Dependencies**: Phases 2–6 (all specialist agents must be designed first — this phase wires them together).
**Outputs consumed by**: Nothing — these are the top of the hierarchy.

---

## Agent Overview

| # | Agent Name | Level | Purpose |
|---|---|---|---|
| 1 | `fractal-factory` | orchestrator | Session driver — owns progress.json, 7-pass pipeline routing, re-entry from gap hunting |
| 2 | `fractal-factory-guide` | guide | Entry point for human invocation — builds context.json, invokes orchestrator |
| 3 | `fractal-factory-discovery-coordinator` | coordinator | Pass 1 — dispatches 4 discovery specialists |
| 4 | `fractal-factory-planning-coordinator` | coordinator | Pass 2–3 — dispatches 6 planning specialists |
| 5 | `fractal-factory-execution-coordinator` | coordinator | Pass 4 — manages writer→reviewer loop, dispatches infra-writer |
| 6 | `fractal-factory-verification-coordinator` | coordinator | Pass 5–6 — dispatches checklist-validator, audit-oracle, gap-hunter |
| 7 | `fractal-factory-delivery-coordinator` | coordinator | Pass 7 — dispatches packager→documentation-writer→report-writer |

---

## Tasks

### 7.1 — Write session orchestrator (`fractal-factory`)

**File**: `fractals/fractal-factory/agents/fractal-factory.agent.md`

The top-level orchestrator. Owns the pipeline and progress.json.

**Pipeline routing table**:

| Pass | Coordinator | Entry Condition | Exit Condition |
|---|---|---|---|
| 1 — Discovery | discovery-coordinator | `pass1.status == "pending"` | All 4 discovery agents completed |
| 2 — Analysis | planning-coordinator (mode: analysis) | `pass2.status == "pending"` | architecture.json + artifact designs ready |
| 3 — Planning | planning-coordinator (mode: planning) | `pass3.status == "pending"` | roster.json + routing + test-plan complete |
| 4 — Execution | execution-coordinator | `pass4.status == "pending"` | All agents written + reviewed + infra done |
| 5 — Verification | verification-coordinator (mode: verify) | `pass5.status == "pending"` | Checklist + audit reports generated |
| 6 — Gap Hunting | verification-coordinator (mode: gap-hunt) | `pass6.status == "pending"` | Gap report: clean or max iterations hit |
| 7 — Delivery | delivery-coordinator | `pass7.status == "pending"` | Report-writer complete |

**Re-entry logic**:
When gap-hunter returns `dirty`, orchestrator determines which pass to re-enter based on `gap-report.json[].reEntryPass` and resets passes from that point forward. Progress.json `gapHunting.cycle` increments. After `gapHunting.maxCycles` (default 3), orchestrator proceeds to delivery with outstanding items flagged.

**Progress recomputation**:
After each coordinator returns, orchestrator reads all status files and recomputes `progress.json.passes[N].{status, completedAgents, totalAgents}`.

**Result codes (to parent — guide)**: `delivered` (pipeline complete), `delivered-with-gaps` (convergence limit hit), `failed` (critical error)

**What the orchestrator MUST NOT do**:
- No substantive work (pure routing only)
- No reading/writing produced agent files directly
- No skipping coordinators based on judgment — follow the routing table
- No modifying specialist status files

**Acceptance Criteria**:
- [ ] Pipeline routing table covers all 7 passes
- [ ] Re-entry logic resets correct passes
- [ ] Convergence bound enforced (maxCycles)
- [ ] Progress recomputation from status files
- [ ] Pure routing — no substantive work
- [ ] All coordinator result codes handled

### 7.2 — Write guide agent (`fractal-factory-guide`)

**File**: `fractals/fractal-factory/agents/fractal-factory-guide.agent.md`

The human-facing entry point. User-invocable. Responsibilities:

1. **Context gathering**: Ask the user for:
   - Domain description (what kind of agents to produce)
   - Input materials (domain docs, exemplar agents, invariants)
   - Target output directory
   - Constraints (max agents, required depth, excluded patterns)

2. **Context.json assembly**: Build and write the context.json from user input:
```json
{
  "version": 1,
  "domain": { "name": "...", "description": "..." },
  "target": { "outputDirectory": "...", "namingPrefix": "..." },
  "inputs": { "domainBrief": "path", "domainDocs": "dir", "exemplars": "dir", "invariants": "path", "constraints": "path" },
  "options": { "maxDepth": 3, "maxAgents": 50, "maxGapCycles": 3 }
}
```

3. **Invocation**: Invoke `fractal-factory` orchestrator (agent-as-function pattern)
4. **Handoff**: Present the report-writer's output to the user

The guide is the ONLY agent with `user-invocable: true`. It MAY use `ask_questions`. All other agents MUST NOT.

**Result codes**: N/A (guide is the entry point — no parent dispatches it)

**Acceptance Criteria**:
- [ ] Gathers all required context from user
- [ ] Writes valid context.json
- [ ] Invokes orchestrator via agent-as-function
- [ ] Presents final report to user
- [ ] Is the only user-invocable agent

### 7.3 — Write discovery-coordinator

**File**: `fractals/fractal-factory/agents/fractal-factory-discovery-coordinator.agent.md`

**Dispatches**: domain-scanner → invariant-extractor → asset-auditor → exemplar-analyzer

Sequential dispatch — each builds on the previous:
1. domain-scanner (populates domain model structure)
2. invariant-extractor (adds invariants to domain model)
3. asset-auditor (adds existing-asset inventory)
4. exemplar-analyzer (adds patterns from exemplar agents)

**Routing table**:

| Child | Result → Action |
|---|---|
| domain-scanner | `scanned` → dispatch invariant-extractor |
| domain-scanner | `insufficient-input` → report to orchestrator as `blocked` |
| invariant-extractor | `extracted` → dispatch asset-auditor |
| asset-auditor | `audited` → dispatch exemplar-analyzer |
| exemplar-analyzer | `analyzed` or `no-exemplars` → report `complete` |

**Purity rule**: Reads child status files and dispatches next child. Does NOT read domain-model.json content or make domain decisions.

**Result codes**: `complete` (all 4 specialists done), `blocked` (domain-scanner insufficient input)

**Acceptance Criteria**:
- [ ] Sequential dispatch order correct
- [ ] All child result codes mapped
- [ ] `insufficient-input` propagates as `blocked`
- [ ] Purity rule enforced — no substantive work

### 7.4 — Write planning-coordinator

**File**: `fractals/fractal-factory/agents/fractal-factory-planning-coordinator.agent.md`

**Dispatches**: 6 planning specialists across Pass 2 (analysis) and Pass 3 (roster + routing + tests)

**Mode detection**: Reads `progress.json` to determine current pass.
- Pass 2 mode: dispatch pipeline-architect → artifact-designer → depth-analyzer
- Pass 3 mode: dispatch roster-planner → routing-planner → test-planner

Within each mode, dispatch is sequential (later agents depend on earlier artifacts).

**Routing table**:

| Mode | Child | Result → Action |
|---|---|---|
| Pass 2 | pipeline-architect | `designed` → dispatch artifact-designer |
| Pass 2 | artifact-designer | `designed` → dispatch depth-analyzer |
| Pass 2 | depth-analyzer | `analyzed` → report `pass-2-complete` |
| Pass 3 | roster-planner | `planned` → dispatch routing-planner |
| Pass 3 | routing-planner | `planned` → dispatch test-planner |
| Pass 3 | test-planner | `planned` → report `pass-3-complete` |

**Result codes**: `pass-2-complete`, `pass-3-complete`

**Acceptance Criteria**:
- [ ] Mode detection from progress.json
- [ ] Correct dispatch order within each mode
- [ ] All child result codes mapped
- [ ] Purity rule — no design decisions

### 7.5 — Write execution-coordinator

**File**: `fractals/fractal-factory/agents/fractal-factory-execution-coordinator.agent.md`

**Dispatches**: prompt-writer ↔ prompt-reviewer (loop), then infra-writer

The most complex coordinator — manages the writer→reviewer cycle:

1. Read `roster.json` for list of agents to write
2. For each agent (in dependency order — specialists first, then coordinators, then orchestrator):
   a. Dispatch prompt-writer with target agent ID
   b. Dispatch prompt-reviewer for the written prompt
   c. If `rejected`: re-dispatch prompt-writer with reviewer feedback (max 3 retries)
   d. If `approved`: mark agent as `verified` in roster, move to next
   e. If max retries hit: mark agent as `blocked`, continue to next
3. After all agents: dispatch infra-writer

**Routing table**:

| Child | Result → Action |
|---|---|
| prompt-writer | `written` → dispatch prompt-reviewer |
| prompt-writer | `spec-incomplete` → mark agent `blocked`, skip to next |
| prompt-reviewer | `approved` → mark `verified`, dispatch prompt-writer for next agent |
| prompt-reviewer | `rejected` (retries < 3) → re-dispatch prompt-writer with feedback |
| prompt-reviewer | `rejected` (retries >= 3) → mark `blocked`, skip to next |
| infra-writer | `infrastructure-written` → report `complete` |

**Dependency order**: The coordinator must write agents in bottom-up order (specialists first → coordinators → orchestrator) because coordinator prompts reference specialist names and result codes.

**Convergence**: Max 3 writer→reviewer retries per agent. Blocked agents are logged but don't halt the pipeline.

**Result codes**: `complete` (all agents processed), `complete-with-blocked` (some agents blocked)

**Acceptance Criteria**:
- [ ] Bottom-up agent writing order
- [ ] Writer→reviewer loop with 3-retry limit
- [ ] Blocked agents tracked but don't halt pipeline
- [ ] Infra-writer dispatched after all prompts
- [ ] Purity rule — no prompt writing or reviewing

### 7.6 — Write verification-coordinator

**File**: `fractals/fractal-factory/agents/fractal-factory-verification-coordinator.agent.md`

**Mode detection**: Reads `progress.json` for current pass.
- Pass 5 (verify): dispatch checklist-validator → audit-oracle (parallel if possible, but sequential is fine)
- Pass 6 (gap-hunt): dispatch gap-hunter

**Routing table**:

| Mode | Child | Result → Action |
|---|---|---|
| Pass 5 | checklist-validator | `pass` → dispatch audit-oracle |
| Pass 5 | checklist-validator | `fail` → dispatch audit-oracle anyway (collect all findings) |
| Pass 5 | audit-oracle | `clean` → report `verified` |
| Pass 5 | audit-oracle | `issues-found` → report `verified-with-issues` |
| Pass 6 | gap-hunter | `clean` → report `converged` |
| Pass 6 | gap-hunter | `dirty` → report `gaps-found` |

**Result codes**: `verified`, `verified-with-issues`, `converged`, `gaps-found`

**Acceptance Criteria**:
- [ ] Mode detection from progress.json
- [ ] Checklist failure doesn't block audit-oracle
- [ ] Gap-hunter convergence signal propagated
- [ ] All child result codes mapped

### 7.7 — Write delivery-coordinator

**File**: `fractals/fractal-factory/agents/fractal-factory-delivery-coordinator.agent.md`

**Dispatches**: packager → documentation-writer → report-writer (strictly sequential)

**Routing table**:

| Child | Result → Action |
|---|---|
| packager | `packaged` → dispatch documentation-writer |
| packager | `incomplete` → dispatch documentation-writer anyway (document what exists) |
| documentation-writer | `documented` → dispatch report-writer |
| report-writer | `delivered` → report `complete` |

**Result codes**: `complete`

**Acceptance Criteria**:
- [ ] Sequential dispatch order
- [ ] Incomplete packaging doesn't block documentation
- [ ] All child result codes mapped
- [ ] Purity rule — no file copying or writing
