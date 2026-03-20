# Asset Auditor — Output Report

**Agent:** fractal-factory-asset-auditor
**Domain:** fantasy-writer (romantic fantasy fiction pipeline)
**Iteration:** 1

---

## Scan Summary

| Metric | Count |
|--------|-------|
| Directories scanned | 6 (`shared/skills/`, `shared/agent-includes/`, `shared/mcp-servers/`, `shared/hooks/`, `.github/skills/`, `profiles/`, `.fractals/fractal-factory/agents/`) |
| Total assets examined | ~75 (32 skills, 9 MCP servers, 12 agent-includes, 6 hooks, 2 profiles, 35 exemplar agents) |
| Relevant assets cataloged | 26 |
| Direct reuse | 5 |
| Adaptable | 4 |
| Reference-only | 17 |

---

## Asset Inventory by Reusability

### Direct Reuse (5 assets)

These can be mounted or referenced in the produced fantasy-writer system as-is:

| ID | Asset | Type | Why Direct |
|----|-------|------|------------|
| ASSET-001 | `agent-as-function-contract` | shared-include | The filesystem artifact contract (status.json, output versioning, artifact directories) is domain-agnostic. Every subagent in the fantasy-writer system will need this exact contract. |
| ASSET-003 | `rules` | shared-include | Orchestrator behavioral rules (route on status.json only, wait for subagent returns, blocked status) apply identically to the fantasy-writer orchestrator. |
| ASSET-009 | `agent-fractal-orchestrator-architecture` | skill | The fractal orchestrator pattern (depth-2 hierarchy, coordinator→specialist, convergence loops) is the exact architecture the fantasy-writer system will use. |
| ASSET-015 | `fractal-factory orchestrator` | agent-template | The session orchestrator exemplar demonstrates pure-router pipeline routing, progress.json management, and gap-hunting re-entry — the exact pattern the fantasy-writer orchestrator needs. |
| ASSET-016 | `fractal-factory coordinator agents` | agent-template | The full 35-agent exemplar family provides concrete patterns for coordinator dispatch, status.json contracts, writer-reviewer loops, and convergence — directly applicable structural templates. |

### Adaptable (4 assets)

These are useful with modifications for the fantasy-writer domain:

| ID | Asset | Type | Adaptation Needed |
|----|-------|------|-------------------|
| ASSET-002 | `prompt-security` | shared-include | Remove JIRA/ADO-specific scope locks (taskId, taskProject). Add story-config.json scoping. Keep injection defense, data exfiltration prevention. The user-input handling for story ideas needs the same protections. |
| ASSET-021 | `profile.json structure` | tool | Adapt the profile configuration schema: remove ADO/JIRA data source config, add fiction-specific MCP servers (if any), adjust timeout values for creative generation (longer than doc tasks). |
| ASSET-022 | `Dockerfile pattern` | tool | Simplify significantly: the fantasy-writer needs Node.js but not Ruby/Jekyll/Gulp/.NET. Remove all doc-build toolchain. May need no special toolchain at all beyond the base agent runtime. |
| ASSET-024 | `web-fetch MCP server` | mcp-server | Potentially useful if the system needs to fetch reference material or research sources. May need usage constraints to prevent the system from inadvertently copying published fiction. |

### Reference-Only (17 assets)

These provide patterns to learn from but aren't directly reusable:

| ID | Asset | Pattern to Extract |
|----|-------|--------------------|
| ASSET-004 | `personality/ralph` | **Personality injection pattern**: How to give each agent a distinct voice via a Liquid partial. The fantasy-writer system's adversarial auditors, beta readers, and editors should each have distinct personalities. |
| ASSET-005 | `personality/malph` | **Adversarial reviewer voice**: Theatrical precision, detective metaphor. Direct inspiration for the adversarial consistency auditor (SD-011) personality design. |
| ASSET-006 | `ralphchives` | **Persistent knowledge base pattern**: Search-before-work, post observations, task reports. Applicable to the series knowledge management system (SD-012) — the same pattern of accumulating knowledge across pipeline runs. |
| ASSET-007 | `agent-as-function` | **Subagent decomposition methodology**: How to break monolithic work into specialized agents with clear contracts. Reference for designing the creative pipeline's agent decomposition. |
| ASSET-008 | `agent-as-function-audit` | **Audit methodology**: How to systematically check agent families for contract drift. Reference for how the adversarial auditors (SD-011) should structured their checks. |
| ASSET-010 | `agent-fractal-workflow-eval` | **Workflow evaluation criteria**: Instruction correctness, data flow integrity, re-entry safety. Reference for how the fantasy-writer's own quality gates should evaluate pipeline health. |
| ASSET-011 | `doc-coauthoring` | **Interactive gathering pattern**: Context gathering → refinement → verification. The guide agent (SD-001) should follow a similar structured interaction flow when gathering story inputs. |
| ASSET-012 | `feature-task-planning` | **Task decomposition pattern**: Phase specs + task-graph with dependencies and acceptance criteria. Reference for how the plotting/outlining phase (SD-005) should decompose story structure. |
| ASSET-013 | `builder-workflow` | **Phased execution pattern**: Setup→parse→execute→verify→report with subagent dispatch. Reference for the chapter drafting pipeline (SD-007) where each chapter is a "task" to execute. |
| ASSET-014 | `ralph-docs orchestrator` | **Production orchestrator pattern**: Pure-router with subagent dispatch table, multi-reviewer consensus, control-file ownership. Reference for the fantasy-writer's main orchestrator design. |
| ASSET-017 | `ralph-task-planning` | **Task lifecycle management**: Ordered tasks, state tracking, dependency resolution. Reference for managing chapter drafting order and revision tracking. |
| ASSET-018 | `ralph-style-guide-review` | **Style enforcement pattern**: Checklist-based review against a style guide. Reference for how prose style calibration (SD-006) and style-focused revision (SD-008) should enforce consistency. |
| ASSET-019 | `behavior-testing` | **Behavioral verification pattern**: Test outputs not implementation. Reference for how adversarial auditors (SD-011) should test creative output quality. |
| ASSET-020 | `ralph-audit hooks` | **Execution telemetry pattern**: JSONL logging of agent actions. Reference for tracking the creative pipeline's execution for debugging and improvement. |
| ASSET-023 | `mcp-sidecar` | **Tool integration infrastructure**: Process manager for MCP servers. Reference if the fantasy-writer system needs custom tools (e.g., word count tracker, continuity checker). |
| ASSET-025 | `looper-planner` | **Multi-phase planning loop**: Discovery→questions→spec→plan→tasks. Reference for the concept development (SD-002) and plotting (SD-005) phases' structured planning approach. |
| ASSET-026 | `post-hooks pattern` | **Post-pipeline learning**: Subagent telemetry extraction, run analysis, automated improvement. Reference for how the system could learn from each story generation to improve future runs. |

---

## Assets Examined but NOT Cataloged (Not Relevant)

The following asset categories were scanned but found irrelevant to the fantasy-writer domain:

| Category | Count | Why Excluded |
|----------|-------|-------------|
| Xperience/Kentico domain skills | 20 | Product-specific knowledge about CMS, .NET, Jekyll docs. Zero overlap with fiction writing. |
| ADO/JIRA integration skills | 3 | CI/CD pipeline integrations. Fantasy-writer has no DevOps workflow. |
| CodeGraphContext skill/MCP | 2 | Source code graph analysis. Not applicable to fiction. |
| Playwright skills/MCP | 3 | Browser automation for screenshots/testing. Not needed for text generation. |
| Discord HITL MCP | 1 | Human-in-the-loop via Discord. The fantasy-writer guide handles all user interaction. |
| VS Code extension skills | 2 | IDE-specific. Not relevant. |
| Code review/TypeScript skills | 2 | Software engineering code review. Not applicable. |
| Ralphchives read/write MCPs | 2 | Specific to the Ralphchives knowledge base infrastructure. Pattern is relevant (cataloged as ASSET-006) but the actual servers aren't reusable. |

---

## Recommendations

### High-Priority Reuse

1. **Artifact contract** (ASSET-001, ASSET-003): Wire these shared includes into every fantasy-writer subagent template. They provide the backbone of inter-agent communication.

2. **Fractal orchestrator pattern** (ASSET-009, ASSET-015, ASSET-016): The exemplar family is the primary architectural reference. The fantasy-writer system should follow the same depth-2 hierarchy: orchestrator → coordinators (per creative phase) → specialists (worldbuilder, character developer, chapter drafter, auditor, etc.).

3. **Multi-reviewer consensus pattern** (from ASSET-014): The ralph-docs orchestrator dispatches 3+ reviewers and aggregates verdicts. The beta-reading simulation (SD-009) should use the same pattern with 5 independent reader lenses.

### New Assets Needed (Cannot Be Reused)

The following capabilities must be built from scratch — no existing asset covers them:

1. **Creative writing craft skills** — prose rhythm, dialogue, show-don't-tell, pacing, tension arcs, romance beat timing, worldbuilding consistency. These are entirely novel domain knowledge.
2. **Story artifact schemas** — world bible structure, character bible structure, chapter outline format, continuity tracker format. No existing schema covers fiction artifacts.
3. **Adversarial auditor skills** — phase-specific consistency checking (plot logic, character motivation coherence, worldbuilding physics, romance arc progression). The *pattern* exists (ASSET-005, ASSET-008) but the domain knowledge is entirely new.
4. **Series knowledge management** — cross-book continuity, character evolution tracking, world state management. No existing analog.
5. **Style calibration tools** — analyzing reference prose for abstract patterns, generating style guides from samples. Entirely novel.
6. **Story-config.json schema** — user input capture for story ideas, mood, constraints. Must be designed fresh.

### Key Pattern Transfers

These are the most valuable non-obvious pattern transfers from existing assets:

| Source Pattern | Target Application |
|---|---|
| Malph's adversarial personality (ASSET-005) | Each adversarial auditor should have a distinct, memorable voice that makes reviews engaging rather than dry checklists |
| Ralphchives search-before-work (ASSET-006) | Series knowledge base should require agents to search existing world/character state before creating or modifying anything |
| Multi-reviewer consensus (ASSET-014) | Beta-reading simulation (SD-009) should dispatch 5 independent reader-lens agents and aggregate feedback with conflict resolution |
| Post-hooks learning loop (ASSET-026) | After each complete story generation, the system should extract craft-domain signals for improving future runs |
| Builder's phased execution (ASSET-013) | Chapter drafting (SD-007) should treat each chapter as a discrete task in a dependency-aware execution plan |
