# Phase 5: Verification Specialists (Pass 5–6 — Structural Audit + Gap Hunting)

**Goal**: Write the 3 verification specialist agents that validate the produced agent family.
**Dependencies**: Phase 4 (execution agents must exist — verification agents validate their output).
**Outputs consumed by**: Phase 7 (verification coordinator dispatches these, orchestrator reads gap-hunter results).

---

## Agent Overview

| # | Agent Name | Pass | Purpose | Reads | Writes |
|---|---|---|---|---|---|
| 1 | `fractal-factory-checklist-validator` | 5 | Run the validation checklist from the fractal skill against all produced agents | All produced agents, roster.json, architecture.json | verification-report.json |
| 2 | `fractal-factory-audit-oracle` | 5 | Invoke the agent-as-function-audit and fractal-workflow-eval skill checks | All produced agents, roster.json | audit-report.json |
| 3 | `fractal-factory-gap-hunter` | 6 | Adversarial search for missing agents, broken routing, artifact orphans | All produced agents, roster.json, architecture.json, domain-model.json | gap-report.json |

---

## Tasks

### 5.1 — Write checklist-validator Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-checklist-validator.agent.md`

Implements the full validation checklist from `references/validation-checklist.md` of the fractal-orchestrator-architecture skill. Checks every item in these categories:

**Structural Validation**:
- Agent count and hierarchy (correct depth, unique names, naming convention)
- Frontmatter completeness
- Autonomy (interactive tool suppression)

**Routing Validation**:
- Orchestrator routing table completeness
- Coordinator routing table completeness
- Status contracts on all agents
- No unhandled result codes

**Artifact Validation**:
- All shared JSON files have schemas
- Read-modify-write protocol documented for multi-writer files
- Artifact flow is acyclic (no circular dependencies)
- Bootstrap creates all required seed files

**Pipeline Validation**:
- Pass ordering correct
- Entry/exit conditions consistent
- Re-entry rules defined
- Convergence bounds set

**Anti-Laziness Validation**:
- Reviewer agents have anti-laziness rules
- Gap-hunter has adversarial framing
- Risk analyzer requires per-unit assessment

**Resumability Validation**:
- Status files written after artifacts
- Orchestrator routing is stateless (purely from status files)
- Bootstrap guard prevents re-initialization

Writes `verification-report.json`:
```json
{
  "version": 1,
  "timestamp": "...",
  "categories": {
    "structural": { "total": 6, "pass": 5, "fail": 1, "items": [...] },
    "routing": { "total": 8, "pass": 8, "fail": 0, "items": [...] },
    ...
  },
  "overallResult": "pass | fail",
  "failedItems": [
    {
      "category": "structural",
      "check": "All agents have unique names",
      "evidence": "Duplicate name: domain-mapper found in A-003 and A-007",
      "severity": "critical"
    }
  ]
}
```

**Result codes**: `pass` (all critical checks pass), `fail` (critical failures found)

**Acceptance Criteria**:
- [ ] Covers ALL items from the validation checklist
- [ ] Per-item pass/fail with evidence
- [ ] Severity classification (critical — blocks delivery, warning — should fix)
- [ ] Structured JSON output (not prose)
- [ ] Fails on any critical item

### 5.2 — Write audit-oracle Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-audit-oracle.agent.md`

Uses the knowledge from the existing audit skills as oracle reference. The agent applies:

**From agent-as-function-audit perspective**:
- Pure-router compliance (coordinators do no substantive work)
- Artifact contract consistency (listed artifacts match actual read/write in prompts)
- Routing table gaps (result codes handled completely)
- Status schema drift (all agents use the same status.json format)
- Prompt contradictions (no conflicting instructions between connected agents)

**From fractal-workflow-eval perspective**:
- Data flow integrity (every artifact read was written by a prior agent)
- Re-entry safety (re-entered agents correctly handle partial state)
- Directive propagation (domain-model invariants reach execution agents)
- Dead code paths (no routing table entries that can never fire)
- Lost context during re-entry (gap-hunter items properly flow to re-entered passes)

Writes `audit-report.json` with findings organized by audit perspective.

**Result codes**: `clean` (no issues), `issues-found` (findings documented)

**Acceptance Criteria**:
- [ ] Applies both audit perspectives
- [ ] Per-finding: location, description, severity, suggested fix
- [ ] Distinguishes architectural issues (hard to fix) from prompt issues (easy to fix)
- [ ] References specific agent names and line-level details in findings

### 5.3 — Write gap-hunter Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-gap-hunter.agent.md`

Adversarial agent that searches for anything the pipeline missed. Searches across these categories:

1. **Agent coverage**: Every subdomain from domain-model.json has at least one discovery specialist
2. **Invariant propagation**: Every invariant reaches at least one execution agent
3. **Artifact orphans**: Every artifact written by someone is read by someone (no dead artifacts)
4. **Routing completeness**: Every agent's result codes appear in its parent's routing table
5. **Schema consistency**: Artifacts written by agents match the schema in architecture.json
6. **Test coverage**: Every agent type is covered by at least one golden test scenario
7. **Depth-3 necessity**: Any coordinator with >8 children that wasn't given depth-3
8. **Missing agents**: Common roles (risk analyzer, test writer) that were omitted but probably needed

For each category, reports:
- Items found
- Re-entry classification: which pass should new items enter?
- Search methodology (what was searched and how)

Writes `gap-report.json`:
```json
{
  "version": 1,
  "iteration": 1,
  "categoryCounts": {
    "agentCoverage": 0,
    "invariantPropagation": 2,
    "artifactOrphans": 1,
    ...
  },
  "totalNewItems": 3,
  "newItems": [
    {
      "category": "invariantPropagation",
      "description": "INV-004 (auth rules) not referenced by any execution agent",
      "reEntryPass": 3,
      "severity": "high"
    }
  ],
  "searchMethodology": {
    "agentCoverage": "Cross-referenced domain-model.json subdomains against roster.json discovery specialists. All 5 subdomains have dedicated mappers.",
    ...
  }
}
```

**Anti-Laziness Rules**:
- Must report search methodology per category even when zero items found
- First-iteration zero results across ALL categories is suspicious — must explain thoroughness
- Cannot say "everything looks fine" without category-by-category evidence
- Must check invariant propagation exhaustively (every INV-* must trace to at least one agent)

**Result codes**: `clean` (zero new items — convergence signal), `dirty` (new items found — re-entry needed)

**Acceptance Criteria**:
- [ ] Searches all 8 categories listed above
- [ ] Per-category search methodology documented
- [ ] Re-entry classification per new item (which pass to re-enter)
- [ ] Anti-laziness rules in prompt
- [ ] First-pass zero-result suspicion rule
- [ ] Convergence tracking (iteration counter increments)
