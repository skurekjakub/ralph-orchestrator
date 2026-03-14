# Phase 4: Planning Agents

**Status:** not-started
**Agents:** 2 new + 1 update
**Dependencies:** Phase 3 (behavior-matrix.json + dependency-graph.json must exist)

## Objective

Transform the feature-and-behavior graph into a dependency-ordered executable task graph. Produces `task-graph.json`, `rollback-plan.json`, and `risk-register.json`.

## Agents

### `slice-planner.agent.md`

**Reads:**
- `.migration/feature-inventory.json`
- `.migration/behavior-matrix.json`
- `.migration/dependency-graph.json`

**Writes:**
- `.migration/task-graph.json`
- `.migration/rollback-plan.json`

**Prompt requirements:**

1. **Decompose features into slices.** Use dependency-graph clusters as starting candidates. Each slice should be:
   - One workflow, one route family, one data boundary, one component cluster, or one subsystem seam
   - Small enough for one coder session (the coder must be able to hold the full scope in context)
   - Large enough to be meaningful (don't create a slice for a single utility function)

2. **Dependency ordering is absolute.** If slice B `dependsOn` slice A, then A MUST appear before B in the `slices` array. This is the execution order. Validate: no forward references in `dependsOn`.

3. **Inline invariants from behavior-matrix.** For each feature in the slice's `featureIds`, copy all `invariants` from `behavior-matrix.json` into the slice's `invariants` array. The coder needs these inline — don't make them look it up.

4. **Scope boundaries are mandatory.** Every slice must have:
   - `scope.sourceFiles` — which files to read/modify
   - `scope.targetPattern` — what the migrated code should look like
   - `scope.boundaryNotes` — what is explicitly NOT in scope

5. **Acceptance criteria** — specific, testable conditions for "done"

6. **Verification oracles** — which oracle types are relevant for this slice:
   `journey`, `contract`, `visual`, `data-parity`, `auth-parity`, `error-parity`

7. **Rollback plan** — for every slice, write an entry in `rollback-plan.json` with concrete reversal steps

8. **Slice entry schema:**
   ```json
   {
     "id": "S-NNN",
     "name": "Descriptive slice name",
     "description": "What this slice migrates",
     "featureIds": ["F-001", "F-002"],
     "dependsOn": ["S-001"],
     "status": "planned",
     "assignee": null,
     "priority": 1,
     "scope": {
       "sourceFiles": ["path/to/source.ts"],
       "targetPattern": "Description of target architecture",
       "boundaryNotes": "What is NOT in scope — be explicit"
     },
     "acceptanceCriteria": ["Specific testable condition"],
     "invariants": ["Copied from behavior-matrix"],
     "rollbackNotes": "Brief summary, full plan in rollback-plan.json",
     "verificationOracles": ["journey", "contract"],
     "addedBy": "slice-planner",
     "addedInCycle": 1
   }
   ```

9. Standard artifact contract: `status.json` + `manifest.json` prepend (newest first) + `output.md`

---

### `risk-analyzer.agent.md`

**Reads:**
- `.migration/task-graph.json`
- `.migration/behavior-matrix.json`
- `.migration/dependency-graph.json`

**Writes:**
- `.migration/risk-register.json`

**Prompt requirements:**

1. For EACH slice, assess risks across categories:
   | Category | What to look for |
   |---|---|
   | `behavioral` | Invariants that are hard to preserve, implicit behaviors, race conditions |
   | `data-loss` | Schema changes, migration scripts, data transformation |
   | `performance` | Hot paths, caching behavior, query patterns |
   | `security` | Auth changes, permission models, secret handling |
   | `integration` | Cross-system boundaries, API contracts with external services |
   | `unknown` | Anything flagged as `unknowns` in feature-inventory |

2. Severity levels:
   - `critical` — data loss or security breach if wrong
   - `high` — feature break or regression likely
   - `medium` — potential issue, mitigation available
   - `low` — minor concern, low probability

3. Every risk must have a concrete `mitigation` — not "be careful" but a specific action

4. **Anti-laziness rule:** If a slice has zero risks, the analyzer is being lazy. Every migration has risk. At minimum: "behavioral invariants may have implicit dependencies not captured in analysis."

5. Risk entry schema:
   ```json
   {
     "id": "R-NNN",
     "sliceId": "S-001",
     "featureIds": ["F-001"],
     "severity": "high",
     "category": "behavioral",
     "description": "Specific risk description",
     "mitigation": "Specific action to mitigate",
     "status": "open",
     "addedBy": "risk-analyzer",
     "addedAt": "<timestamp>",
     "resolvedBy": null,
     "resolvedAt": null
   }
   ```

6. Standard artifact contract: `status.json` + `manifest.json` prepend (newest first) + `output.md`

---

### Update: `planning-coordinator.agent.md`

Extend the Phase 3 coordinator with Pass 3 routing:

**Pass 3 routing (append to existing Pass 2 routing):**
1. After Pass 2 completes (`result: deepened`), dispatch `slice-planner`
2. After slice-planner reports `planned`, dispatch `risk-analyzer`
3. After risk-analyzer reports `planned`, write own `status.json` with `result: planned`

## Verification

- [ ] `task-graph.json` exists and is valid JSON
- [ ] `task-graph.json.slices` is dependency-ordered: no `dependsOn` references point to later slices
- [ ] Every slice has non-empty `invariants` array (copied from behavior-matrix)
- [ ] Every slice has `scope.sourceFiles` and `scope.boundaryNotes`
- [ ] Every slice has at least one `acceptanceCriteria` entry
- [ ] Every slice has at least one `verificationOracles` entry
- [ ] Every feature with `status: analyzed` maps to at least one slice's `featureIds`
- [ ] Slice IDs are sequential and unique
- [ ] `rollback-plan.json` has an entry for every slice ID
- [ ] `risk-register.json` has at least one risk per slice
- [ ] Risk mitigations are concrete (not "handle carefully")
- [ ] Both specialists wrote `status.json` with `result: planned`
- [ ] Planning coordinator wrote `status.json` with `result: planned`
