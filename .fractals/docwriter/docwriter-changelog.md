# Docwriter Agent Family — Changelog

## 2026-03-14

### Source Observations Meta-Knowledge

Added `source-observations` as a new knowledge type in the meta-knowledge pipeline. Source observations capture reusable code→documentation predictors — source code characteristics that reliably predict specific documentation needs (e.g., "functions with >5 params → usage examples", "modules with inter-service calls → sequence diagrams").

**Synthesis pipeline (writers):**
- **docwriter-context-signal-analyzer.agent.md** — new Signal B5 "Source-code observation extraction": reads `code-analysis.json` to extract generalizable code→doc predictors (structural predictors, dependency-driven predictors, change-type predictors); outputs `sourceObservations` array in `context-signals.json`
- **docwriter-knowledge-integrator.agent.md** — handles `SRC-NNN` entry type alongside PAT/ANTI/DOM/STYLE; writes to `meta/source-observations/`; SRC entry format documented (Code Characteristic / Predicted Doc Need / Evidence / Applicability); retrospective includes `sourceObservationsDiscovered`
- **docwriter-skill-rebuilder.agent.md** — rebuilds 7 reference files (was 6); new `source-observations.md` with per-entry format showing code characteristic + predicted doc need; SKILL.md template includes source observations count

**Curation pipeline (brief):**
- **docwriter-knowledge-curator.agent.md** — `source-observations` added to inputs, phase-targeted grouping (P2, consumers: code-analyzer/task-planner/gap-hunter), brief schema (`sourceObservations` array + count), status schema

**Consumer agents (readers):**
- **docwriter-code-analyzer.agent.md** — reads `source-observations.md` before per-file analysis; matching code characteristics add predicted doc needs to `docFacts` output
- **docwriter-task-planner.agent.md** — reads `source-observations.md` in pre-planning; cross-references code-analysis against known predictors to add SRC-NNN–cited task requirements
- **docwriter-gap-hunter.agent.md** — reads `source-observations.md` in history-informed gap hunting (step 6.4); verifies predicted doc needs were addressed; unmet predictions flagged as high-confidence gaps

**Coordinator:**
- **docwriter-synthesis-coordinator.agent.md** — validation count updated from 5 to 6 reference files

### A-5: Verbose Process Sections → Tables

Compressed prose-heavy process sections into table format in the two longest specialists.

- **docwriter-invariant-scanner.agent.md** — Steps 1-5 rewritten: file classification rules → table, domain list → table, merge rules → table, ID assignment rules → table. ~45% reduction in Process section.
- **docwriter-task-planner.agent.md** — Pre-planning knowledge consultation (4 numbered items with sub-bullets) → single table. Steps 2-3 (task scope + invariant inlining) condensed from bullet lists to compact prose.

### C-2: Smart Re-Entry Targeting

Re-entry cycles now reset only gap-identified tasks instead of redoing entire passes.

- **docwriter-gap-hunter.agent.md** — added `affectedTaskIds` field to gap schema (structured T-* IDs); new `### affectedTaskIds` section documents targeting rules per re-entry target (pass4 = specific tasks, pass3 = tasks or empty for new, pass2/pass5 = empty)
- **docwriter-execution-coordinator.agent.md** — Step 0 renamed to "Check for re-entry gaps (smart task targeting)"; uses `affectedTaskIds` from gap-analysis.json instead of parsing evidence text; explicitly preserves all `"written"` tasks not in the affected set
- **docwriter-task-planner.agent.md** — new Step 0 "Check for re-entry (smart task targeting)": on pass3 re-entry, reads gap-analysis.json, modifies only `affectedTaskIds` tasks, creates new tasks for gaps with empty `affectedTaskIds`, preserves unaffected `"written"` tasks; status schema extended with `reEntryActions` field
- **ROUTING-ARCHITECTURE.md** — P-02 updated with smart targeting flow (affectedTaskIds propagation); Pass 3 and Pass 4 coordinator dispatch sequences updated

## 2026-03-13

### Workflow Audit — 6 Findings Fixed

Full 10-category evaluation using `agent-fractal-workflow-eval` skill across all 31 agents, bootstrap, and orchestrator.

**H-1: `--clean` destroys user-filled `context.json`** — `context.json` was not in the bootstrap `--clean` exclusion list, forcing users to re-fill all fields on every re-run. Fixed: added `context.json` to exclusion list; changed seed to only generate if file doesn't exist.
- **docwriter-bootstrap.sh** — added `! -name "context.json"` to find exclusion, made context.json seed conditional

**H-2: Crash-unsafe `pass6_gapHunting = "needs-reentry"` status** — The verification coordinator could set `pass6_gapHunting` to the non-standard value `"needs-reentry"`, which no routing condition handles on crash recovery (deadlock). Fixed: verification coordinator now always sets `pass6_gapHunting` to `"done"` and communicates re-entry need via `gapHunting.reEntryTarget`. Orchestrator routing table replaced the event-based "Verification result" entry with a state-based condition checking `reEntryTarget !== null`.
- **docwriter-verification-coordinator.agent.md** — always sets pass6 to "done"; writes reEntryTarget for gap-found cases
- **docwriter.agent.md** — routing table: new state-based condition `pass6 done AND reEntryTarget non-null`; re-entry logic: reads reEntryTarget from progress.json instead of status file

**M-1: Duplicate progress.json updates for Pass 0.5** — Both the codebase-orientation-coordinator and the orchestrator's "After Pass 0.5" handler updated progress.json. Fixed: removed progress update from coordinator (consistent with synthesis-coordinator pattern — all non-blocking passes let the orchestrator manage progress).
- **docwriter-codebase-orientation-coordinator.agent.md** — removed progress.json update from Completion section

**M-2: Inaccurate downstream consumer list in codebase-curator** — Claimed impact-mapper reads `meta/codebase-map.json`, but it doesn't (gets cross-module info transitively via code-analysis.json's `crossCuttingMap`).
- **docwriter-codebase-curator.agent.md** — removed impact-mapper from Downstream Consumers list

**M-3: `risk-register.json` produced but never consumed** — Risk-analyzer claimed execution-coordinator uses the register, but execution-coordinator never referenced it. Fixed: added risk-register.json to execution-coordinator's task processing and writer dispatch.
- **docwriter-execution-coordinator.agent.md** — Step 1 now reads risk-register.json; Step A includes risk mitigations for high/critical tasks in writer dispatch

**L-1: Gap-hunter referenced `research-brief.json` in Invariant Supremacy boilerplate without listing it as input** — Copy-paste artifact; gap-hunter audits coverage, not writing quality. Fixed: removed research-brief reference from Invariant Supremacy section.
- **docwriter-gap-hunter.agent.md** — simplified Invariant Supremacy to reference only knowledge-brief.json

## 2026-03-14

### Task Instructions — Ephemeral Run-Scoped Invariants

Added `task.instructions` array to `context.json` for per-task rules that are enforced as invariants during the run but never persisted into meta-knowledge.

- **docwriter-bootstrap.sh** — added `"instructions"` array to context.json template's `task` section with placeholder examples
- **docwriter-invariant-scanner.agent.md** — reads `task.instructions` from context.json; emits each as a `TINV-*` invariant with `ephemeral: true`; previous run's `TINV-*` entries are always dropped before re-emitting; output schema updated with `ephemeral` field and `taskInstructionsEmitted` summary counter
- **docwriter-knowledge-integrator.agent.md** — new critical rule: skip `ephemeral: true` / `TINV-*` invariants during synthesis — they must never enter the persistent knowledge base

## 2026-03-15

### Task Description in Context

Added `task.description` as a first-class field in `context.json` so knowledge curation and downstream agents can understand task intent beyond just the code diff.

- **docwriter-bootstrap.sh** — added `"description"` field to context.json template's `task` section
- **docwriter-knowledge-curator.agent.md** — Step 2 "Build the task profile" now starts with "Task intent" reading `task.description`; domain areas and change scope also derive from it

### Codebase Orientation (Pass 0.5) — 3 New Agents

New agent batch that builds and maintains a persistent repo structure map (`meta/codebase-map.json`). Runs between knowledge curation (Pass 0) and discovery (Pass 1). Downstream agents start oriented with module boundaries instead of discovering structure ad-hoc.

- **docwriter-codebase-orientation-coordinator.agent.md** — NEW. Pure router. Dispatches surveyor → curator, validates outputs, updates progress.json with `pass05_codebaseOrientation`.
- **docwriter-codebase-surveyor.agent.md** — NEW. Cold-start (full scan) and warm-start (incremental verification) modes. Scans repo 2-levels deep: modules, tech stack, API surface, component relationships. Outputs `codebase-survey.json`.
- **docwriter-codebase-curator.agent.md** — NEW. Merges raw survey into persistent `meta/codebase-map.json`. Three-way merge with confidence promotion (`surveyed` → `verified` → `stable`). Deprecated modules survive one cycle before removal.
- **docwriter.agent.md** — added Pass 0.5 to architecture tree, routing table, frontmatter agents list, After Pass 0.5 handler, re-entry skip rule, pipeline-summary schema
- **docwriter-knowledge-curator.agent.md** — reads `meta/codebase-map.json` as input; domain area identification enriched by module names from the map
- **docwriter-code-analyzer.agent.md** — reads `meta/codebase-map.json` for orientation context (module boundaries, dependencies, entry points)
- **docwriter-bootstrap.sh** — added `pass05_codebaseOrientation` to progress.json, `codebaseModulesMapped` count, seed `meta/codebase-map.json` on fresh bootstrap

### Incremental Invariant Scanning

Invariant scanner now uses a persistent file hashmap to skip unchanged guideline files. Only new and modified files are re-scanned; unchanged-file invariants are carried forward; deleted-file invariants are removed. Invariant IDs remain stable across runs.

- **docwriter-invariant-scanner.agent.md** — complete rewrite of Process section: 6-step incremental pipeline (enumerate+hash → classify by change status → scan new/changed only → merge → preserve/assign IDs → write). New artifacts: `invariant-hashmap.json` (persistent file hash cache), enhanced `invariant-inventory.json` with `scanMode`, per-file `status`, and incremental summary stats
- **docwriter-bootstrap.sh** — seed empty `invariant-hashmap.json` on fresh bootstrap, preserve `invariant-hashmap.json` and `invariant-inventory.json` in `--clean` mode, updated header comment (31 agents, pass 0.5 in pass list)

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
