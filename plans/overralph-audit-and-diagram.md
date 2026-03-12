# OverRalph Plans — Cross-Document Audit & Final Flow

An audit of the four OverRalph planning documents, covering internal consistency, gaps, risks, and a final illustrated architecture diagram.

## Documents Audited

| Document | Scope |
|---|---|
| `overralph-self-assembling-swarm.md` | Core concept: meta-agent, MCP server shape, bootstrap, dynamic tool registration |
| `overralph-demo.md` | Epic-level operating model: delivery manager, task packets, JIRA/ADO control plane |
| `overralph-policy-layer-and-agent-factory.md` | Policy substrate design: what it contains, who consumes it, integration options |
| `overralph-mcp-server-phase-1-plan.md` | Phase 1 implementation: stable registry, tool contracts, execution boundary |

---

## Audit: Naming Inconsistencies

### 1. MCP server name

| Document | Name used |
|---|---|
| Swarm | `ralph-factory-server` |
| Phase 1 plan | `overralph-factory` |

**Verdict:** Pick one. `overralph-factory` is more descriptive and scopes it clearly to the OverRalph system.

### 2. Agent refinement tool name

| Document | Name used |
|---|---|
| Swarm | `factory_improve_agent` |
| Phase 1 plan | `factory_refine_agent` |

**Verdict:** Pick one. `factory_refine_agent` aligns better with the registry lifecycle language ("refining" an entry) and avoids implying the agent was bad.

### 3. Missing tools in the swarm doc

The swarm doc defines 3 static tools: `factory_create_agent`, `factory_list_agents`, `factory_improve_agent`.

Phase 1 plan defines 5: adds `factory_get_agent` and `factory_run_agent`.

- `factory_get_agent` — makes sense; added for registry inspection.
- `factory_run_agent` — this is the **biggest architectural divergence** (see below).

---

## Audit: Architectural Divergence — Execution Model

This is the most important inconsistency across the four documents.

### Swarm doc model: Dynamic per-agent tools

```
factory_create_agent("API researcher")
  → registers tool: agent_api_researcher
  → OverRalph calls: agent_api_researcher({ prompt: "..." })
```

Each created agent becomes a **top-level MCP tool**. OverRalph's tool list grows at runtime.

### Phase 1 plan model: Stable dispatch tool

```
factory_create_agent("API researcher")
  → writes registry entry: agent://api-researcher
  → OverRalph calls: factory_run_agent({ agentId: "agent://api-researcher", prompt: "..." })
```

Created agents are **registry entries**. OverRalph dispatches through one stable tool.

### Why this matters

These are fundamentally different interaction models:

| Aspect | Dynamic tools (swarm) | Stable dispatch (Phase 1) |
|---|---|---|
| Tool list | Grows at runtime | Fixed |
| MCP client compatibility | Requires `tools/list_changed` notification support | Works with all MCP clients |
| Agent discoverability by LLM | Each agent appears in tool list with its own description | All agents hidden behind one `factory_run_agent` tool |
| Schema validation | Per-agent schemas possible | Uniform schema only |
| Observability | Tool-call logs show which agent was used | Generic `factory_run_agent` call — need to inspect `agentId` |

### Verdict

The Phase 1 plan correctly defers dynamic tools, but the swarm doc presents them as the primary architecture rather than a future enhancement. The swarm doc needs a note acknowledging the phased approach: Phase 1 uses stable dispatch, Phase 2+ promotes high-value agents to top-level tools.

The two models are compatible (promotion is additive) but the documents read as if they describe different systems.

---

## Audit: Gaps

### Gap 1: Task completion packet schema is undefined

The demo doc describes task completion packets as the unit OverRalph consumes:

```json
{
  "status": "completed",
  "result": "implemented",
  "summary": "...",
  "jira": { "taskKey": "...", "nextSuggestedTasks": [] },
  "pr": { "branch": "...", "prUrl": "...", "reviewStatus": "..." },
  "quality": { "checks": [], "state": "..." }
}
```

The Phase 1 plan's `factory_run_agent` output has a partial `taskPacket`:

```json
{
  "taskRef": "PAY-123",
  "branch": "feature/pay-123-backend",
  "prUrl": "https://ado/...",
  "reviewState": "pending"
}
```

These are structurally different and neither is formalized. A shared schema definition is needed before implementation.

### Gap 2: Epic-level ledger has no plan

The demo doc describes OverRalph needing its own durable ledger with state machines:

- Epic: `planned | active | blocked | validating | ready | done`
- Task: `new | assigned | in-progress | review | revision | merged | blocked`
- PR: `open | pending-review | approved | changes-requested | merged`

Phase 1 plan only has a run ledger (per-agent-invocation). Nobody has planned:
- where the epic ledger lives
- what triggers state transitions
- how it relates to JIRA state (is JIRA the source of truth, or is the ledger?)
- crash recovery for epic-level state

### Gap 3: OverRalph's JIRA/ADO tools are unspecified

The demo doc describes OverRalph creating JIRA stories, managing ADO PRs, and running a merge train. But no document specifies how OverRalph gets those capabilities:

- Does it use the existing `jira-kentico` and `ado` MCP servers?
- Does it get new tools in the `overralph-factory` server?
- Does it create JIRA/ADO management agents via the factory?

This is a significant integration gap. OverRalph needs JIRA + ADO as first-class tools alongside the factory tools.

### Gap 4: Policy profile storage is undefined

The policy doc defines what a profile contains but nobody specifies:
- Physical file format and location
- How the Agent Factory resolves a handle like `"feature-delivery-high-assurance"` to actual files
- Where the registry of available profiles lives
- Bootstrap: who creates the first profiles

Phase 1 plan punts this entirely ("pass handle to factory, defer resolution"). But without even a stub format, there's nothing to pass.

### Gap 5: OverRalph's own runtime is unspecified

How does OverRalph itself run?

| Option | Implications |
|---|---|
| Copilot/Claude agent in a container | Same as existing Ralphs — limited by session length, needs continuation support |
| Local host-side agent | No container isolation, but simpler for long-running epics |
| Standalone process | Not an LLM agent — pure code, but then who does the reasoning? |
| Hybrid | LLM agent for reasoning, persistent external ledger for state |

The demo doc implicitly assumes "hybrid" (LLM reasoning + external ledger) but it's never made explicit. This matters because epic delivery could take hours/days, far exceeding any single LLM session.

### Gap 6: No error recovery model for OverRalph

If OverRalph crashes mid-epic:
- Can it resume from the ledger?
- What happens to in-progress agent runs?
- What happens to JIRA tasks it already created?
- Does someone need to re-trigger it?

The demo doc mentions the ledger enables this, but no recovery protocol is specified.

### Gap 7: Agent Factory policy interface is unspecified

The policy doc says the factory consumes policy profiles. The Phase 1 plan says pass the handle. But the existing Agent Factory agent (`.github/agents/agent-factory.agent.md`) has no concept of policy profiles today. Nobody has specified:
- How the handle reaches the factory agent's prompt
- How the factory resolves it to actual skill/template references
- What the factory does differently under `docs-strict` vs `fast-exploratory`

---

## Audit: Cost and Latency Risk

### Agent creation cost

| Operation | Estimated Opus calls |
|---|---|
| One `factory_create_agent` | ~4 (explorer + architect + builder + auditor) |
| One `factory_run_agent` | 1+ (depends on agent complexity) |
| One `factory_refine_agent` | ~3 |

### Epic delivery cost model

A moderate epic with 8 task classes:

| Phase | Calls |
|---|---|
| Research agent creation | 4 |
| Research agent run | 1 |
| Epic decomposer creation | 4 |
| Epic decomposer run | 1 |
| 8 task-class agent creations | 32 |
| 8 task executions | 8+ |
| Reviewer agent creation | 4 |
| Review runs | 8 |
| Revision runs (30% rejection) | 3 |
| **Total** | **~65+** |

At ~$0.15-0.75 per Opus call (depending on token volume), a single epic could cost $10-50 in LLM calls alone.

### Latency model

If each factory creation takes 10-20 minutes (4 stages × 2-5 min):
- Creating 10 agents = 100-200 minutes of creation time alone
- Plus execution time for the actual work

**No document addresses budgeting, parallelism, or time caps.**

This needs at minimum:
- A cost budget parameter per epic
- Agent reuse as a first-class optimization (the swarm doc mentions this but it's not in Phase 1)
- Parallel agent creation where possible

---

## Audit: Redundancy

1. **MCP tool descriptions** appear fully in both the swarm doc and Phase 1 plan with slightly different schemas. Phase 1 plan should reference the swarm doc's canonical tool shapes and note deviations rather than re-specifying from scratch.

2. **3-layer architecture** (governance → factory → OverRalph) is described in the demo doc and partially restated in the policy doc. Could be a shared reference.

3. **Agent Factory invocation flow** is described conceptually in the swarm doc and in more detail in Phase 1 plan. The swarm doc's description is now outdated relative to Phase 1's more concrete flow.

---

## Audit: What's Strong

1. **Separation of concerns is clean.** OverRalph → delivery management, Factory → agent creation, Policy → governance substrate. This three-layer split is well-defined and consistently applied across all four docs.

2. **Phase 1 scope is realistic.** Stable registry + dispatch tool + deferred dynamic registration is the right first step. It avoids the MCP tool-list mutation complexity while delivering the core create/run capability.

3. **Policy profile as a handle, not inline artifacts.** All four docs agree that OverRalph should pass a handle, not leak policy internals. This boundary is clean.

4. **Task completion packets as OverRalph's consumption unit.** The demo doc's insight that OverRalph should never reason from raw transcripts/logs/artifacts — only structured packets — is strong and consistently applied.

5. **"Always delegate" rule** in the swarm doc is a powerful design constraint that prevents OverRalph from scope-creeping into doing work itself.

---

## Recommendations

### Immediate (before implementation)

1. **Unify naming**: Pick `overralph-factory` for the server and `factory_refine_agent` for the refinement tool. Update swarm doc.

2. **Define the task completion packet schema** as a standalone type. Both the Phase 1 plan's `factory_run_agent` output and the demo doc's epic-level packets should derive from it.

3. **Add a "phased execution model" note to the swarm doc** acknowledging that Phase 1 uses stable dispatch (`factory_run_agent`) and Phase 2+ adds dynamic tool promotion. The swarm doc currently reads as if dynamic tools are the only model.

4. **Specify OverRalph's JIRA/ADO tool access.** Simplest answer: OverRalph's MCP config includes the existing `jira-kentico` and `ado` servers alongside `overralph-factory`. Document this.

### Before Phase 2

5. **Define policy profile file format and bootstrap a starter profile.** Even a `policies/feature-delivery-high-assurance.json` with real skill references would ground the entire policy design.

6. **Specify OverRalph's runtime model.** Recommended: LLM agent (local mode stage) with an external epic ledger at `.overralph/epics/<epicKey>.json`. Session crash → re-trigger → resume from ledger.

7. **Add cost budgeting to the MCP server.** `factory_create_agent` should check remaining budget before invoking the factory pipeline.

---

## Final Illustrated Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HUMAN OPERATORS                             │
│  • Author policy artifacts (skills, guides, rubrics, templates)     │
│  • Approve and version policy profiles                              │
│  • Create JIRA epics                                                │
│  • Review/approve PRs                                               │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ policy profiles              │ epics / approvals
               ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────────────────┐
│    POLICY REGISTRY       │   │           OVERRALPH                  │
│                          │   │    (Layer 3: Delivery Manager)       │
│  policies/               │   │                                      │
│    <name>.json           │   │  Responsibilities:                   │
│      referenceSkills     │   │  • Receive epic + policy handle      │
│      styleGuides         │   │  • Decompose into task graph         │
│      workflowTemplates   │   │  • Create/dispatch Ralph agents      │
│      domainChecklists    │   │  • Consume task completion packets   │
│      evaluationRubrics   │   │  • Manage JIRA state + ADO PRs      │
│      validationRules     │   │  • Drive merge train                 │
│                          │   │                                      │
└──────────┬───────────────┘   │  Durable state:                     │
           │                   │  • .overralph/epics/<key>.json       │
           │ resolved by       │  • .overralph/runs/index.json       │
           │ factory           │                                      │
           │                   └─────────────┬────────────────────────┘
           │                                 │
           │              MCP tool calls     │
           │     ┌───────────────────────────┤
           │     │                           │
           │     │  factory_create_agent     │  factory_run_agent
           │     │  factory_list_agents      │  factory_refine_agent
           │     │  factory_get_agent        │
           │     │                           │
           ▼     ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OVERRALPH-FACTORY MCP SERVER                     │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐       │
│  │  Registry    │  │  Run Ledger │  │  Execution Boundary  │       │
│  │  Store       │  │  Store      │  │                      │       │
│  │             │  │             │  │  factory-runner.ts   │       │
│  │  agents.json│  │  index.json │  │  agent-runner.ts     │       │
│  │  <slug>.json│  │  <run-id>/  │  │  cli-runner.ts       │       │
│  └──────┬──────┘  └──────┬──────┘  │  result-parser.ts    │       │
│         │                │         └──────────┬───────────┘       │
└─────────┼────────────────┼───────────────────┼───────────────────┘
          │                │                    │
          │  registry      │  run records       │  CLI invocation
          │  read/write    │  read/write        │
          ▼                ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                     .overralph/ (workspace root)                  │
│                                                                   │
│  agents/                          registry/                       │
│    <slug>/                          agents.json                   │
│      *.agent.md                     agents/<slug>.json            │
│      agent.manifest.json                                          │
│      registry-metadata.json       runs/                           │
│                                     index.json                    │
│  factory-runs/                      <run-id>/                     │
│    <request-id>/                      metadata.json               │
│      request.json                     result.json                 │
│      factory-output.log               logs/                       │
│                                                                   │
│  epics/  (Phase 2+)                                              │
│    <epicKey>.json                                                 │
└──────────────────────────────────────────────────────────────────┘
```

### Epic Delivery Flow (End-to-End)

```
 JIRA Epic
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. INTAKE                                                   │
│    OverRalph receives: epic + repo + policy handle          │
│    Selects policy profile: "feature-delivery-high-assurance"│
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. RESEARCH                                                 │
│    factory_create_agent("epic decomposition researcher")    │
│         │                                                    │
│         ├──► Agent Factory (explorer→architect→builder→aud) │
│         │         │                                          │
│         │         ▼                                          │
│         │    Registry: agent://epic-decomposer (ready)      │
│         │                                                    │
│    factory_run_agent(agentId, prompt: "analyze epic scope") │
│         │                                                    │
│         ▼                                                    │
│    Task Completion Packet:                                   │
│      { workstreams, dependencies, task breakdown,           │
│        acceptance criteria, branch strategy }                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. DECOMPOSITION                                            │
│    OverRalph creates JIRA stories + subtasks + links        │
│    (via jira-kentico MCP server)                            │
│                                                              │
│    Epic ──┬── Story-1 (backend)                             │
│           ├── Story-2 (API review)                          │
│           ├── Story-3 (integration tests)                   │
│           └── Story-4 (release notes)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. AGENT ALLOCATION                                         │
│                                                              │
│    For each task class:                                      │
│      factory_list_agents() → existing agent fits? reuse     │
│                            → no fit? factory_create_agent() │
│                                                              │
│    Result:                                                   │
│      agent://backend-implementer    (created or reused)     │
│      agent://api-reviewer           (created or reused)     │
│      agent://integration-tester     (created or reused)     │
│      agent://release-notes-writer   (created or reused)     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. EXECUTION LOOP                                           │
│                                                              │
│    For each task (in dependency order):                      │
│                                                              │
│    factory_run_agent(agentId, prompt, taskRef)               │
│         │                                                    │
│         ▼                                                    │
│    ┌─────────────────────────────────────┐                  │
│    │  Created Ralph Agent                │                  │
│    │  (runs in CLI: copilot or claude)   │                  │
│    │                                      │                  │
│    │  • Reads task prompt + context       │                  │
│    │  • Does the actual work             │                  │
│    │  • Pushes branch, opens PR          │                  │
│    │  • Emits ===RALPH_RESULT_START===   │                  │
│    └──────────────────┬──────────────────┘                  │
│                       │                                      │
│                       ▼                                      │
│    Task Completion Packet:                                   │
│    {                                                         │
│      status: "completed",                                    │
│      result: "implemented",                                  │
│      taskRef: "EPIC-101",                                    │
│      branch: "feature/epic-101-backend",                    │
│      prUrl: "https://ado/...",                              │
│      reviewState: "pending",                                │
│      quality: { checks: ["build","tests"], state: "passed" }│
│    }                                                         │
│                                                              │
│    OverRalph updates:                                        │
│      • JIRA task status                                      │
│      • Epic ledger                                          │
│      • Run ledger                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. PR MANAGEMENT                                            │
│    (via ado MCP server)                                     │
│                                                              │
│    For each open PR:                                        │
│      PR pending review                                      │
│        → factory_run_agent(reviewer, "review PR ...")       │
│      PR changes-requested                                    │
│        → factory_run_agent(implementer, "fix feedback ...") │
│      PR approved                                             │
│        → merge (if policy allows auto-merge)                │
│        → update JIRA + ledger                               │
│                                                              │
│    Branch strategy: task-scoped PRs (default)               │
│      task-1/branch → PR → merge to feature branch           │
│      task-2/branch → PR → merge to feature branch           │
│      ...                                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. EPIC COMPLETION                                          │
│                                                              │
│    Completion criteria (all must be true):                   │
│      ✓ All child tasks completed                            │
│      ✓ All required PRs approved + merged                   │
│      ✓ No open blocker tasks                                │
│      ✓ Validation Ralph reports green                       │
│      ✓ Feature branch is merge-ready                        │
│                                                              │
│    OverRalph:                                                │
│      • Transitions JIRA epic to Done                        │
│      • Posts summary comment                                │
│      • Attaches delivery report                             │
│      • Marks feature branch/integration PR ready            │
└─────────────────────────────────────────────────────────────┘
```

### Policy Layer Integration

```
┌──────────────────────────────────────────────────────────────────┐
│  OverRalph                                                       │
│  "Create a backend implementer under                             │
│   policy: feature-delivery-high-assurance"                       │
│                                                                   │
│  Passes ONLY: description + policyProfile handle                 │
│  Does NOT pass: skills, templates, rubrics, fragments            │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  overralph-factory MCP Server                                    │
│  Accepts handle, passes to Agent Factory invocation              │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  AGENT FACTORY (explorer → architect → builder → auditor)        │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  Policy Profile Resolution                              │      │
│  │  "feature-delivery-high-assurance" →                    │      │
│  │    referenceSkills: [agent-as-function, feat-impl, ...]│      │
│  │    workflowTemplates: [research-plan-implement-review] │      │
│  │    evaluationRubrics: [feature-delivery-rubric-v3]     │      │
│  │    validationRules: [approved-skills-only, ...]        │      │
│  └─────────────────────┬──────────────────────────────────┘      │
│                        │                                          │
│  ┌─────────────────────▼──────────────────────────────────┐      │
│  │  ARCHITECT (constrained by policy)                      │      │
│  │  • Only approved workflow patterns                      │      │
│  │  • Only approved result codes                           │      │
│  │  • Required review gates must exist                     │      │
│  └─────────────────────┬──────────────────────────────────┘      │
│                        │                                          │
│  ┌─────────────────────▼──────────────────────────────────┐      │
│  │  BUILDER (constrained by policy)                        │      │
│  │  • Only approved skills mounted                         │      │
│  │  • Only approved prompt fragments composed              │      │
│  │  • Hard invariants embedded (Option C)                  │      │
│  │  • Soft guidance referenced (Option C)                  │      │
│  └─────────────────────┬──────────────────────────────────┘      │
│                        │                                          │
│  ┌─────────────────────▼──────────────────────────────────┐      │
│  │  AUDITOR (enforces policy)                              │      │
│  │  • Validates against resolved profile                   │      │
│  │  • Rejects non-compliant families                       │      │
│  │  • Checks: approved skills, workflow shapes,            │      │
│  │    result codes, required gates                         │      │
│  └─────────────────────┬──────────────────────────────────┘      │
│                        │                                          │
│                        ▼                                          │
│  Generated agent family stamped with:                            │
│    policyProfile: "feature-delivery-high-assurance@2026-03-10"   │
│  Written to: .overralph/agents/<slug>/                           │
└──────────────────────────────────────────────────────────────────┘
```

### MCP Tool Surface — Phase 1 vs Phase 2+

```
PHASE 1 — Stable Registry                PHASE 2+ — Dynamic Promotion
─────────────────────────────             ─────────────────────────────

MCP Tools:                                MCP Tools:
  factory_create_agent                      factory_create_agent
  factory_list_agents                       factory_list_agents
  factory_get_agent                         factory_get_agent
  factory_run_agent  ◄── dispatch           factory_run_agent  ◄── for registry-only
  factory_refine_agent                      factory_refine_agent
                                            factory_promote_agent
                                            factory_archive_agent
All agent calls go through                  ─────────────────────────
factory_run_agent:                          agent_backend_impl  ◄── promoted!
                                            agent_api_reviewer  ◄── promoted!
  factory_run_agent({
    agentId: "agent://backend-impl",      High-value agents become top-level
    prompt: "..."                          tools with their own schemas.
  })                                       Others remain registry-only.

Exposure levels:                           Lifecycle:
  • ephemeral  — not in registry             registry-only → promoted
  • registry-only — in registry              promoted → archived
                                             (tools/list_changed notification)
```

### OverRalph in the Ralph Ecosystem

```
┌───────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SYSTEMS                               │
│                                                                       │
│   JIRA                    Azure DevOps              Target Repos      │
│   (work items,            (PRs, branches,           (code, docs)      │
│    comments,               reviews,                                   │
│    epics)                  merge)                                      │
└────┬────────────────────────┬──────────────────────────┬──────────────┘
     │                        │                          │
     │ REST API               │ REST API                 │ git + API
     │                        │                          │
┌────▼────────────────────────▼──────────────────────────▼──────────────┐
│                         MCP SERVERS                                    │
│                                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────────────────────┐    │
│  │ jira-kentico│  │   ado    │  │      overralph-factory        │    │
│  │             │  │          │  │                                 │    │
│  │ • search    │  │ • PR ops │  │  • factory_create_agent        │    │
│  │ • create    │  │ • review │  │  • factory_list_agents         │    │
│  │ • transition│  │ • merge  │  │  • factory_get_agent           │    │
│  │ • comment   │  │ • branch │  │  • factory_run_agent           │    │
│  │ • link      │  │          │  │  • factory_refine_agent        │    │
│  └──────▲──────┘  └────▲─────┘  └──────────────▲────────────────┘    │
│         │              │                        │                      │
└─────────┼──────────────┼────────────────────────┼─────────────────────┘
          │              │                        │
          │   MCP tool calls from OverRalph       │
          │              │                        │
     ┌────┴──────────────┴────────────────────────┴───────┐
     │                                                     │
     │                   OVERRALPH                         │
     │            (Meta-Agent / Delivery Manager)          │
     │                                                     │
     │  Runtime: LLM agent (local mode)                   │
     │  State:   .overralph/epics/ (durable ledger)       │
     │  Rule:    "Never do work — always delegate"        │
     │                                                     │
     └─────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Created    │  │ Created    │  │ Created    │
     │ Ralph A    │  │ Ralph B    │  │ Ralph C    │
     │ (backend)  │  │ (reviewer) │  │ (tests)    │
     │            │  │            │  │            │
     │ Policy:    │  │ Policy:    │  │ Policy:    │
     │ feat-hi-a  │  │ feat-hi-a  │  │ feat-hi-a  │
     └────────────┘  └────────────┘  └────────────┘

 ────────────────────────────────────────────────────────────

     In parallel, the existing Ralph Orchestrator continues
     to handle JIRA-comment-triggered single-task Ralphs:

     ┌─────────────────────────────────────────────────┐
     │           RALPH ORCHESTRATOR                     │
     │  (existing system — unchanged)                   │
     │                                                   │
     │  JIRA poller → trigger scanner → operation ledger │
     │    → task runner → Docker container → CLI agent  │
     │    → task result writer → JIRA transition        │
     │                                                   │
     │  Operates on: single tasks, comment-triggered    │
     │  Uses: profiles/, shared/security, compose merge │
     └─────────────────────────────────────────────────┘
```

---

## Summary Scorecard

| Dimension | Rating | Notes |
|---|---|---|
| **Conceptual clarity** | Strong | Three-layer model is clean and consistently applied |
| **Naming consistency** | Weak | Server name, tool names differ across docs |
| **Schema formalization** | Weak | Task packets, registry entries, and policy profiles are described but not formally defined |
| **Phase 1 scope** | Strong | Realistic, well-bounded, correctly defers complexity |
| **Gap coverage** | Moderate | Epic ledger, JIRA/ADO access, policy storage, OverRalph runtime all unspecified |
| **Cost/latency awareness** | Weak | Mentioned but no budgeting or mitigation mechanisms planned |
| **Cross-doc coherence** | Moderate | Core ideas align but execution model divergence (dynamic tools vs dispatch) is unaddressed |
| **Implementation readiness** | Moderate | Phase 1 plan is implementable; epic-level features need more design |
