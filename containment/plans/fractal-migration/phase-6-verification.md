# Phase 6: Verification + Gap Hunting Agents

**Status:** not-started
**Agents:** 5 (1 coordinator + 4 specialists)
**Dependencies:** Phase 5 (implemented slices must exist)

## Objective

Verify migrated slices against the old system using multiple oracles (inline per-slice). Then run adversarial gap-hunting across the full codebase to find missed features and behaviors.

## Two Modes

The verification coordinator operates in two modes:

1. **Inline mode (Pass 5):** After each slice's coder→reviewer→test-writer cycle, dispatch validators for that specific slice. This runs as part of the execution loop.
2. **Gap-hunting mode (Pass 6):** After all slices are verified or blocked, dispatch gap-hunter across the full codebase.

## Agents

### `verification-coordinator.agent.md`

**Role:** Pure router. Two operational modes.

**Inline mode prompt:**
1. Receive slice ID from execution flow
2. Dispatch `journey-validator` for the slice (if `journey` in slice's `verificationOracles`)
3. Dispatch `contract-validator` for the slice (if `contract` in slice's `verificationOracles`)
4. Dispatch other validators as declared
5. After all oracle-specific validators complete, dispatch `parity-checker` to aggregate results
6. If parity-checker reports `verified`, the slice is done
7. If parity-checker reports `failed-parity`, signal re-execution needed

**Gap-hunting mode prompt:**
1. Dispatch `gap-hunter` across the full codebase
2. If gap-hunter reports `uncovered-gap`:
   - Check `task-graph.json` for new entries
   - Determine re-entry point: Pass 2 (needs analysis) or Pass 3 (ready to plan)
   - Write own `status.json` with `result: uncovered-gap` and `next_hint` indicating re-entry pass
3. If gap-hunter reports `verified` (found nothing new):
   - Write own `status.json` with `result: verified`

**Inputs:** Child `status.json` files + `verification-matrix.json`
**Outputs:** `.migration/agents/verification-coordinator/status.json`

---

### `journey-validator.agent.md`

**Role:** Run Playwright-based user journey comparisons between old and new systems.

**Prompt requirements:**
1. Read the slice's features from `feature-inventory.json`
2. Read behavioral details from `behavior-matrix.json` — specifically state transitions and validation rules
3. For each state transition in the slice's features:
   - Script a Playwright test against the OLD system to capture expected behavior
   - Run the same test against the NEW system
   - Compare: navigation flow, form submissions, redirects, error states, final state
4. Write results to `verification-matrix.json[<slice-id>][journey]`:
   ```json
   {
     "status": "pass" | "fail",
     "summary": "Specific result description",
     "details": "journey-validator/<slice-id>-journey.md",
     "checkedAt": "<timestamp>"
   }
   ```
5. If the test environment doesn't support Playwright (no browser), write `status: "skipped"` with reason — NEVER write `pass` if you didn't actually run the check.

---

### `contract-validator.agent.md`

**Role:** Diff API contracts between old and new systems.

**Prompt requirements:**
1. Read the slice's API features from `feature-inventory.json`
2. For each API endpoint in the slice:
   - Compare: URL patterns, HTTP methods, request payload shape, response payload shape, status codes, error response shape, headers
3. Write results to `verification-matrix.json[<slice-id>][contract]`
4. A contract diff is a FAILURE even if the behavior is "the same but different shape" — the contract must match unless explicitly documented as an intentional change.

---

### `parity-checker.agent.md`

**Role:** Aggregate oracle results. Determine slice-level pass/fail.

**Prompt requirements:**
1. Read `verification-matrix.json` for the target slice
2. Read the slice's `verificationOracles` from `task-graph.json`
3. For each declared oracle:
   - Check its `status` in the verification matrix
   - `pass` → ok
   - `fail` → slice fails
   - `skipped` → flag but don't auto-fail (human decision)
4. Set slice-level status:
   - ALL oracles `pass` → `verified`
   - ANY oracle `fail` → `failed-parity`
   - ALL `pass` or `skipped` → `verified` with warning
5. Update slice status in `task-graph.json`
6. Write own status: `result: verified` or `result: failed-parity`

---

### `gap-hunter.agent.md`

**This is the most critical agent for migration correctness.** Its prompt must be the most detailed and adversarial.

**Role:** Assume the migration is incomplete. Search the entire codebase for missed features and behaviors.

**Prompt requirements:**

1. **Read ALL artifacts:**
   - `feature-inventory.json` — what was found
   - `behavior-matrix.json` — what was analyzed
   - `task-graph.json` — what was planned
   - `verification-matrix.json` — what was verified
   - Source code — what actually exists

2. **Search for what's NOT in the inventory:**
   - Scan source code for routes not in `feature-inventory.json[routes]`
   - Scan for API endpoints not in `feature-inventory.json[api]`
   - Scan for data models not in `feature-inventory.json[data]`
   - Scan for background jobs not in `feature-inventory.json[jobs]`
   - Scan for config readers not in `feature-inventory.json[config]`
   - Scan for UI components not in `feature-inventory.json[ui]`

3. **Search for hidden behaviors:**
   - Admin routes and hidden admin panels
   - Feature flags and conditional behaviors
   - Scheduled jobs in cron configs, systemd timers, cloud schedulers
   - Non-happy-path regressions (error handlers that do more than log)
   - Undocumented API endpoints (middleware-registered, dynamically routed)
   - Implicit behaviors (lifecycle hooks, framework conventions, magic methods)
   - Race conditions and timing-dependent behavior
   - Environment-dependent behavior (dev vs prod differences)

4. **Check for incomplete invariant coverage:**
   - For each analyzed feature, are ALL invariants represented in a slice?
   - Are there invariants that span multiple slices (cross-cutting concerns)?

5. **When items are found:**
   - Add new features to `feature-inventory.json` with `discoveredBy: gap-hunter` and `addedInCycle: current+1`
   - Add new slices to `task-graph.json` with `addedBy: gap-hunter` and `addedInCycle: current+1`
   - Increment `cycle` in `task-graph.json`
   - Flag whether new items need semantic analysis (→ re-enter Pass 2) or can go straight to planning (→ re-enter Pass 3)

6. **Result codes:**
   - `uncovered-gap` — found new items (include count in summary)
   - `verified` — found nothing new after thorough search

7. **Anti-laziness rules (MANDATORY in prompt):**
   - A gap-hunting pass that finds zero issues on the FIRST cycle should be treated with suspicion
   - Must document what was searched and what methods were used
   - Must list categories checked even if nothing was found per category
   - "I checked and everything looks fine" is NOT an acceptable output — must show work

## Verification

- [ ] `verification-matrix.json` has entries for all completed and verified slices
- [ ] Failed slices have specific failure descriptions (not "failed parity check")
- [ ] Oracle results reference detail files that actually exist
- [ ] Parity-checker correctly set slice status in `task-graph.json`
- [ ] Gap-hunter `output.md` documents search methodology and categories checked
- [ ] If first cycle: gap-hunter found at least some items (zero is suspicious)
- [ ] New items in `task-graph.json` have `addedBy: gap-hunter` and correct `addedInCycle`
- [ ] New features in `feature-inventory.json` have `discoveredBy: gap-hunter`
- [ ] Convergence tracking: `progress.json.gapHunting.newItemsLastCycle` is updated
