# Phase 5: Execution Agents

**Status:** not-started
**Agents:** 4 (1 coordinator + 3 specialists)
**Dependencies:** Phase 4 (task-graph.json must exist with planned slices)

## Objective

Migrate code one slice at a time in dependency order. For each slice: coder implements → reviewer checks → test-writer writes tests. Inline verification follows (Phase 6 agents).

## Execution Loop

```
For each slice in task-graph order where dependsOn are all verified:
  1. Coder: implement slice
  2. Reviewer: check against invariants + criteria
     → if rejected: re-dispatch coder with reviewer feedback
     → if approved: proceed
  3. Test-writer: write tests for the slice
  4. → hand off to Phase 6 inline verification
```

## Agents

### `execution-coordinator.agent.md`

**Role:** Pure router. Reads `task-graph.json` to find unfinished slices. Dispatches coder → reviewer → test-writer per slice.

**Prompt requirements:**
1. Read `task-graph.json`, find the first slice where:
   - `status` is `planned` (or `failed-parity` for re-execution)
   - ALL entries in `dependsOn` have `status: verified`
2. Dispatch `coder` for that slice
3. After coder completes, dispatch `reviewer`
4. If reviewer result is `rejected`, re-dispatch `coder` (pass reviewer's feedback)
5. After reviewer approves, dispatch `test-writer`
6. After test-writer completes, signal readiness for inline verification
7. When no more `planned` slices remain (or all remaining are `blocked`), write own `status.json` with `result: implemented`

**Inputs:** `task-graph.json` + child `status.json` files
**Outputs:** `.migration/agents/execution-coordinator/status.json`

---

### `coder.agent.md`

**Role:** Implement one slice at a time. Read the slice spec, write the code.

**Prompt requirements:**

1. **Dependency gate check:**
   - Read `task-graph.json`
   - Find the assigned slice (current assignment from coordinator or first `planned` with deps `verified`)
   - If any `dependsOn` slice is not `verified`, write `status.json` with `result: blocked` and STOP

2. **Scope enforcement:**
   - Read the slice's `scope.sourceFiles` — these are the files you may read and modify
   - Read `scope.boundaryNotes` — this is what you must NOT touch
   - If a fix requires modifying files outside scope, write `status.json` with `result: escalated` and STOP
   - Do NOT modify code belonging to other slices

3. **Invariant coverage:**
   - Read the slice's `invariants` array
   - Every invariant must be addressed in the implementation
   - The reviewer WILL reject if any invariant is unaddressed
   - Document how each invariant is preserved (in `output.md`)

4. **Acceptance criteria:**
   - Read the slice's `acceptanceCriteria` array
   - Every criterion must be satisfied
   - Document how each criterion is met

5. **Status updates:**
   - Set slice status to `in-progress` in `task-graph.json` when starting
   - Set slice status to `implemented` in `task-graph.json` when done
   - Set slice `assignee` to `"coder"`

6. **Output:**
   - Write migrated code to the appropriate location in the workspace
   - Write `.migration/slices/<slice-id>/output.md` with implementation narrative
   - Standard artifact contract: `status.json` + `manifest.json` prepend (newest first)

---

### `reviewer.agent.md`

**Role:** Review coder output against slice spec. Approve or reject with specific reasons.

**Prompt requirements:**

1. **Invariant-by-invariant check:**
   - Read the slice's `invariants` array
   - For EACH invariant: verify the implementation preserves it
   - Any unaddressed invariant → REJECT
   - Write per-invariant pass/fail in `review.md`

2. **Acceptance criteria check:**
   - Read the slice's `acceptanceCriteria` array
   - For EACH criterion: verify it's satisfied
   - Any unmet criterion → REJECT

3. **Error path check:**
   - Read `behavior-matrix.json` entries for the slice's features
   - Check that every `errorPaths` entry is handled in the implementation
   - Missing error handling → REJECT

4. **Scope check:**
   - Verify coder only modified files in `scope.sourceFiles` (and their new equivalents)
   - If out-of-scope changes detected → REJECT with details

5. **No "looks good" reviews.** Every review must reference specific invariants, criteria, and error paths by name. Generic approval is a failure.

6. **Result codes:**
   - `approved` — all checks pass
   - `rejected` — specific list of failures (must be actionable for re-dispatch)

7. **Output:**
   - Write `.migration/slices/<slice-id>/review.md` with detailed review
   - Standard artifact contract: `status.json` + `manifest.json` prepend (newest first)

---

### `test-writer.agent.md`

**Role:** Write tests for a migrated slice. Tests must be runnable, not pseudocode.

**Prompt requirements:**

1. **Invariant coverage:** Write at least one test per invariant in the slice
2. **Error path coverage:** Write tests for every `errorPaths` entry from behavior-matrix
3. **Happy path coverage:** Write tests for normal operation
4. **Tests must be runnable:** Use the project's actual test framework. Import real modules. Mock external dependencies at the boundary, not inline.
5. **No pseudocode tests.** Every test must compile and run.

6. **Output:**
   - Write actual test files to the appropriate test directory in the workspace
   - Write `.migration/slices/<slice-id>/tests.md` with test narrative (what's covered, what's not, any limitations)
   - Standard artifact contract: `status.json` + `manifest.json` prepend (newest first)

## Verification

Pick a completed slice and verify:

- [ ] `.migration/slices/<id>/output.md` exists with implementation narrative
- [ ] Implementation addresses every invariant listed in the slice's task-graph entry
- [ ] `.migration/slices/<id>/review.md` exists with per-invariant pass/fail
- [ ] Review references specific invariants and criteria by name (not generic)
- [ ] `.migration/slices/<id>/tests.md` exists with test summary
- [ ] Actual test files exist in the workspace test directory
- [ ] Tests cover error paths, not just happy paths
- [ ] Coder did not modify files outside the slice's `scope.sourceFiles`
- [ ] Slice status in `task-graph.json` is `implemented`
- [ ] All three specialists wrote `status.json` files
- [ ] `migration-manifest.json` has entries for all three specialists
