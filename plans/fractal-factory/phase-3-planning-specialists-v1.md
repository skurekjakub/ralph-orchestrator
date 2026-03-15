# Phase 3: Planning Specialists (Pass 2–3 — Architecture Synthesis + Blueprint)

**Goal**: Write the 6 planning specialist agents that design the produced agent system's architecture, roster, routing, and test plan.
**Dependencies**: Phase 2 (discovery specialists must exist — planning agents read their output schema).
**Outputs consumed by**: Phase 4 (execution agents implement the roster), Phase 7 (coordinators reference these specialist names).

---

## Agent Overview

| # | Agent Name | Pass | Purpose | Reads | Writes |
|---|---|---|---|---|---|
| 1 | `fractal-factory-pipeline-architect` | 2 | Design which pipeline passes apply, map subdomains to discovery agents | domain-model.json | architecture.json (pipeline section) |
| 2 | `fractal-factory-artifact-designer` | 2 | Design the produced system's artifact schemas | domain-model.json, architecture.json | architecture.json (artifacts section) |
| 3 | `fractal-factory-depth-analyzer` | 2 | Decide per-coordinator whether depth-3 is warranted | domain-model.json, architecture.json | architecture.json (depth section) |
| 4 | `fractal-factory-roster-planner` | 3 | Design the full agent roster with roles, parents, dispatch targets | domain-model.json, architecture.json | roster.json |
| 5 | `fractal-factory-routing-planner` | 3 | Design routing tables for every coordinator and orchestrator | roster.json, architecture.json | roster.json (routing tables) |
| 6 | `fractal-factory-test-planner` | 3 | Design golden test scenarios for the produced system | domain-model.json, roster.json | test-plan.json |

Pass 2 agents (pipeline-architect, artifact-designer, depth-analyzer) run sequentially — each builds on the prior.
Pass 3 agents (roster-planner, routing-planner, test-planner) also run sequentially.

---

## Tasks

### 3.1 — Write pipeline-architect Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-pipeline-architect.agent.md`

Reads `domain-model.json` and decides which of the 7 standard passes apply. For each applicable pass:
- Maps subdomains to discovery agent domains
- Identifies the type of analysis needed (behavioral semantics, structural analysis, etc.)
- Determines execution patterns (coder→reviewer loop, parallel discovery, etc.)
- Identifies verification strategies appropriate to the domain

Writes `architecture.json` with the pipeline section:

```json
{
  "version": 1,
  "pipeline": {
    "applicablePasses": [1, 2, 3, 4, 5, 6, 7],
    "passDesign": {
      "pass1": {
        "name": "Discovery",
        "domains": ["ui", "api", "data"],
        "agentPattern": "parallel-mappers",
        "estimatedAgents": 3
      },
      ...
    }
  }
}
```

**Result codes**: `architected`

**Acceptance Criteria**:
- [ ] References the 7-pass pipeline from the fractal-orchestrator-architecture skill
- [ ] Maps each subdomain to at least one discovery domain
- [ ] Provides rationale for skipping any pass
- [ ] Creates `architecture.json` in `.fractal-factory/architecture/`

### 3.2 — Write artifact-designer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-artifact-designer.agent.md`

Designs the produced system's shared artifact schemas. For each pipeline pass, determines:
- What shared JSON files are needed (inventory, analysis matrix, task graph, etc.)
- The schema for each file (fields, types, ID schemes)
- Which agents write to each file and which read from it
- The read-modify-write rules

Updates `architecture.json` with the artifacts section:

```json
{
  "artifacts": {
    "sharedFiles": [
      {
        "name": "feature-inventory.json",
        "purpose": "All discovered items",
        "schema": { ... },
        "writtenBy": ["domain-mapper-ui", "domain-mapper-api"],
        "readBy": ["semantics-analyzer", "slice-planner"],
        "idScheme": "F-NNN"
      }
    ],
    "perAgentFiles": ["status.json", "output.md"],
    "perUnitFiles": ["output.md", "review.md", "tests.md"]
  }
}
```

**Result codes**: `designed`

**Acceptance Criteria**:
- [ ] Every pipeline pass has at least one shared artifact
- [ ] Every artifact has a schema with field types
- [ ] ID schemes documented per artifact
- [ ] Read-modify-write protocol specified for multi-writer files

### 3.3 — Write depth-analyzer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-depth-analyzer.agent.md`

Analyzes the planned pipeline and decides per coordinator-group whether depth-3 (coordinator → sub-coordinator → specialist) is warranted. Decision criteria:
- **Depth-3 if**: >8 specialists under one coordinator, or specialists have distinct sub-phases requiring routing
- **Depth-2 if**: ≤8 specialists, or specialists are independent/parallelizable

For depth-3 decisions, designs the intermediate coordinator layer:
- Which specialists group under which sub-coordinator
- Routing between sub-coordinators

Updates `architecture.json` with depth decisions:

```json
{
  "depth": {
    "maxDepth": 3,
    "perCoordinator": {
      "discovery": { "depth": 2, "rationale": "4 independent mappers, simple routing" },
      "execution": { "depth": 3, "rationale": "12 specialists with coder→reviewer sub-loops per domain", "subCoordinators": [...] }
    }
  }
}
```

**Result codes**: `analyzed`

**Acceptance Criteria**:
- [ ] Evaluates each coordinator group independently
- [ ] Documents rationale for each depth decision
- [ ] Correctly structures sub-coordinator design when depth-3 chosen
- [ ] Respects `constraints.json.maxDepth` bound

### 3.4 — Write roster-planner Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-roster-planner.agent.md`

Designs the complete agent roster for the produced system. For each agent:
- Name (following `<domain>-<role>` convention)
- Role (orchestrator, coordinator, specialist)
- Level (0, 1, 2, or 3)
- Parent agent
- Dispatched children
- Key artifacts written and read
- Result codes
- Whether anti-laziness rules apply

Creates `roster.json` in `.fractal-factory/roster/`:

```json
{
  "version": 1,
  "domain": "...",
  "totalAgents": 26,
  "agents": [
    {
      "id": "A-001",
      "name": "<domain>",
      "role": "orchestrator",
      "level": 0,
      "parent": null,
      "dispatches": ["A-002", "A-003", "A-004", "A-005", "A-006"],
      "resultCodes": ["pipeline-complete", "pipeline-blocked"],
      "artifactsWritten": ["progress.json"],
      "artifactsRead": ["progress.json", "context.json", "agents/*/status.json"],
      "antiLaziness": false,
      "status": "designed"
    },
    ...
  ]
}
```

**Result codes**: `planned`

**Acceptance Criteria**:
- [ ] Total agent count respects `constraints.json.maxAgents`
- [ ] Every agent has a unique name and ID
- [ ] Hierarchy is valid (no agent at level N+1 without a level N parent)
- [ ] All specialist result codes are domain-appropriate
- [ ] Anti-laziness flag set correctly (true for reviewers, gap-hunters, risk analyzers)

### 3.5 — Write routing-planner Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-routing-planner.agent.md`

Designs routing tables for every coordinator and the orchestrator in the produced system. For each router agent:
- Maps every child's result codes to actions (dispatch next, loop, escalate, complete)
- Defines re-entry rules (which passes can be re-entered from gap hunting)
- Defines convergence bounds (max retry, max gap-hunting cycles)
- Defines dependency gates (for execution coordinator's coder→reviewer loop)

Updates `roster.json` adding routingTable to each coordinator/orchestrator:

```json
{
  "routingTable": [
    {
      "read": "agents/<child>/status.json",
      "condition": "result == 'discovered'",
      "action": "dispatch <next-child>"
    },
    {
      "read": "agents/<child>/status.json",
      "condition": "result == 'blocked'",
      "action": "escalate"
    }
  ],
  "reEntryRules": [...],
  "convergenceBounds": { "maxGapCycles": 3, "maxCoderRetries": 3 }
}
```

**Result codes**: `routed`

**Acceptance Criteria**:
- [ ] Every result code from every child maps to an action in the parent's routing table
- [ ] No unhandled result codes (complete coverage test)
- [ ] Re-entry rules defined for gap-hunting feedback
- [ ] Convergence bounds explicit for all loops

### 3.6 — Write test-planner Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-test-planner.agent.md`

Designs golden test scenarios for the produced system. Each scenario defines:
- An input configuration (simplified domain-brief + context)
- Expected pipeline behavior (which passes run, agent dispatch order)
- Expected output characteristics (roster size, artifact completeness, routing coverage)
- Structural validation checks (all agents have status contracts, routing tables complete)

Creates `test-plan.json` in `.fractal-factory/tests/`:

```json
{
  "version": 1,
  "scenarios": [
    {
      "id": "T-001",
      "name": "Happy path — full pipeline",
      "input": { "domainBrief": "...", "invariants": [...] },
      "expectedBehavior": {
        "passesExecuted": [1, 2, 3, 4, 5, 6, 7],
        "agentCountRange": [15, 35]
      },
      "validationChecks": [
        "All agents have status.json contracts",
        "All routing tables have complete result-code coverage",
        "All shared artifacts have documented schemas"
      ]
    }
  ],
  "structuralChecks": [
    "Every agent suppresses interactive tools",
    "Every coordinator has a routing table with full result-code coverage",
    "Every specialist's result codes appear in its parent's routing table",
    "progress.json pass names match pipeline passes"
  ]
}
```

**Result codes**: `test-planned`

**Acceptance Criteria**:
- [ ] At least 3 scenarios (happy path, reduced pipeline, complex domain)
- [ ] Structural checks cover the full validation checklist
- [ ] Test scenarios reference domain-model.json exemplars where available
- [ ] Each scenario has verifiable expected outputs (not vague)
