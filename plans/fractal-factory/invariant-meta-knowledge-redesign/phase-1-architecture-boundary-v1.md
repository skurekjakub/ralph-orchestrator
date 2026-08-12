# Phase 1: Architecture Boundary

**Goal**: Clarify the persistence boundary between run-local invariants and cross-run meta-knowledge.
**Dependencies**: None.
**Outputs consumed by**: Phase 2 prompt changes and Phase 3 template alignment.

---

## Tasks

### 1.1 — Update Meta-Knowledge Reference Architecture

**File**: `.fractals/fractal-factory/meta-knowledge-reference.md`

Tighten the core architecture document so it explicitly states that raw invariants are per-run artifacts and must not be accumulated in `meta/`.

**Changes**:

1. Strengthen the domain signal analyzer section so invariant-related signals are only allowed when abstracted into reusable heuristics, verification strategies, or recurring failure modes.
2. Strengthen the context signal analyzer section so it tracks invariant failure patterns as process observations, not as durable domain rule inventories.
3. Add explicit boundary language under the quality gate or separation-of-concerns sections:
   - raw invariants fail the reusability test by default
   - abstracted invariant-handling heuristics may pass
4. Add one or two concrete positive/negative examples to prevent future ambiguity.

**Acceptance Criteria**:
- [ ] `meta-knowledge-reference.md` explicitly forbids persisting raw domain-local invariant inventories.
- [ ] It explicitly allows only abstracted invariant heuristics or recurring failure-mode patterns.
- [ ] The distinction between run-local domain data and cross-run memory is easy to read without inference.

### 1.2 — Update High-Level Factory README

**File**: `.fractals/fractal-factory/README.md`

Make the high-level user-facing architecture consistent with the new boundary.

**Changes**:

1. Add or revise the meta-knowledge description to say cross-run storage is curated strategy, not a cache of discovered domain rules.
2. If invariants are mentioned in synthesis or meta-knowledge passages, tighten the wording to refer to patterns and heuristics rather than inventories.

**Acceptance Criteria**:
- [ ] README does not imply that raw invariants accumulate across runs.
- [ ] README frames meta-knowledge as reusable patterns, strategies, and pitfalls.

### 1.3 — Record The Design Decision In Plan Artifacts

**File**: `plans/fractal-factory/invariant-meta-knowledge-redesign/task-graph-invariant-meta-knowledge-v1.json`

Ensure the task graph captures the architecture decision so later implementation stays aligned.

**Acceptance Criteria**:
- [ ] Task graph includes at least one design decision noting that raw invariants stay run-local.
