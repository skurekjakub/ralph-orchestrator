# Phase 7: Delivery Agents

**Status:** not-started
**Agents:** 4 (1 coordinator + 3 specialists)
**Dependencies:** Phase 6 (gap-hunter converged or human decided to proceed)

## Objective

Ensure the migrated system is production-ready. Produce final reports, documentation, and handoff artifacts.

## Entry Condition

This phase is reached when:
- Gap-hunter reports `verified` (found nothing new) — convergence
- OR human decides coverage is sufficient and proceeds manually

## Agents

### `delivery-coordinator.agent.md`

**Role:** Pure router. Dispatches delivery specialists sequentially.

**Prompt requirements:**
1. Dispatch `hardening-checker` first
2. Dispatch `documentation-writer` after hardening check
3. Dispatch `handoff-writer` last (needs all other outputs)
4. When all three report completed, write own `status.json` with `result: delivered`

**Inputs:** Child `status.json` files
**Outputs:** `.migration/agents/delivery-coordinator/status.json`

---

### `hardening-checker.agent.md`

**Role:** Verify the migrated system is production-ready beyond functional parity.

**Reads:**
- `.migration/verification-matrix.json` — what passed and failed
- `.migration/risk-register.json` — open risks
- `.migration/rollback-plan.json` — rollback readiness
- Migrated codebase

**Checks and writes:**

1. **Performance:** Are hot paths identified in risk-register still performant? Any obvious N+1 queries, missing indexes, unoptimized loops?

2. **Resilience:** Error recovery, retry logic, graceful degradation. Do error handlers log properly? Are external service calls wrapped with timeouts?

3. **Accessibility:** If the migration includes UI, basic accessibility checks (semantic HTML, ARIA labels, keyboard navigation).

4. **Observability:** Logging, monitoring hooks, health endpoints. Are they preserved from the old system?

5. **Rollback readiness:** Read `rollback-plan.json`. Verify:
   - Each rollback plan references real files/tables
   - Steps are in correct order
   - Data backup requirements are addressed

6. **Open risk review:** Read `risk-register.json`. For each `open` risk:
   - Has it been addressed by the migration?
   - If yes, update status to `resolved` with notes
   - If no, flag it in the hardening report

**Output:**
- `.migration/agents/hardening-checker/output.md` — hardening report with pass/fail per category
- Standard artifact contract

---

### `documentation-writer.agent.md`

**Role:** Produce migration documentation from artifacts.

**Reads:** All `.migration/` artifacts.

**Writes:**
1. **Decision log** — compiled from `migration-manifest.json` and agent outputs. What was done, in what order, and why.
2. **Changelog** — user-facing summary of what changed, organized by feature area.
3. **Migration notes** — technical notes for the team: schema changes, config changes, new dependencies, breaking changes.

**Output:**
- `.migration/agents/documentation-writer/output.md` — combined documentation
- Standard artifact contract

---

### `handoff-writer.agent.md`

**Role:** Produce the final delivery summary.

**Reads:** All `.migration/` artifacts + all delivery specialist outputs.

**Writes:**

1. **Executive summary** — what was migrated, what was verified, confidence level
2. **Coverage summary:**
   - Features: discovered → analyzed → planned → implemented → verified
   - Slices: planned → implemented → verified
   - Gap-hunting cycles completed, trend
3. **Outstanding items:**
   - Open risks from risk-register
   - Failed parity slices (if any)
   - Deferred features
   - Skipped verification oracles
4. **Rollback readiness** — summary from hardening-checker
5. **Recommendations** — what to monitor post-migration, what to revisit

**Output:**
- `.migration/agents/handoff-writer/output.md` — final handoff report
- Standard artifact contract

## Verification

- [ ] Hardening report checks all categories (performance, resilience, accessibility, observability, rollback)
- [ ] Open risks from risk-register are addressed or explicitly flagged as accepted
- [ ] Documentation references real artifacts (not hallucinated file names)
- [ ] Handoff summary counts match `progress.json` counts
- [ ] Outstanding items list is complete (cross-check against task-graph for non-verified slices)
- [ ] Rollback plan is validated (hardening-checker verified it)
- [ ] All three specialists wrote `status.json` files
- [ ] Delivery coordinator wrote `status.json` with `result: delivered`
