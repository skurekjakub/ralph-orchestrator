# Docwriter Agent Family — Changelog

## 2026-03-14

### PR-Preparer Removal

Removed the `docwriter-pr-preparer` agent and all commit/PR preparation from the pipeline. Documentation files are now left unstaged in git for the orchestrator or user to commit.

- **Deleted** `docwriter-pr-preparer.agent.md`
- **docwriter.agent.md** — removed pr-preparer from architecture tree, removed `branch` from `pipeline-summary.json` schema
- **docwriter-delivery-coordinator.agent.md** — removed pr-preparer from agents list, removed Step 3 (dispatch pr-preparer), removed `prReady`/`branch`/`filesInCommit` from status schema, removed PR-related directives, updated manifest action to "files ready for review (unstaged)", updated role description and error handling

### Gap Hunter Zero-Tolerance Policy

Strengthened gap-hunting to block the pipeline on any identified gap, regardless of perceived severity.

- **docwriter-gap-hunter.agent.md** — removed `severity` field from gap schema, removed `bySeverity` from `convergenceAssessment`, removed `reEntryTarget: "none"` (every gap must have an actionable target), added zero-tolerance convergence rule (any gap = `converged: false`), added constraints: "No severity rankings", "Never defer gaps to follow-up"
- **docwriter-verification-coordinator.agent.md** — convergence check now requires `totalGaps === 0` to pass, added explicit zero-tolerance rule preventing gaps from being passed through as "known follow-up items"

### Evaluation Skill Maintenance

- **common-findings.md** — generalized pr-preparer example in Hardcoded Dynamic Path pattern

## 2026-03-13

### Workflow Evaluation — 11 Findings Fixed

Full adversarial audit of all 28 agents using the `agent-fractal-workflow-eval` skill. 11 findings identified (3 HIGH, 7 MEDIUM, 1 LOW), all resolved. Re-evaluation confirmed 0 remaining issues.

#### HIGH

- **F1 — Phantom "verified" status:** Removed references to nonexistent `"verified"` task status from `docwriter-execution-coordinator.agent.md` (dependsOn gate) and `docwriter-gap-hunter.agent.md` (coverage check). Valid terminal statuses are `"written"` and `"blocked"`.
- **F2 — Missing research-scout in pipeline summary:** Added `agents/research-scout-status.json` to the orchestrator's "Read all results" list, so research recommendation counts appear in `pipeline-summary.json`.
- **F3 — Bootstrap schema gap for retrospectives:** Added `task` section (with `id` field) to `context.json` bootstrap template in `docwriter-bootstrap.sh`. Updated `docwriter-knowledge-integrator.agent.md` to declare `context.json` as an input, renamed `issueKey` → `taskId` in retrospective schema. Updated `docwriter-knowledge-curator.agent.md` retrospective reference to match.

#### MEDIUM

- **F4 — Missing currentPass updates:** Added `currentPass` writes for Pass 0 and Pass 6.5 in the orchestrator's After Pass handlers. Previously only coordinator-dispatched passes set `currentPass`.
- **F5 — Dead Re-Entry Handling section:** Replaced `docwriter-verification-coordinator.agent.md`'s stale "Re-Entry Handling" section with a note explaining that cascade-reset is handled by the orchestrator and mode detection naturally re-executes both passes.
- **F6 — No error handling in verification-coordinator:** Added Error Handling section to `docwriter-verification-coordinator.agent.md` specifying behavior for cross-ref-updater and gap-hunter failures.
- **F7 — Phantom research-brief.json in gap-hunter:** Trimmed `docwriter-gap-hunter.agent.md` Invariant Supremacy section to reference only `knowledge-brief.json`, removing references to `research-brief.json` which the gap-hunter does not receive as input.
- **F8 — Invariant supremacy temporal violation:** Added temporal guard to `docwriter-discovery-coordinator.agent.md` invariant-supremacy section: "if `invariant-inventory.json` exists from a prior run". On first run the file doesn't exist yet (created in Pass 2).
- **F9 — Hardcoded changelog path:** Changed `docwriter-pr-preparer.agent.md` to read `changelogPath` from `changelog-writer-status.json` instead of hardcoding `changelog-entry.md`.
- **F10 — Missing noDocImpactSummary:** Added `noDocImpactSummary` field to `docwriter-task-planner.agent.md` output schema for changes with no documentation impact.

#### LOW

- **F11 — Dead third mode branch:** Removed unreachable third mode detection branch from `docwriter-verification-coordinator.agent.md` (consolidated with F5 fix).

### Evaluation Skill Augmentation

- **references/common-findings.md** — added 7 new finding patterns: Phantom Status Value, Bootstrap Schema Gap, Invariant Supremacy Temporal Violation, Hardcoded Dynamic Path, Schema-Instruction Desync, Unreadable Pipeline Summary Field, Missing Coordinator Error Handling
- **references/checklist.md** — added Category 10 (Bootstrap & Context Completeness)
- **references/data-flow-analysis.md** — added Cascade Reset Verification section
- **SKILL.md** — added 3 new principles (temporal awareness, bootstrap completeness, coordinator error handling)

## 2026-03-12

### Initial Build

Built the complete docwriter fractal agent family — 29 agents (now 28) across 9 passes in a depth-2 hierarchy with files-only communication.

- Orchestrator: `docwriter.agent.md`
- 6 coordinators: discovery, analysis, execution, verification, synthesis, delivery
- 21 specialists across passes 0–7
- Bootstrap script: `docwriter-bootstrap.sh`
- Directives system with `## Routing`, `## Global`, `## Context`, `## Pass N`, `## Task T-NNN` sections
- Invariant supremacy enforcement throughout the hierarchy
- Re-entry loop with cascade reset (max 3 cycles)
- Knowledge curation (Pass 0) and synthesis (Pass 6.5) for cross-run learning
- Evaluation skill: `.github/skills/agent-fractal-workflow-eval/`

### Extensions

- Timestamp instructions added to all agents
- Directive injection system (D-001 through D-013) implemented across all coordinators and specialists
- Doc-index preservation with freshness check for re-entry cycles
