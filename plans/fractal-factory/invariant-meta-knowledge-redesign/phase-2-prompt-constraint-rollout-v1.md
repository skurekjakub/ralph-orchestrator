# Phase 2: Prompt Constraint Rollout

**Goal**: Change the factory's synthesis prompts so analyzers and the integrator enforce the new invariant-memory boundary.
**Dependencies**: Phase 1.
**Outputs consumed by**: Phase 3 template alignment.

---

## Tasks

### 2.1 — Constrain Factory Signal Analyzer

**File**: `.fractals/fractal-factory/agents/fractal-factory-factory-signal-analyzer.agent.md`

Refocus domain-level signal extraction away from invariant inventories and toward reusable strategies.

**Changes**:

1. Add explicit instructions that raw domain-local invariants are not valid output signals.
2. Permit invariant-related signals only when rewritten as reusable heuristics, verification strategies, decomposition patterns, or recurring failure modes.
3. Add positive and negative examples.

**Acceptance Criteria**:
- [ ] Prompt explicitly forbids persisting raw invariant lists as signals.
- [ ] Prompt explicitly allows generalized invariant-handling patterns.
- [ ] Examples make the abstraction threshold clear.

### 2.2 — Constrain Context Signal Analyzer

**File**: `.fractals/fractal-factory/agents/fractal-factory-context-signal-analyzer.agent.md`

Keep process-level invariant observations but prevent them from degenerating into stored domain-rule catalogs.

**Changes**:

1. Rewrite invariant-related signal guidance around failure patterns, review blind spots, and convergence bottlenecks.
2. Explicitly ban emitting new raw invariant entries as persistent knowledge.

**Acceptance Criteria**:
- [ ] Prompt keeps useful process observations about invariants.
- [ ] Prompt bans persistent storage of raw invariant content.

### 2.3 — Tighten Knowledge Integrator Quality Gate

**File**: `.fractals/fractal-factory/agents/fractal-factory-knowledge-integrator.agent.md`

Make the integrator the final enforcement point.

**Changes**:

1. Add a hard rule that raw, domain-local invariant inventories fail the quality gate by default.
2. Allow only tightly abstracted invariant-related entries that pass reusability and actionability.
3. Add examples of rejected versus accepted signals.

**Acceptance Criteria**:
- [ ] Integrator has an explicit exclusion for raw invariant inventories.
- [ ] Integrator still allows abstracted invariant heuristics.
- [ ] Prompt makes the exception threshold concrete.
