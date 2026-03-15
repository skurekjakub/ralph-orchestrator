# Routing Document Specification

The routing document (`ROUTING-ARCHITECTURE.md`) is a mandatory artifact for any fractal multi-agent workflow. It enumerates every distinct execution path through the pipeline so that audits can trace issues path-by-path rather than holistically.

## Location

The routing document lives in the agent family's root directory alongside the orchestrator and agent files:

```
.fractals/<family>/
  ROUTING-ARCHITECTURE.md    ← routing document
  <family>.agent.md           ← orchestrator
  <family>-*.agent.md         ← coordinators and specialists
  <family>-bootstrap.sh       ← bootstrap script
  <family>-changelog.md       ← changelog
```

## Required Sections

### 1. Path Index

A table listing every execution path with an ID, name, trigger condition, and frequency estimate.

```markdown
| # | Path | Trigger | Frequency |
|---|------|---------|-----------|
| P-01 | Happy path (first run) | Fresh bootstrap | Common |
| P-02 | Gap-hunting re-entry | Gaps found at verification | Common |
| ...  | ... | ... | ... |
```

**Completeness rule:** Every conditional branch in the orchestrator's routing table and every error/skip/recovery path in coordinators must appear as a path entry. If the orchestrator has N routing conditions and coordinators have M error branches, the document should have at least N + M path entries (some may overlap).

### 2. Path Descriptions

Each path gets a full description using ASCII flowchart notation showing:

- **Entry condition** — what state triggers this path
- **Agent dispatch sequence** — every agent invoked, in order
- **Artifacts read/written** at each step
- **Progress.json mutations** (use `⇒` notation)
- **Error/skip markers** (use `⊘` notation)
- **Decision points** with both branches shown

Example format:
```
Pass N: coordinator-name
│
├─ → specialist-a
│    Read: input-artifact.json
│    Write: output-artifact.json
├─ → specialist-b (parallel with specialist-a)
│    Read: other-input.json
│    Write: other-output.json
│
├─ ⊘ specialist-b fails → log warning, continue (non-blocking)
│
⇒ passN_status = "done"
```

### 3. Coordinator Internal Dispatch Sequences

For each coordinator, a concise listing of its internal dispatch order:

```
Step 0: Read directives
Step 1: → specialist-a (blocking)
Step 2a: → specialist-b ‖ (parallel)
Step 2b: → specialist-c ‖ (parallel, non-blocking on failure)
Step 3: → specialist-d (blocking, depends on step 2a)
```

This section serves as a quick-reference during path-by-path tracing, without needing to re-read each coordinator's full prompt.

### 4. Progress State Machine

Document the legal values for each state field, who sets them, and the transitions:

- **Legal pass status values** (typically `"not-started"` | `"done"`)
- **Progress update ownership** (which agent updates which pass)
- **Re-entry state fields** (target, cycle count, convergence flag)
- **Crash-safety invariants** (e.g., "pass status can never be a custom value")

### 5. Artifact Dependency Graph

An ASCII graph showing producer → consumer relationships for every artifact. This is the visual representation of the producer-consumer matrix from `data-flow-analysis.md`.

### 6. Directive Propagation Map

Who reads directives directly, who receives them via relay, and which directive sections target which agents.

### 7. Error Classification

A table categorizing errors by severity and behavior:

| Severity | Behavior | Examples |
|----------|----------|---------|
| Fatal | Pipeline stops | Required specialist fails |
| Blocking | Task/step skipped | Writer fails for one task |
| Non-blocking | Warning, continue | Optional pass fails |
| Informational | Reported only | Front-matter issues |

## Path Enumeration Rules

### What counts as a distinct path

A path is a unique end-to-end execution scenario through the pipeline. Two scenarios are distinct if they:

1. **Invoke different agents** (e.g., happy path vs. skip-pass directive)
2. **Take different branches within the same agent** (e.g., Pass 2 mode vs. Pass 3 mode in analysis-coordinator)
3. **Produce different state transitions** (e.g., converged vs. needs-reentry after gap hunting)
4. **Handle different error conditions** (e.g., blocking vs. non-blocking failure)

### Minimum path set

Every routing document must include at minimum:

| Path | Description |
|------|-------------|
| Happy path | Full nominal execution, no errors, no re-entry |
| Re-entry cycle | Gap-hunting finds issues, cascade reset, re-execution |
| Crash recovery | Pipeline resumes from partial progress |
| Each non-blocking failure | One path per non-blocking pass that can fail gracefully |
| Each degraded mode | One path per degraded execution mode |
| Forced convergence | Re-entry cycle limit exhausted |

### Optional but recommended paths

- Directive-driven paths (skip, halt, re-run)
- Cold start (first-ever execution with no history)
- Per-coordinator internal loops (rewrite cycles, reviewer loops)
- Task-level blocked states

## Maintenance Rules

### When to update

1. **After every audit fix** — any change to agent routing, state management, artifact contracts, or error handling
2. **After adding/removing agents** — new agents create new paths or modify existing ones
3. **After changing re-entry logic** — the most fragile part of the pipeline
4. **After changing bootstrap schema** — new fields may enable new paths

### How to update

1. Identify which paths are affected by the change
2. Update those specific paths (don't rewrite the whole document)
3. If the change creates a new execution scenario, add a new path entry
4. If the change removes an execution scenario, remove the path entry
5. Update the path index table to reflect adds/removes
6. Update reference sections (artifact graph, state machine, dispatch sequences) if affected

### Staleness detection

During an audit, if you find that the routing document doesn't match the actual agent instructions:

1. **Flag as a finding** (Medium severity: "Architecture Doc Incomplete" from `common-findings.md`)
2. **Update the document** as part of Phase 5
3. **Note the drift** — if the document was recently created but already inaccurate, the maintenance discipline needs reinforcement

## Using the Routing Document for Audits

### Path-by-path tracing

For each path in the document:

1. Read the path description
2. Open the agent files referenced in the path
3. Verify each step:
   - Is the dispatch condition correct?
   - Does the agent read the artifacts listed?
   - Does the agent write the artifacts listed?
   - Are the progress mutations correct?
   - Does the error handling match?
4. Record discrepancies as findings tagged with path ID

### Cross-path analysis

After tracing individual paths:

1. Check that paths covering the same agent are consistent (agent behavior shouldn't contradict between paths)
2. Check that paths sharing artifacts have compatible schemas
3. Check that state machine transitions across paths are well-defined (no ambiguous states)

### Coverage check

After completing path traces:

1. List every conditional branch in the orchestrator's routing table — each must map to at least one path
2. List every error handler in each coordinator — each must map to at least one path
3. List every mode detection branch in coordinators — each must map to at least one path
4. If any branch has no corresponding path, either the path is missing from the document or the branch is dead code
