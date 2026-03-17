# Fractal Factory

A meta-level fractal orchestrator that **produces validated fractal agent families** from domain specifications. Give it a domain description, supporting documents, and behavioral invariants — it outputs a complete agent system with orchestrator, coordinators, specialists, artifact schemas, bootstrap script, golden tests, and documentation.

The factory itself follows the fractal pattern: session orchestrator → 8 coordinators → 26 specialists, running a pipeline from knowledge curation through delivery with gap-hunting re-entry loops.

## Quick Start

```bash
# 1. Bootstrap the artifact directory
bash fractal-factory-bootstrap.sh

# 2. Fill in the context
#    Edit .fractal-factory/context.json — set domain name, output path, input file paths

# 3. Prepare your inputs
#    - domain-brief.md: narrative description of the domain
#    - domain-docs/: supporting documents (optional)
#    - invariants.md: behavioral rules the produced system must enforce (optional)
#    - exemplars/: existing agent families to learn from (optional)
#    - constraints.json: hard constraints (optional)

# 4. Invoke the guide
#    The guide agent gathers any missing context and starts the factory
```

Invoke `@fractal-factory-guide` to begin. The guide interviews you for domain details, builds `context.json`, then invokes the session orchestrator which runs the entire pipeline autonomously.

## Architecture

```
User invokes fractal-factory-guide (once)
       ↓
   fractal-factory-guide
       ↓ builds context.json, invokes:
   fractal-factory (session orchestrator)
       ↓ pipeline routing
   ┌─────────────────────────────────────────────────────────────┐
   │ Pass 0: Knowledge Curation                                 │
   │   knowledge-curator (reads meta/index.json)                │
   ├─────────────────────────────────────────────────────────────┤
   │ Pass 1: Discovery                                          │
   │   discovery-coordinator                                    │
   │     → domain-scanner → invariant-extractor                 │
   │     → asset-auditor → exemplar-analyzer                    │
   ├─────────────────────────────────────────────────────────────┤
   │ Pass 2: Analysis                                           │
   │   analysis-coordinator                                     │
   │     → pipeline-architect → artifact-designer               │
   │     → depth-analyzer                                       │
   ├─────────────────────────────────────────────────────────────┤
   │ Pass 3: Planning                                           │
   │   planning-coordinator                                     │
   │     → roster-planner → routing-planner → test-planner      │
   │     → production-graph-planner                             │
   ├─────────────────────────────────────────────────────────────┤
   │ Pass 4: Execution                                          │
   │   execution-coordinator                                    │
   │     → dependency-gated task loop from production-graph.json │
   │       → prompt-writer ↔ prompt-reviewer (per-task, max 3 retries) │
   │     → infra-writer                                         │
   ├─────────────────────────────────────────────────────────────┤
   │ Pass 5: Verification                                       │
   │   verification-coordinator                                 │
   │     → checklist-validator → audit-oracle                   │
   ├─────────────────────────────────────────────────────────────┤
   │ Pass 6: Gap Hunting                                        │
   │   gap-hunting-coordinator                                  │
   │     → coverage-hunter (cats 1-3)                           │
   │     → artifact-hunter (cats 4-6)                           │
   │     → infrastructure-hunter (cats 7-9)                     │
   │     (if dirty → new tasks added to production-graph.json,  │
   │      execution picks up naturally, max 3 cycles)           │
   ├─────────────────────────────────────────────────────────────┤
   │ Synthesis: Meta-Knowledge Extraction                       │
   │   synthesis-coordinator                                    │
   │     → factory-signal-analyzer → context-signal-analyzer    │
   │     → knowledge-integrator (writes to meta/)               │
   ├─────────────────────────────────────────────────────────────┤
   │ Pass 7: Delivery                                           │
   │   delivery-coordinator                                     │
   │     → packager → documentation-writer → report-writer      │
   └─────────────────────────────────────────────────────────────┘
```

## Agent Roster

| Agent | Level | Parent | Pass |
|---|---|---|---|
| `fractal-factory` | orchestrator | guide | All |
| `fractal-factory-guide` | guide | user | — |
| `fractal-factory-knowledge-curator` | specialist | orchestrator | 0 |
| `fractal-factory-discovery-coordinator` | coordinator | orchestrator | 1 |
| `fractal-factory-analysis-coordinator` | coordinator | orchestrator | 2 |
| `fractal-factory-planning-coordinator` | coordinator | orchestrator | 3 |
| `fractal-factory-execution-coordinator` | coordinator | orchestrator | 4 |
| `fractal-factory-verification-coordinator` | coordinator | orchestrator | 5 |
| `fractal-factory-gap-hunting-coordinator` | coordinator | orchestrator | 6 |
| `fractal-factory-synthesis-coordinator` | coordinator | orchestrator | Synthesis |
| `fractal-factory-delivery-coordinator` | coordinator | orchestrator | 7 |
| `fractal-factory-domain-scanner` | specialist | discovery-coord | 1 |
| `fractal-factory-invariant-extractor` | specialist | discovery-coord | 1 |
| `fractal-factory-asset-auditor` | specialist | discovery-coord | 1 |
| `fractal-factory-exemplar-analyzer` | specialist | discovery-coord | 1 |
| `fractal-factory-pipeline-architect` | specialist | analysis-coord | 2 |
| `fractal-factory-artifact-designer` | specialist | analysis-coord | 2 |
| `fractal-factory-depth-analyzer` | specialist | analysis-coord | 2 |
| `fractal-factory-roster-planner` | specialist | planning-coord | 3 |
| `fractal-factory-routing-planner` | specialist | planning-coord | 3 |
| `fractal-factory-test-planner` | specialist | planning-coord | 3 |
| `fractal-factory-production-graph-planner` | specialist | planning-coord | 3 |
| `fractal-factory-prompt-writer` | specialist | execution-coord | 4 |
| `fractal-factory-prompt-reviewer` | specialist | execution-coord | 4 |
| `fractal-factory-infra-writer` | specialist | execution-coord | 4 |
| `fractal-factory-checklist-validator` | specialist | verification-coord | 5 |
| `fractal-factory-audit-oracle` | specialist | verification-coord | 5 |
| `fractal-factory-coverage-hunter` | specialist | gap-hunting-coord | 6 |
| `fractal-factory-artifact-hunter` | specialist | gap-hunting-coord | 6 |
| `fractal-factory-infrastructure-hunter` | specialist | gap-hunting-coord | 6 |
| `fractal-factory-factory-signal-analyzer` | specialist | synthesis-coord | Synthesis |
| `fractal-factory-context-signal-analyzer` | specialist | synthesis-coord | Synthesis |
| `fractal-factory-knowledge-integrator` | specialist | synthesis-coord | Synthesis |
| `fractal-factory-packager` | specialist | delivery-coord | 7 |
| `fractal-factory-documentation-writer` | specialist | delivery-coord | 7 |
| `fractal-factory-report-writer` | specialist | delivery-coord | 7 |

**Total: 36 agents** (1 guide + 1 orchestrator + 8 coordinators + 26 specialists)

## Artifact Directory

```
.fractal-factory/
├── context.json              — User input (domain, paths, options)
├── progress.json             — Pipeline state (owned by orchestrator)
├── manifest.json             — Prepend-only audit log
├── domain-model.json         — Discovery output (subdomains, assets, patterns)
├── invariants/               — Per-classification invariant files
│   ├── behavioral.json       — Behavioral invariants
│   ├── structural.json       — Structural invariants
│   ├── quality.json          — Quality invariants
│   └── workflow.json         — Workflow invariants
├── architecture.json         — Architecture design (pipeline, artifacts, depth decisions)
├── roster.json               — Full agent roster with routing tables
├── test-plan.json            — Golden test scenarios
├── production-graph.json     — Production task graph (runtime state for execution)
├── agents/                   — Per-agent status.json and output.md
│   ├── fractal-factory-domain-scanner/
│   │   ├── status.json
│   │   └── output.md
│   ├── fractal-factory-invariant-extractor/
│   │   ├── status.json
│   │   └── output.md
│   └── ... (one directory per agent)
├── produced-output/          — The actual product
│   ├── agents/               — .agent.md files for the produced system
│   ├── schemas/              — Artifact JSON schemas (incl. produced-task-graph.schema.md)
│   ├── skills/               — Shared specialists workflow router + domain-specific auxiliary skills
│   ├── tests/                — Golden test scenario files
│   ├── docs/                 — Architecture, user guide, roster reference
│   └── bootstrap.sh          — Bootstrap script for the produced system
├── verification-report.json  — Checklist validation results
├── audit-report.json         — Oracle audit findings
├── meta/                     — Meta-knowledge store (managed by knowledge-integrator)
│   ├── index.json            — Registry of all knowledge entries
│   └── entries/              — Individual knowledge entries (JSON)
└── packaging-report.json     — Final packaging completeness
```

## Input Requirements

| Input | Required | Purpose |
|---|---|---|
| `domain-brief.md` | **Yes** | Narrative description of the domain |
| `domain-docs/` | No | Supporting documents, API specs, examples |
| `invariants.md` | No (recommended) | Behavioral rules the produced system must enforce |
| `exemplars/` | No | Existing agent families to learn from |
| `constraints.json` | No | Hard constraints (max agents, required roles, etc.) |

## Key Design Patterns

### Read-Modify-Write
Multiple specialists write to the same JSON files. Each agent reads the current state, adds its entries (identified by `discoveredBy` field), preserves all entries from other agents, and writes back.

### Production-Graph-Driven Execution
The execution coordinator reads `production-graph.json` and selects the next eligible task (status `planned`, all `dependsOn` tasks verified). It dispatches `prompt-writer` → `prompt-reviewer` for one task at a time. On rejection, the writer is re-dispatched with feedback (max 3 retries per task). Exhausted tasks are marked `blocked`. The coordinator loops until all tasks are verified or blocked.

The produced systems follow the same pattern: a **planner specialist** decomposes analysis outputs into `task-graph.json` (5-phase progressive disclosure workflow: enumerate → dependencies → invariants → criteria → validate), and a **graph-driven execution coordinator** reads the task graph for dependency-gated task selection, running a coder→reviewer loop per task with cascade blocking and summary recomputation.

### Gap-Hunting Graph Mutation
After verification, the gap-hunting coordinator dispatches the three specialist hunters. Hunters add new task nodes to `production-graph.json` for missing items and annotate existing tasks with `gapAnnotations`. If the graph was mutated, the execution coordinator picks up new/re-planned tasks naturally — no pass resets needed. Convergence = zero new tasks or annotations. Max 3 cycles before forced delivery.

### Oracle Verification
Produced agents are validated against the structural validation checklist AND by applying the perspectives from the `agent-as-function-audit` and `fractal-workflow-eval` skills.

Pass 5 is strict: if either verifier finds any issue, the verification pass fails. There is no pass-with-warnings outcome.

### Meta-Knowledge Boundary
Cross-run meta-knowledge is for reusable patterns, strategies, and recurring failure modes. It is not an ever-growing cache of raw domain invariants from prior runs. Per-run invariants stay in the current run's discovery, planning, and verification artifacts unless they have been tightly abstracted into reusable invariant-handling heuristics.

### Progressive Disclosure For Produced Specialists
Produced specialists should not carry their full workflow inline in the main `.agent.md` prompt. The produced family should expose one shared router skill under `skills/workflow/` named like `{namingPrefix}-specialists-workflow`. That skill is only a signpost: it routes the agent into `references/<specialist-name>/` folders, where the numbered phase files live. The main prompt stays compact and points to the shared skill, while the detailed phase instructions live in per-specialist reference files. This keeps specialist context focused on the active phase without mounting dozens of near-empty workflow skills.

## Schemas

See `schemas/` for full JSON schema documentation:
- `progress.schema.md` — Pipeline state
- `context.schema.md` — User input configuration
- `domain-model.schema.md` — Discovery output
- `produced-agent.schema.md` — Structural requirements for produced agents (specialist, planner specialist, analysis specialist, coordinator, execution coordinator, orchestrator)
- `production-graph.schema.md` — Production task graph with dependency edges and verification hooks
- `produced-task-graph.schema.md` — Canonical task graph schema for produced systems (T-nnn IDs, status lifecycle, dependency rules, gap annotations)
