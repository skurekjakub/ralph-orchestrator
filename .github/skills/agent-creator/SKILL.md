---
name: agent-creator
description: "End-to-end guided workflow for creating a complete agent-as-function family from scratch. Takes a repo + task description and outputs orchestrator, subagents, skills, routing table, and artifact contracts. Human-in-the-loop — every phase requires user approval before proceeding. Use when building a new agent family, not for modifying an existing one."
---

# Agent Creator

A composition skill that walks you through building a complete agent family for a given repo and task. Each phase produces a concrete deliverable written to `plans/<agent-name>/`, and every phase ends with a user checkpoint before proceeding.

## Prerequisites

You should also have these skills available — this skill references them but does not duplicate their content:

| Skill | Used in | Purpose |
|---|---|---|
| `agent-as-function` | Phase 1–2 | Architecture patterns, subagent analysis, data flow |
| `agent-subagent-wiring` | Phase 5 | Wiring checklist, role patterns, templates |
| `skill-creator` | Phase 5e | Skill authoring patterns, evaluation loop |
| `agent-as-function-audit` | Phase 6 | Validation checklist |
| `agent-eval` | Phase 7 | Evaluation dimensions |

If any are missing, the corresponding phase still works — you'll just need to apply the patterns manually.

## Inputs

The user provides:
1. **Target repo** — path or URL to the repository the agent will work in
2. **Task description** — what the agent should accomplish (e.g., "write documentation for API changes", "run code quality analysis")
3. **Constraints** — optional: trigger mechanism, output format, review requirements, model budget, existing agents to integrate with

## Outputs

By the end of the workflow, these files exist:

- `plans/<agent-name>/` — phase deliverables (requirements, analysis, architecture, skill plan, workflow)
- `profiles/<profile>/agents/` — orchestrator `.agent.md` + subagent `.agent.md` files
- `shared/agent-includes/<profile>/` — shared include partials for subagent prompts
- `.github/skills/<skill-name>/` — new domain skills (if any)
- `profiles/<profile>/profile.json` — updated profile configuration

## Workflow

### Overview

| Phase | Name | Deliverable | Skill References |
|---|---|---|---|
| 0 | Requirements Discovery | `requirements.md` | — |
| 1 | Responsibility Analysis | `responsibilities.md` | `agent-as-function` refs: subagent-analysis |
| 2 | Architecture Design | `architecture.md` | `agent-as-function` refs: data-flow-patterns, refactoring-guide |
| 3 | Skill Gap Analysis | `skill-plan.md` | `agent-as-function` refs: skill-discovery |
| 4 | Workflow Decomposition | `workflow-design.md` | `agent-as-function` refs: workflow-decomposition |
| 5 | Bootstrap Implementation | Agent + skill files | `agent-subagent-wiring`, `skill-creator` |
| 6 | Validation | Audit report | `agent-as-function-audit` |
| 7 | Test Plan | Test cases (optional) | `agent-eval` |

The plan directory is `plans/<agent-name>/`. Create it at Phase 0.

### Checkpoint protocol

Every phase ends with `ask_questions`. Present the deliverable summary and ask explicitly:
- "Does this look right?"
- "Anything to add, remove, or change?"

Do not proceed until the user approves. If the user requests changes, revise the deliverable and re-checkpoint.

---

## Phase 0: Requirements Discovery

**Goal:** Understand what the agent needs to do, what it works with, and what constraints apply.

### Steps

1. **Research the target repo.** Read its structure, build system, conventions, existing agents or automation. If it's a remote repo, ask the user to describe the structure or clone it locally.

2. **Research the task domain.** What does "the task" actually involve? For documentation agents: CMS, format, review process. For code agents: languages, test framework, CI. For analysis agents: data sources, output format.

3. **Interview the user.** Fill gaps with these questions (skip any the user already answered):
   - What triggers this agent? (JIRA comment, manual invocation, CI event, scheduled)
   - What's the expected deliverable? (PR, report, JIRA comment, file set)
   - What external services does it need? (APIs, MCP tools, databases, package registries)
   - What quality gates exist? (reviews, builds, tests, human approval)
   - What are known failure modes? (access issues, build failures, ambiguous scope)
   - Are there existing agents, skills, or infrastructure to reuse?
   - Model budget? (all Opus, mixed, Sonnet-only)
   - Container or local execution?

4. **Write `plans/<agent-name>/requirements.md`** using the template from `references/requirements-template.md`.

**Checkpoint:** Present the requirements summary. Ask: "Does this capture what you need? Anything missing or wrong?"

---

## Phase 1: Responsibility Analysis

**Goal:** Identify every job the agent must perform and decide what becomes a subagent vs. orchestrator duty.

### Steps

1. **Read `agent-as-function/references/subagent-analysis.md`** for the full procedure. Follow its steps 1–7.

2. **Inventory every responsibility.** Be granular. For each, capture: what it does, what it reads, what it produces, cognitive load (low/medium/high), tools needed. Use a table.

3. **Classify each responsibility.** Apply the rules from the subagent-analysis reference:
   - **Subagent when:** deep reasoning, substantial artifact, different model opportunity, reusable in isolation
   - **Orchestrator when:** administrative/mechanical, routing decision, coordination concern, <10 lines of instruction

4. **Draft the subagent roster.** For each subagent: name, role (one line), recommended model, primary inputs, primary outputs, result codes.

5. **List orchestrator duties.** What the orchestrator does itself: git operations, JIRA transitions, PR creation, exit block, dispatch coordination.

6. **Write `plans/<agent-name>/responsibilities.md`** using the template from `references/responsibility-template.md`.

**Checkpoint:** Present the analysis. Ask: "Which subagents should be split differently? Any that should merge? Any orchestrator duties that should be delegated?"

---

## Phase 2: Architecture Design

**Goal:** Define the complete dispatch/routing/data-flow architecture.

### Steps

1. **Read `agent-as-function/references/data-flow-patterns.md`** for routing table patterns and anti-patterns.

2. **Define the routing table.** Map every `(subagent, result)` pair to a next action. Verify:
   - Every subagent's every result code appears in the table
   - Every row has a clear next action (dispatch X, iterate, exit, escalate)
   - Iteration limits are explicit (max N rounds)
   - Error/blocked paths lead to graceful exits

3. **Map the data flow.** For each subagent, specify:
   - What files it reads (and from which other subagent's directory)
   - What files it writes
   - Draw the flow (ASCII or Mermaid)
   - Verify: the orchestrator never appears as a data relay

4. **Define the artifact directory structure.** Based on the approved data flow:
   ```
   .ralph/tasks/{task-id}/artifacts/
   ├── <subagent-1>/
   │   ├── output.md
   │   └── status.json
   ├── <subagent-2>/
   │   ├── output.md (or output-v{N}.md for iterating agents)
   │   └── status.json
   └── manifest.json
   ```

5. **Allocate models.** For each subagent and the orchestrator:
   - Deep reasoning / coding / review → `claude-opus-4.6`
   - Formatting / aggregation / mechanical → `claude-sonnet-4` or `claude-sonnet-4.5`
   - Lightweight extraction / classification → cheaper model

6. **Identify iteration loops.** Write → review → revise loops, retry-on-failure loops. Set explicit max iteration counts.

7. **Identify parallel dispatch opportunities.** Multiple reviewers, research fan-out, independent analysis.

8. **Write `plans/<agent-name>/architecture.md`** using the template from `references/architecture-template.md`.

**Checkpoint:** Present the architecture. Ask: "Check routing table completeness, data flow correctness, iteration limits, model choices. Anything to adjust?"

---

## Phase 3: Skill Gap Analysis

**Goal:** Identify what domain knowledge the agent family needs and whether existing skills cover it.

### Steps

1. **List every domain** the agent needs knowledge about. Examples: doc format conventions, API surface, build system, review standards, security policies, coding standards.

2. **Audit existing skills.** For each domain:
   - Existing skill covers it → mark as "reuse"
   - Existing skill partially covers it → mark as "extend"
   - No existing skill → mark as "create"

3. **For each subagent, list its skill mounts.** Which skills should each subagent have access to?

4. **Spec new skills.** For each "create" entry:
   - Name
   - Trigger condition (when should the agent read this skill?)
   - Content scope (what does it teach?)
   - Estimated size (small = <50 lines, medium = 50-150, large = 150+)
   - Reference files needed

5. **Identify shared vs. subagent-specific skills.** Shared skills get mounted to multiple subagents. Subagent-specific skills serve one agent.

6. **Write `plans/<agent-name>/skill-plan.md`** using the template from `references/skill-gap-template.md`.

**Checkpoint:** Present the skill plan. Ask: "Are there domain areas I missed? Any skills that should be split or merged? Priorities for which to create first?"

---

## Phase 4: Workflow Decomposition

**Goal:** Break the orchestrator's execution into phases with skill loading contracts.

### Steps

1. **Read `agent-as-function/references/workflow-decomposition.md`** for the full pattern.

2. **Identify natural phase boundaries.** Look for mode shifts: setup → research → implementation → validation → delivery.

3. **Design the scratchpad contract.** Define the `state.md` structure:
   - Current phase + skills for this phase
   - Completed phases with key outcomes
   - Key decisions with rationale
   - Tracked artifacts (branch, PR URL, identifiers)

4. **Write the phase table.** For each phase: number, name, phase skill name, domain skills loaded, transition conditions.

5. **Design variant workflows** if the agent handles multiple task types (new work vs. revisions, simple vs. complex). Variants share domain skills but have separate phase skills.

6. **Write `plans/<agent-name>/workflow-design.md`** using the template from `references/workflow-template.md`.

**Checkpoint:** Present the workflow. Ask: "Correct phase boundaries? Right skills at each phase? Need variant workflows?"

---

## Phase 5: Bootstrap Implementation

**Goal:** Create all the actual files. Each sub-step has its own checkpoint.

### 5a. Profile configuration

Create or update `profiles/<profile>/profile.json`:
- Data source configuration
- Match rules (JIRA project, issue types, comment trigger)
- Stage pipeline with agent reference
- MCP server declarations
- Variant definitions (if applicable)

**Sub-checkpoint:** "Profile config looks like this. Correct?"

### 5b. Orchestrator template

Create `profiles/<profile>/agents/ralph.<name>.agent.md`:
- Frontmatter: agents list, model, description
- Identity section — who this agent is
- Prompt contract — what the dispatching system sends
- Orchestration model — artifact root, subagent roster table, dispatch model
- Routing rules table — from Phase 2
- Rules — what the orchestrator does and never does
- Ordering constraints
- Error handling — per-subagent failure paths
- Workflow section — renders the workflow partial (or inline)

Follow `agent-subagent-wiring/references/templates.md` for reusable prompt snippets.

**Sub-checkpoint:** "Orchestrator template created. Review the routing table and dispatch logic."

### 5c. Subagent templates

For each subagent in the approved roster, create:
- `profiles/<profile>/agents/ralph.<subagent-name>.agent.md` — stub with frontmatter (model, description, `{% render '<include-path>' %}`)
- Shared include partial at `shared/agent-includes/<profile>/<subagent-name>.md` (or direct content in the stub if the subagent is simple)

Each subagent template includes:
- Role (one line)
- Input artifacts (what it reads from upstream)
- Output artifacts (what it writes)
- Result codes (with meanings)
- Instructions (step-by-step)
- Artifact contract — `{% render 'agent-as-function-contract' %}` (or inline equivalent)

**Sub-checkpoint per subagent:** "Created `<subagent>`. Review its inputs, outputs, and result codes."

### 5d. Workflow skills (if using phase decomposition)

For each phase from the workflow design:
- Create the phase skill at `.github/skills/workflow-<agent>-<phase>/SKILL.md`
- Include "Before you begin" (read state.md), instructions, "Before moving to Phase N+1" (update state.md)
- Wire domain skill references at decision points

Create the workflow partial that the orchestrator renders, containing the compact phase table.

**Sub-checkpoint:** "Workflow skills created. Review phase transitions."

### 5e. Domain skills

For each "create" skill from the skill gap analysis:
- Draft `SKILL.md` with frontmatter (name, description), instructions, reference pointers
- Create reference files for domain knowledge
- Follow the `skill-creator` patterns for skill anatomy and progressive disclosure

**Sub-checkpoint per skill:** "Created `<skill>`. Does the scope and trigger condition look right?"

---

## Phase 6: Validation

**Goal:** Verify everything works together.

### Steps

1. **Template rendering.** If the profile uses Liquid templates, verify they render without errors. Run the template integration tests if available.

2. **JSON validation.** Verify `profile.json` parses correctly.

3. **Agent-as-function audit.** Follow `agent-as-function-audit` (or its checklist reference):
   - Orchestrator purity — no `output.md` reads, no data relaying
   - Artifact contract — every subagent writes `status.json`
   - Routing table completeness — every result code handled
   - Data flow — subagents read filesystem directly, orchestrator never in data path
   - Skill mounts — every referenced skill exists

4. **Dangling reference check:**
   - Every agent in the orchestrator's roster has a corresponding `.agent.md` file
   - Every skill referenced in workflow skills or agent templates exists
   - Every result code in the routing table matches a subagent's declared result codes
   - Every artifact path referenced as input by a subagent is produced by another subagent

5. **Ordering constraint check:** Every hard dependency in the dispatch flow is covered by an ordering constraint.

6. **Write findings to `plans/<agent-name>/validation.md`** and fix any issues found.

Use `references/validation-checklist.md` for the complete checklist.

**Checkpoint:** "Validation complete. N files created, M findings found and fixed. Here's the final inventory."

---

## Phase 7: Test Plan (optional)

**Goal:** Prepare test cases for the new agent family.

### Steps

1. **Draft 2-3 realistic test cases.** Each should be a JIRA issue or prompt that exercises the main workflow end-to-end.

2. **Identify edge cases.** Revision flow, blocked subagent, build failure, reviewer disagreement, scope ambiguity.

3. **Map evaluation dimensions.** From `agent-eval`, identify which dimensions (D1-D9) are most relevant for this agent type.

4. **Optionally set up the eval loop.** Use `skill-creator` patterns to create `evals.json` for domain skills and benchmark assertions.

**Checkpoint:** "Here are the test cases. Want to run them, or adjust first?"

---

## Fast Mode

For experienced users who understand the agent-as-function pattern and want fewer checkpoints:

1. **Analyze** (Phases 0–4 collapsed): Research the repo and task, produce a single combined document covering requirements, responsibilities, architecture, skill plan, and workflow. One checkpoint: "Here's the full analysis. Approve or revise?"

2. **Build** (Phase 5 collapsed): Create all files at once — profile, orchestrator, subagents, skills. One checkpoint: "All files created. Review the orchestrator and key subagents."

3. **Validate** (Phase 6–7): Same as standard mode.

To use fast mode, tell the agent: "Use agent-creator in fast mode."

---

## Rules

- **Never skip a checkpoint.** Even if the deliverable seems obvious, present it and ask for confirmation.
- **Write deliverables to files.** Every phase output goes to `plans/<agent-name>/`. This creates an audit trail.
- **Don't duplicate skill content.** Reference existing skills by name, don't rewrite their instructions inline.
- **Orchestrator stays pure.** If you find the orchestrator doing substantive work (reading artifacts, synthesizing data, making domain decisions), extract it into a subagent.
- **One subagent per sub-checkpoint.** Don't batch-create subagents — create one, verify it, then create the next.
- **Respect the user's model budget.** If the user specified constraints on model allocation, follow them. Default to Opus for reasoning-heavy agents, Sonnet for mechanical/formatting agents.
