# Phase 7: Tests & Integration

**Version**: v1  
**Goal**: Unit tests for the tree parser, flatten utility, and server-side extraction, plus verification that existing Logs tab still works.  
**Dependencies**: Phase 1 (tree parser), Phase 2 (API), Phase 6 (all components)  
**Outputs consumed by**: None (final phase)

---

## Context

The tree parser is the most critical piece — it processes ~1M line logs and everything downstream depends on its output being correct. The API endpoint needs path validation tests. The existing Logs tab must not regress.

---

## Tasks

### 7.1 — Unit tests for `parseCliDebugTree()`

**New file**: `dashboard-local/src/components/log-browser/__tests__/cli-debug-subagent-parser.test.ts`

**Changes**:

Test cases with synthetic log fragments:

1. **Flat subagent list (depth 1)**: Two sequential subagents (no nesting). Verify: root has 2 children, each at depth 1, correct agent names, correct invocation indices (both #1 since different names).

2. **Nested (depth 2)**: Subagent A starts, subagent B starts inside A, B completes, A completes. Verify: root → A → B structure, depths 0/1/2, B is child of A.

3. **Deep nesting (depth 4+)**: Chain of 4 nested starts followed by 4 completions. Verify: linear chain at depths 0-4.

4. **Multiple invocations of same agent**: Three starts of "content-writer" at depth 1. Verify: `invocationIndex` is 1, 2, 3 respectively.

5. **Unclosed spans**: A subagent starts but log ends before completion. Verify: node exists without `endTs`/`durationMs`, no crash.

6. **Empty log**: Empty string input. Verify: returns root with no children.

7. **Agent name extraction**: Verify the lookahead correctly extracts `definitionModel`, `resolvedModel`, `didFallback`.

8. **Tool call counting**: Verify `toolCallCount` and `modelCallCount` increment correctly per nesting level (only the active span's counters increment).

**Acceptance Criteria**:
- [ ] All 8 test cases pass
- [ ] Tests use synthetic log fragments (no real log files)
- [ ] Tests verify tree structure, not internal parser state

---

### 7.2 — Unit tests for `flattenTree()` backward compatibility

**File**: `dashboard-local/src/components/log-browser/__tests__/cli-debug-subagent-parser.test.ts`

**Changes**:

1. **Structural compatibility**: Given a known tree, verify `flattenTree()` output matches the shape of `SubagentSpan[]` — all fields present, correct types.

2. **DFS order**: Given a tree with nested children, verify flatten produces DFS order (parent before children, left before right).

3. **Root exclusion**: Verify the synthetic root (depth 0) is not in the flattened output.

**Acceptance Criteria**:
- [ ] `flattenTree()` output matches `SubagentSpan[]` interface
- [ ] DFS order verified
- [ ] Root node excluded from output

---

### 7.3 — Tests for server-side extraction endpoint

**New file**: `dashboard-local/src/__tests__/fractalLogPlugin.test.ts`

**Changes**:

1. **`buildRunSummary` unit tests**:
   - Given a tree with known nodes and usage entries, verify summary fields are correct
   - Verify `agentBreakdown` groups by name and computes correct averages

2. **Path validation** (test the validation logic, not the HTTP layer):
   - Relative path `../etc/passwd` → rejected
   - Non-`.log` extension → rejected
   - Valid absolute `.log` path → accepted

**Acceptance Criteria**:
- [ ] `buildRunSummary` produces correct aggregates
- [ ] Path validation rejects traversal attempts
- [ ] Path validation rejects non-`.log` files
