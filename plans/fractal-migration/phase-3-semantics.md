# Phase 3: Semantics Agents

**Status:** not-started
**Agents:** 3 (1 coordinator + 2 specialists)
**Dependencies:** Phase 2 (feature-inventory.json must exist with discovered features)

## Objective

Deepen each discovered feature into behavioral semantics and map cross-feature dependencies. Produces `behavior-matrix.json` and `dependency-graph.json`.

## Agents

### `planning-coordinator.agent.md`

**Role:** Pure router for Pass 2 (semantics) and Pass 3 (planning). In this phase, handles Pass 2 only. Extended in Phase 4 with Pass 3 routing.

**Pass 2 routing:**
1. Dispatch `semantics-analyzer` — must complete first (behavior matrix needed for dependency analysis)
2. Dispatch `dependency-analyzer` after semantics-analyzer reports `deepened`
3. When both report `deepened`, write own `status.json` with `result: deepened`

**Inputs:** Child `status.json` files only
**Outputs:** `.migration/agents/planning-coordinator/status.json`

---

### `semantics-analyzer.agent.md`

**Reads:**
- `.migration/feature-inventory.json` — all features with `status: discovered`
- Source code — to analyze actual behavior

**Writes:**
- `.migration/behavior-matrix.json` — behavioral semantics per feature
- Updates `feature-inventory.json` — sets processed features to `status: analyzed`, updates `confidence`

**Prompt requirements:**

1. For EACH feature in the inventory, extract:

   **State transitions:**
   ```json
   {
     "from": "state-A",
     "to": "state-B",
     "trigger": "What causes this transition",
     "sideEffects": ["Observable effects of this transition"]
   }
   ```

   **Validation rules:**
   ```json
   {
     "field": "field-name",
     "rules": ["required", "format-check", "uniqueness-constraint"],
     "errorBehavior": "What happens when validation fails"
   }
   ```

   **Auth rules:**
   ```json
   {
     "requiredRole": "role or permission required",
     "deniedBehavior": "What happens when unauthorized"
   }
   ```

   **Error paths:** Array of strings describing non-happy-path behaviors. EVERY error response, redirect, and fallback must be captured. This is NOT optional — missing error paths are the #1 source of migration regressions.

   **Async behavior:** Background jobs triggered by this feature, event emissions, queue operations, scheduled callbacks.

   **Invariants:** Behavioral rules that MUST be preserved 1:1. These are the most important field in the entire system. Examples:
   - "User cannot log in until status is active"
   - "Verification token is single-use"
   - "Registration is idempotent for the same email within 5 minutes"

2. After processing each feature:
   - Update `feature-inventory.json`: set `status: analyzed`, update `confidence`, set `lastUpdatedBy: semantics-analyzer`
   - If analysis reveals new unknowns, add them to the feature's `unknowns` array

3. Standard artifact contract: `status.json` + `manifest.json` prepend (newest first) + `output.md`

---

### `dependency-analyzer.agent.md`

**Reads:**
- `.migration/feature-inventory.json` — all features
- `.migration/behavior-matrix.json` — behavioral details (for identifying cross-references)
- Source code — to trace imports, shared modules, data flow

**Writes:**
- `.migration/dependency-graph.json`
- Updates `feature-inventory.json` — populates `dependencies` arrays on features

**Prompt requirements:**

1. Build a directed graph of feature dependencies:
   - **Nodes:** One per feature from inventory
   - **Edges:** Directed relationships between features

2. Edge types:
   | Type | Meaning | Migration implication |
   |---|---|---|
   | `depends-on` | Cannot function without target | Must migrate target first |
   | `uses` | Runtime call/reference to target | Target should be stable before migration |
   | `shares-data` | Both read/write same data model | Migrate together or coordinate schema |
   | `shares-ui` | Shared UI components | Migrate component first or abstract interface |

3. Identify **clusters** — groups of features with enough edges to form a natural migration unit:
   ```json
   {
     "id": "CL-NNN",
     "name": "Descriptive cluster name",
     "featureIds": ["F-001", "F-002"],
     "description": "Why these features cluster together"
   }
   ```

4. Cluster guidelines:
   - A cluster should be 2–8 features. Larger clusters suggest further decomposition needed.
   - A single-feature "cluster" is fine if the feature is truly standalone.
   - Not every feature needs to be in a cluster — unclustered features are standalone migration candidates.

5. Update `dependencies` arrays on features in `feature-inventory.json`

6. Standard artifact contract: `status.json` + `manifest.json` prepend (newest first) + `output.md`

## Verification

- [ ] `behavior-matrix.json` exists and is valid JSON
- [ ] Every feature with `status: analyzed` in inventory has a behavior-matrix entry
- [ ] Every behavior-matrix entry has at least one `invariant` (zero invariants is suspicious — escalate)
- [ ] Error paths are specific (not "returns error") — they name status codes, messages, redirects
- [ ] `dependency-graph.json` exists and is valid JSON
- [ ] All feature IDs in graph nodes exist in `feature-inventory.json`
- [ ] All edge `from`/`to` reference existing nodes
- [ ] No self-referential edges
- [ ] Clusters have 2–8 features each (flag outliers)
- [ ] Features in `feature-inventory.json` with `status: analyzed` have populated `dependencies` arrays
- [ ] `confidence` values were updated (some should have changed from discovery values)
- [ ] Both specialists wrote `status.json` with `result: deepened`
- [ ] Planning coordinator wrote `status.json` with `result: deepened`
