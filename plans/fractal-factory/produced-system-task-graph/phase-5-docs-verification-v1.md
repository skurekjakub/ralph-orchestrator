# Phase 5: Documentation + Verification

**Version**: v1
**Goal**: Update the factory README, run a consistency check across all modified files, and verify no stale references remain.
**Dependencies**: Phase 1, Phase 2, Phase 3, Phase 4
**Outputs consumed by**: None (terminal phase)

---

## Tasks

### 5.1 — Update fractal-factory README

**File**: `.fractals/fractal-factory/README.md`

The README's artifact tree and agent descriptions need to reflect the task-graph pattern in produced output.

**Changes**:

1. **Update artifact tree**: If the README lists produced artifacts, add `task-graph.json` to the list of artifacts the produced system will contain.

2. **Update agent descriptions**: If the README describes what each agent type produces, mention the planner specialist and the execution coordinator's graph-driven pattern.

**Acceptance Criteria**:
- [ ] task-graph.json appears in the produced artifact tree
- [ ] Planner specialist is mentioned in agent type descriptions

---

### 5.2 — Consistency sweep

**Target**: All files modified in Phases 1–4

Run a grep-based consistency check for:
1. No references to the old "sequential dispatch" pattern for execution coordinators in updated files
2. `produced-task-graph.schema.md` is referenced correctly from all files that need it
3. No orphaned references to patterns that were replaced
4. The `produced-agent.schema.md` and `produced-agent-template.md` are mutually consistent
5. The routing-planner's graph-driven pattern matches the produced-agent.schema.md's execution coordinator section

**Acceptance Criteria**:
- [ ] Zero stale references to old execution coordinator patterns in modified files
- [ ] Schema ↔ template ↔ routing-planner ↔ prompt-writer are mutually consistent
- [ ] All cross-references between files are valid
