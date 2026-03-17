# Fractal Factory — Feature & Behavior Inventory

Comprehensive classification of every behavior, feature, and mechanism in the Fractal Factory system. Organized by functional area.

---

## 1. System Identity

| Property | Value |
|---|---|
| Type | Meta-level fractal orchestrator |
| Purpose | Produces validated fractal agent families from domain specifications |
| Agent count | 35 (1 guide + 1 orchestrator + 8 coordinators + 25 specialists) |
| Hierarchy depth | 3 levels (orchestrator → coordinator → specialist) |
| Pipeline passes | 9 (Pass 0 + 7 domain passes + Synthesis) |
| Execution model | Sequential pass pipeline with gap-hunting re-entry loops |

---

## 2. Agent Inventory

### 2.1 Guide Layer

| Agent | Role | Trigger |
|---|---|---|
| `fractal-factory-guide` | User-facing entry point. Gathers domain context via interview, builds `context.json`, invokes the session orchestrator. | User invocation |

### 2.2 Orchestrator Layer

| Agent | Role | Owns |
|---|---|---|
| `fractal-factory` | Session orchestrator. 8-pass pipeline router with re-entry logic and crash recovery. Sole writer of `progress.json`. | Pipeline routing, pass transitions, re-entry decisions, crash recovery |

**Orchestrator behaviors:**
- Routes to the next coordinator based on `progress.json.currentPass`
- Reads coordinator `status.json` to determine next action
- Implements gap-hunting re-entry: resets passes from re-entry target through gap-hunting to `pending`, deletes corresponding `status.json` files
- Crash recovery: detects `status == "active"` on startup, resets to `pending`, re-dispatches
- Enforces `maxGapCycles` limit — forces delivery after exhaustion
- Never resets Pass 0 or Synthesis

### 2.3 Coordinator Layer (8 agents)

All coordinators follow the **pure router** contract: they dispatch children, read results, make routing decisions, but never do domain work themselves.

| Agent | Pass | Children | Dispatch Pattern |
|---|---|---|---|
| `fractal-factory-discovery-coordinator` | 1 | domain-scanner → invariant-extractor → asset-auditor → exemplar-analyzer | Sequential |
| `fractal-factory-analysis-coordinator` | 2 | pipeline-architect → artifact-designer → depth-analyzer | Sequential |
| `fractal-factory-planning-coordinator` | 3 | roster-planner → routing-planner → test-planner | Sequential |
| `fractal-factory-execution-coordinator` | 4 | prompt-writer ↔ prompt-reviewer (batches), then infra-writer | Batch loop + sequential |
| `fractal-factory-verification-coordinator` | 5 | checklist-validator → audit-oracle | Sequential |
| `fractal-factory-gap-hunting-coordinator` | 6 | coverage-hunter → artifact-hunter → infrastructure-hunter | Sequential, aggregates into gap-report.json |
| `fractal-factory-synthesis-coordinator` | Synthesis | factory-signal-analyzer → context-signal-analyzer → knowledge-integrator | Sequential |
| `fractal-factory-delivery-coordinator` | 7 | packager → documentation-writer → report-writer | Sequential |

**Coordinator behaviors:**
- Re-entry awareness: analysis, planning, and execution coordinators pass gap context to children when `gap-report.json` exists and the pass was reset
- Execution coordinator implements the coder-reviewer batch loop (see §5.1)
- Gap-hunting coordinator aggregates 3 hunter outputs into unified `gap-report.json`

### 2.4 Specialist Layer (25 agents)

#### Discovery Specialists (Pass 1)

| Agent | Reads | Writes | Key Behavior |
|---|---|---|---|
| `domain-scanner` | domain-brief.md, domain-docs/, context.json | domain-model.json (subdomains) | Scans domain narrative, identifies subdomains with complexity and agent count estimates. Read-modify-write protocol. |
| `invariant-extractor` | invariants.md, domain-model.json | invariants/behavioral.json, invariants/structural.json, invariants/quality.json, invariants/workflow.json | Extracts behavioral rules, classifies by type, assigns confidence scores. Writes to per-classification files. |
| `asset-auditor` | exemplars/, existing skills/tools | domain-model.json (existingAssets) | Audits existing reusable assets — skills, agent templates, MCP servers, tools. Classifies reusability (direct/adaptable/reference-only). |
| `exemplar-analyzer` | exemplars/ | domain-model.json (exemplarPatterns) | Analyzes exemplar agent families for recurring patterns (hierarchy, naming, artifact, routing, anti-laziness, convergence). |

#### Analysis Specialists (Pass 2)

| Agent | Reads | Writes | Key Behavior |
|---|---|---|---|
| `pipeline-architect` | domain-model.json, context.json | architecture.json (pipeline) | Designs the produced system's pipeline passes — purposes, conditions, re-entry rules. |
| `artifact-designer` | domain-model.json, architecture.json | architecture.json (artifacts) | Designs shared artifact schemas and data flow between produced agents. |
| `depth-analyzer` | domain-model.json, architecture.json | architecture.json (depth) | Decides depth-2 vs depth-3 per coordinator in the produced system based on subdomain complexity. |

#### Planning Specialists (Pass 3)

| Agent | Reads | Writes | Key Behavior |
|---|---|---|---|
| `roster-planner` | domain-model.json, architecture.json | roster.json | Plans full agent roster: names, hierarchy, parent relationships, result codes, reads/writes declarations. |
| `routing-planner` | roster.json, architecture.json | roster.json (routing tables) | Designs routing tables for all produced coordinators: child result code → action mappings. |
| `test-planner` | roster.json, architecture.json, invariants/*.json | test-plan.json | Creates golden test scenarios: happy path, specialist behavior, coordinator routing, coder-reviewer loop, re-entry, convergence, edge cases. Covers all invariants. |

#### Execution Specialists (Pass 4)

| Agent | Reads | Writes | Key Behavior |
|---|---|---|---|
| `prompt-writer` | roster.json, architecture.json, domain-model.json, invariants/*.json, test-plan.json, gap-report.json (on re-entry) | produced-output/agents/*.agent.md | Writes `.agent.md` prompt files for the produced system. Works in batches of up to 5. Each prompt follows the `produced-agent.schema.md` structure. |
| `prompt-reviewer` | same as writer + the produced files | agents/fractal-factory-prompt-reviewer/status.json, output.md | Adversarial reviewer. Validates against structural checklist, routing consistency, contract completeness. Returns approved/rejected per batch. |
| `infra-writer` | roster.json, architecture.json, context.json | produced-output/ (bootstrap.sh, schemas/, skills/, tests/) | Writes non-prompt infrastructure: bootstrap script, schema docs, shared skills, test fixture files. Runs after all prompt batches. |

#### Verification Specialists (Pass 5)

| Agent | Reads | Writes | Key Behavior |
|---|---|---|---|
| `checklist-validator` | roster.json, architecture.json, invariants/*.json, produced-output/ | verification-report.json | Structural validation checklist. Checks every produced agent against required sections, contract completeness, routing table accuracy. |
| `audit-oracle` | roster.json, architecture.json, domain-model.json, produced-output/ | audit-report.json | Applies two expert perspectives: agent-as-function audit (AF-CONTRACT, AF-MANIFEST, AF-ROUTE checks) and fractal-workflow eval (FW-PIPELINE, FW-CONVERGENCE, FW-DEPTH checks). |

#### Gap-Hunting Specialists (Pass 6)

| Agent | Categories | Key Behavior |
|---|---|---|
| `coverage-hunter` | 1: Subdomain Coverage, 2: Invariant Enforcement, 3: Routing Completeness | For each subdomain/invariant/routing path, verifies at least one produced agent addresses it and tests exist. |
| `artifact-hunter` | 4: Artifact Coverage, 5: Test Coverage, 6: Cross-Reference Integrity | Checks artifact-to-agent mapping, test scenario completeness, and cross-ref links between artifacts. |
| `infrastructure-hunter` | 7: Bootstrap Completeness, 8: Documentation Coverage, 9: Meta-Knowledge Infrastructure | Checks bootstrap script creates all directories/files, docs cover all agents, meta-knowledge store is properly structured. |

**Gap-hunting behaviors:**
- All 3 hunters are adversarial agents with explicit anti-laziness rules
- Each hunter documents methodology per category: what was searched, how, what constitutes a gap
- Zero-gap first pass triggers mandatory second pass with different strategy
- Previous cycle gaps must be re-checked for resolution
- Gap severity: critical (missing agent/invariant) or warning (incomplete test/doc)

#### Synthesis Specialists (Post-convergence)

| Agent | Reads | Writes | Key Behavior |
|---|---|---|---|
| `factory-signal-analyzer` | domain-model.json, architecture.json, roster.json, produced-output/ | synthesis-signals/factory-signals.json | Extracts domain-specific learning signals: patterns, anti-patterns, subdomain-complexity correlations. Filters against knowledge-brief to avoid duplicates. |
| `context-signal-analyzer` | progress.json, verification-report.json, audit-report.json, gap-report.json | synthesis-signals/context-signals.json | Extracts process-level learning signals: which agents struggled, invariant-handling failures, convergence behavior, pipeline bottlenecks. |
| `knowledge-integrator` | synthesis-signals/*.json, meta/index.json | meta/index.json, meta/{category}/*.json, meta/run-retrospectives/ | Sole knowledge gatekeeper. Applies quality gate (domain-agnostic, actionable, non-trivial, non-duplicate) and confidence ladder (0.3→0.5→0.7→0.9) before writing to persistent store. Processes stale entries. Writes run retrospective. |

#### Delivery Specialists (Pass 7)

| Agent | Reads | Writes | Key Behavior |
|---|---|---|---|
| `packager` | context.json, produced-output/ | packaging-report.json, copies to output directory | Validates produced output completeness (all roster agents have files, bootstrap exists, schemas complete), copies to target outputDirectory. |
| `documentation-writer` | All artifacts + produced-output/ | produced-output/docs/ (architecture.md, user-guide.md, roster.md, README.md) | Writes 4 docs for the produced system: architecture overview, user guide with troubleshooting, roster reference, top-level README. |
| `report-writer` | All artifacts + verification + audit + gap reports | agents/fractal-factory-report-writer/output.md | Final delivery report: coverage statistics, quality metrics, pipeline execution summary, outstanding items, recommendations. |

---

## 3. Pipeline Architecture

### 3.1 Pass Sequence

| Pass | Name | Purpose | Re-entry Target |
|---|---|---|---|
| 0 | Knowledge Curation | Load cross-run meta-knowledge into task-relevant brief | Never reset |
| 1 | Discovery | Scan domain, extract invariants, audit assets, analyze exemplars | No |
| 2 | Analysis | Design pipeline, artifacts, depth decisions for produced system | Yes (from gap hunting) |
| 3 | Planning | Plan roster, routing tables, test scenarios | Yes (from gap hunting) |
| 4 | Execution | Write prompt files, review in batches, write infrastructure | Inherits from planning reset |
| 5 | Verification | Structural checklist + oracle audit | Inherits from execution reset |
| 6 | Gap Hunting | 9-category gap search, re-entry decision | Resets self on re-entry |
| — | Synthesis | Extract learning signals, integrate into meta-knowledge store | Never reset |
| 7 | Delivery | Package, document, report | Final pass |

### 3.2 Pass Status State Machine

```
pending → active → completed
                 → skipped (pass0 only, on failure/cold-start)
```

On re-entry, passes from the re-entry target through gap-hunting are reset to `pending`.

### 3.3 Execution Paths (14 defined)

| Path | Trigger | Outcome |
|---|---|---|
| P-01 Happy Path | All passes succeed, gap hunting converges | `delivered` |
| P-02 Gap Re-Entry | gaps-found within cycle limit | Re-enter Pass 2 or 3 |
| P-03 Forced Convergence | gaps-found at max cycles | `delivered-with-gaps` |
| P-04 Discovery Blocked | discovery coordinator blocked | `failed` |
| P-05 Analysis Failed | analysis coordinator failed | `failed` |
| P-06 Planning Failed | planning coordinator failed | `failed` |
| P-07 Execution Failed | execution coordinator failed | `failed` |
| P-08 Execution Partial | complete-with-blocked | Continue to verification |
| P-09 Verification Failed | verification coordinator failed | `failed` |
| P-10 Gap-Hunting Failed | gap-hunting coordinator failed | `delivered-with-gaps` (forced) |
| P-11 Crash Recovery | Active pass found on startup | Reset + re-dispatch |
| P-12 Knowledge Cold Start | No meta/ store | Pass 0 completes without knowledge |
| P-13 Knowledge Failed | Curator failed | Pass 0 degraded mode |
| P-14 Synthesis Degraded | Synthesis failed/degraded | Continue to delivery |

---

## 4. Artifact Inventory

### 4.1 Runtime Artifacts (`.fractal-factory/`)

| Artifact | Writers | Readers | Lifecycle |
|---|---|---|---|
| `context.json` | guide | All agents | Created once, immutable |
| `progress.json` | orchestrator only | orchestrator | Continuous — tracks pipeline state |
| `manifest.json` | all agents (prepend-only) | orchestrator, report-writer | Audit log — append-only |
| `domain-model.json` | domain-scanner, asset-auditor, exemplar-analyzer | Most agents | Read-modify-write — subdomains, assets, patterns |
| `invariants/behavioral.json` | invariant-extractor | coverage-hunter, prompt-writer, test-planner, checklist-validator | Per-classification invariant file |
| `invariants/structural.json` | invariant-extractor | (same readers) | Per-classification invariant file |
| `invariants/quality.json` | invariant-extractor | (same readers) | Per-classification invariant file |
| `invariants/workflow.json` | invariant-extractor | (same readers) | Per-classification invariant file |
| `architecture.json` | pipeline-architect, artifact-designer, depth-analyzer | Most agents | Read-modify-write — pipeline, artifacts, depth |
| `roster.json` | roster-planner, routing-planner | Most agents | Read-modify-write — names, hierarchy, result codes, routing tables |
| `test-plan.json` | test-planner | execution specialists, verification | Write once (unless gap re-entry) |
| `gap-report.json` | gap-hunting-coordinator | orchestrator, re-entry agents | Aggregated from 3 hunter outputs |
| `verification-report.json` | checklist-validator | report-writer, synthesis | Structural validation results |
| `audit-report.json` | audit-oracle | report-writer, synthesis | Oracle audit findings |
| `packaging-report.json` | packager | report-writer | Packaging completeness |
| `knowledge-brief.json` | knowledge-curator | All discovery/analysis agents | Cross-run knowledge, curated for current domain |

### 4.2 Per-Agent Artifacts

Every agent gets a directory `agents/{agent-name}/` with:
- `status.json` — standardized status contract (agent, task_id, status, result, summary, artifacts, next_hint, iteration)
- `output.md` — freeform output (analysis notes, reports, detailed findings)

### 4.3 Produced Output (`produced-output/`)

| Directory | Contents |
|---|---|
| `agents/` | `.agent.md` prompt files for the produced system |
| `schemas/` | Artifact schema documentation (`.schema.md`) |
| `skills/` | Shared workflow router + domain-specific auxiliary skills |
| `tests/` | Golden test scenario files |
| `docs/` | architecture.md, user-guide.md, roster.md |
| `bootstrap.sh` | Bootstrap script creating directory structure |
| `README.md` | Top-level README for the produced system |

### 4.4 Meta-Knowledge Store (`meta/`)

| Path | Content |
|---|---|
| `meta/index.json` | Registry of all knowledge entries with categories and confidence |
| `meta/{category}/*.json` | Individual knowledge entries grouped by category |
| `meta/run-retrospectives/{timestamp}.json` | Per-run retrospective summaries |

---

## 5. Execution Patterns

### 5.1 Coder-Reviewer Batch Loop

The execution coordinator dispatches prompt-writer and prompt-reviewer in bounded batches:

1. Select up to 5 eligible agents from roster (bottom-up order by hierarchy)
2. Dispatch prompt-writer for the batch → writes `.agent.md` files
3. Dispatch prompt-reviewer for the same batch → validates
4. On rejection: re-dispatch prompt-writer with reviewer feedback for still-`written` agents (max 3 retries per batch)
5. On approval: advance to next batch
6. On max retries: mark remaining batch agents `blocked` in roster.json, continue with later batches
7. After all batches: dispatch infra-writer

### 5.2 Read-Modify-Write Protocol

Multiple specialists write to the same JSON files:
1. Read current file state
2. Add entries ONLY to designated section (keyed by `discoveredBy` field)
3. Preserve ALL entries from other agents
4. Update `lastUpdated` timestamp
5. Write back

On re-entry: may update existing entries (e.g., increase confidence), add new entries, never delete.

### 5.3 Status Contract Pattern

Every agent writes a `status.json` on completion:
```json
{
  "agent": "<agent-name>",
  "task_id": "<unique-task-id>",
  "status": "complete | failed | blocked",
  "result": "<agent-specific result code>",
  "summary": "<1-2 sentence description>",
  "artifacts": ["<list of files written>"],
  "next_hint": "<suggestion for parent coordinator>",
  "iteration": 1
}
```

### 5.4 Anti-Laziness Enforcement

Applied to adversarial agents (verification + gap-hunting specialists):
- Must search every category independently
- Must document methodology per category
- Must provide specific evidence (exact file, exact missing element)
- Zero-gap first pass is suspicious → mandatory second pass with different strategy
- Previous cycle gaps must be re-checked for resolution

### 5.5 Progressive Disclosure for Produced Specialists

Produced specialists don't carry full workflows inline. Instead:
- One shared router skill under `skills/workflow/{namingPrefix}-specialists-workflow`
- Skill routes into `references/<specialist-name>/` folders
- Numbered phase files live in per-specialist reference directories
- Main prompt stays compact, points to shared skill

---

## 6. Control Flow Mechanisms

### 6.1 Gap-Hunting Re-Entry

When gap-hunting coordinator returns `gaps-found` and cycle limit not reached:
1. Read `gap-report.json` → get `suggestedReEntryPass`
2. Increment `gapHunting.currentCycle` in progress.json
3. Reset all passes from re-entry target through gap-hunting to `pending`
4. Delete `status.json` for every agent in reset passes
5. Preserve `gap-report.json` (coordinators need it for context)
6. Never reset Pass 0 or Synthesis
7. Resume routing from the reset pass

### 6.2 Crash Recovery

On startup, orchestrator detects any pass with `status == "active"`:
1. Reset the active pass to `pending`
2. Delete the coordinator's `status.json`
3. Children with existing `status.json` are skipped (already completed)
4. Resume routing from the reset pass

### 6.3 Convergence

Convergence = gap-hunting aggregated result finds zero new items across all 9 categories.

Forced convergence = cycle limit reached (`maxGapCycles`, default 3). Pipeline proceeds to delivery with outstanding gaps noted in the report.

### 6.4 Pass-to-Agent Mapping for Status Deletion

On re-entry, these agents' `status.json` files are deleted:

| Pass | Agents |
|---|---|
| analysis | pipeline-architect, artifact-designer, depth-analyzer, analysis-coordinator |
| planning | roster-planner, routing-planner, test-planner, planning-coordinator |
| execution | prompt-writer, prompt-reviewer, infra-writer, execution-coordinator |
| verification | checklist-validator, audit-oracle, verification-coordinator |
| gapHunting | coverage-hunter, artifact-hunter, infrastructure-hunter, gap-hunting-coordinator |

---

## 7. Schema Inventory

| Schema | File | Purpose |
|---|---|---|
| Progress | `progress.schema.md` | Pipeline state machine: current pass, per-pass status, gap-hunting cycle tracking, recomputation rules |
| Context | `context.schema.md` | User input: domain name/description, target output directory, naming prefix, input file paths, convergence limits |
| Domain Model | `domain-model.schema.md` | Discovery output: subdomains, existing assets, exemplar patterns. ID schemes: SD-, ASSET-, PATTERN-. References invariants/ directory for invariant storage. |
| Produced Agent | `produced-agent.schema.md` | Template for produced agent prompts. Universal structure: YAML frontmatter → Identity → Context → Inputs → Execution → Write Rules → Status Contract. Type-specific variants for specialist (process steps + skills), coordinator (purity rule + routing table), orchestrator (pipeline routing). |

---

## 8. Verification Mechanisms

### 8.1 Structural Validation (checklist-validator)

Checks every produced agent prompt against:
- Required sections present (identity, context, inputs, execution, write rules, status contract)
- Status contract matches universal schema
- Result codes match roster entry
- Routing tables are complete and reference valid children
- Write rules reference valid artifacts

### 8.2 Oracle Audit (audit-oracle)

**Perspective 1 — Agent-as-Function:**
- `AF-CONTRACT-01`: status.json schema compliance
- `AF-CONTRACT-02`: No invented result codes
- `AF-MANIFEST-03`: Every artifact written is declared
- `AF-ROUTE-04`: Child result codes complete in parent routing table

**Perspective 2 — Fractal Workflow Evaluation:**
- `FW-PIPELINE-01`: Pass ordering is topologically valid
- `FW-CONVERGENCE-02`: Gap-hunting loop has termination guarantee
- `FW-DEPTH-03`: Depth decisions match subdomain complexity

### 8.3 Gap Hunting (9 categories)

| # | Category | Hunter | Checks |
|---|---|---|---|
| 1 | Subdomain Coverage | coverage-hunter | Every subdomain has ≥1 responsible agent + test |
| 2 | Invariant Enforcement | coverage-hunter | Every invariant has ≥1 enforcing agent + test |
| 3 | Routing Completeness | coverage-hunter | Every execution path reachable, no dead ends |
| 4 | Artifact Coverage | artifact-hunter | Every artifact has a writer and declared schema |
| 5 | Test Coverage | artifact-hunter | Test scenarios cover all agent types and paths |
| 6 | Cross-Reference Integrity | artifact-hunter | All IDs referenced across artifacts resolve |
| 7 | Bootstrap Completeness | infrastructure-hunter | Bootstrap creates all directories/files |
| 8 | Documentation Coverage | infrastructure-hunter | Docs reference all agents and artifacts |
| 9 | Meta-Knowledge Infrastructure | infrastructure-hunter | Meta store structure is properly initialized |

---

## 9. Knowledge Management

### 9.1 Knowledge Curation (Pass 0)

The knowledge-curator reads `meta/index.json` and filters entries relevant to the current domain. Produces `knowledge-brief.json` — a focused subset of cross-run knowledge made available to discovery, analysis, and planning agents.

Cold-start behavior: if no meta/ store exists, Pass 0 completes with empty brief. Pipeline continues in degraded mode.

### 9.2 Signal Extraction (Synthesis)

Two analyzers extract different signal types:
- **Factory-signal-analyzer**: domain-specific patterns (subdomain complexity vs agent count, effective invariant-handling strategies, exemplar pattern applicability)
- **Context-signal-analyzer**: process-level patterns (agent retry rates, convergence speed, pipeline bottlenecks, invariant-handling failure modes)

### 9.3 Knowledge Integration

The knowledge-integrator is the sole gatekeeper:
- **Quality gate**: must be domain-agnostic, actionable, non-trivial, non-duplicate
- **Confidence ladder**: new entries start at 0.3, existing entries reinforced (+0.2 per corroborating run, capped at 0.9)
- **Stale processing**: entries not corroborated in last 3 runs lose 0.1 confidence; entries below 0.3 are archived
- **Boundary**: no raw domain-local invariant inventories — only reusable patterns, strategies, and failure modes

---

## 10. Input/Output Contract

### 10.1 Inputs

| Input | Required | Format |
|---|---|---|
| `domain-brief.md` | Yes | Markdown narrative describing the domain |
| `domain-docs/` | No | Directory of supporting documents (API specs, examples) |
| `invariants.md` | No (recommended) | Behavioral rules the produced system must enforce |
| `exemplars/` | No | Existing agent families to learn from |
| `constraints.json` | No | Hard constraints (max agents, required roles, etc.) |

### 10.2 Outputs

| Output | Always Produced |
|---|---|
| `produced-output/agents/*.agent.md` | Yes |
| `produced-output/schemas/*.schema.md` | Yes |
| `produced-output/skills/` | Yes |
| `produced-output/bootstrap.sh` | Yes |
| `produced-output/tests/` | Yes |
| `produced-output/docs/` (architecture, user-guide, roster, README) | Yes |
| Delivery report (`output.md`) | Yes |
| Meta-knowledge entries in `meta/` | If synthesis succeeds |

### 10.3 Terminal States

| State | Meaning |
|---|---|
| `delivered` | All passes succeeded, gap hunting converged |
| `delivered-with-gaps` | Forced convergence or gap-hunting failure — output exists but has known gaps |
| `failed` | Pipeline halted due to coordinator failure |

---

## 11. Design Invariants

These are rules the factory itself follows (not the produced system's invariants):

1. **Coordinator purity**: Coordinators dispatch and route — they never do domain work.
2. **Status contract universality**: Every agent writes `status.json` with the same schema.
3. **Read-modify-write safety**: Multi-writer artifacts are updated via the read-modify-write protocol with `discoveredBy` field isolation.
4. **Audit log immutability**: `manifest.json` is prepend-only.
5. **Progress ownership**: Only the session orchestrator writes `progress.json`.
6. **Gap-hunting adversarial stance**: hunters must document methodology, provide evidence, and verify previous cycle items.
7. **Verification strictness**: Pass 5 is strict — any issue fails the pass, no pass-with-warnings.
8. **Knowledge boundary**: meta-knowledge is reusable patterns only — no raw domain invariant caching across runs.
9. **Pass 0 / Synthesis immunity**: neither is reset by gap-hunting re-entry.
10. **Invariant storage separation**: invariants live in per-classification files under `invariants/`, not in `domain-model.json`.

---

## 12. ID Scheme Reference

| Entity | Prefix | Scope |
|---|---|---|
| Subdomains | `SD-` | domain-model.json |
| Invariants | `INV-` | invariants/*.json (globally unique across all 4 files) |
| Existing Assets | `ASSET-` | domain-model.json |
| Exemplar Patterns | `PATTERN-` | domain-model.json |

All IDs are assigned sequentially within their scope and continue from the highest existing ID on re-entry.

---

## 13. Confidence Scoring (Invariants)

| Range | Meaning |
|---|---|
| 0.9–1.0 | Explicitly stated in source material |
| 0.7–0.8 | Strongly implied by multiple source passages |
| 0.5–0.6 | Inferred from context, may need verification |
| 0.3–0.4 | Speculative, based on patterns in other systems |

Invariants below 0.5 confidence are flagged for user verification in the final report.

---

## 14. Agent Count by Role

| Role | Count | Agents |
|---|---|---|
| Guide | 1 | guide |
| Orchestrator | 1 | fractal-factory |
| Coordinator | 8 | discovery, analysis, planning, execution, verification, gap-hunting, synthesis, delivery |
| Discovery specialist | 4 | domain-scanner, invariant-extractor, asset-auditor, exemplar-analyzer |
| Analysis specialist | 3 | pipeline-architect, artifact-designer, depth-analyzer |
| Planning specialist | 3 | roster-planner, routing-planner, test-planner |
| Execution specialist | 3 | prompt-writer, prompt-reviewer, infra-writer |
| Verification specialist | 2 | checklist-validator, audit-oracle |
| Gap-hunting specialist | 3 | coverage-hunter, artifact-hunter, infrastructure-hunter |
| Synthesis specialist | 3 | factory-signal-analyzer, context-signal-analyzer, knowledge-integrator |
| Delivery specialist | 3 | packager, documentation-writer, report-writer |
| **Total** | **35** | |
