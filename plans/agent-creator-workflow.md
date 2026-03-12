# Agent Creator Workflow — Implementation Plan

A generalized, human-in-the-loop workflow that takes a **repo + task description** and outputs a complete agent-as-function family: orchestrator, subagents, skills, routing table, and artifact contracts.

## Problem

Today, building a new Ralph agent family requires deep knowledge of the agent-as-function pattern, skill decomposition, subagent wiring, and the Ralph infrastructure. The knowledge is spread across 4 skills (`agent-as-function`, `agent-as-function-audit`, `agent-subagent-wiring`, `skill-creator`) plus the orchestrator source code. There's no guided workflow that walks a user through the full creation process with checkpoints.

## Goal

Create a single **agent-creator** skill that orchestrates the full agent family creation process with mandatory human checkpoints at every decision boundary. The skill consumes generic inputs (repo, task type, constraints) and outputs concrete agent templates, skills, and profile configuration.

---

## Design Decisions

### D1: Skill, not agent

This should be a **skill** (loaded by a human-driven Copilot session), not an autonomous agent. Reasons:
- The process is fundamentally interactive — every phase needs user confirmation
- It generates *other* agents, not delivered artifacts
- It needs internet access for SOTA research (via `fetch`)
- It runs in the developer's local Copilot session, not inside a container

### D2: Phase-gated with `ask_questions`

Each phase produces an artifact (analysis document, roster, routing table, etc.) and ends with an `ask_questions` checkpoint. The user can approve, modify, or reject before the next phase begins. No file edits occur until the user explicitly approves each phase's output.

### D3: Builds on existing skills, doesn't replace them

The agent-creator skill orchestrates existing skills rather than duplicating their content:
- Calls into `agent-as-function` references for architecture patterns
- Calls into `agent-subagent-wiring` references for wiring checklists
- Calls into `skill-creator` patterns for skill authoring
- Calls into `agent-as-function-audit` for final validation

### D4: Progressive output, not all-at-once

Files are created incrementally — orchestrator first, then subagents one at a time, then skills. This lets the user validate each piece before the next depends on it.

---

## Workflow Phases

### Phase 0: Requirements Discovery
**Input:** User describes the repo, the task the agent should handle, and constraints.
**Process:**
1. Research the target repo — file structure, build system, conventions, existing agents/skills
2. Research the task domain — what does "this task" actually require? (e.g., for docs: what CMS, what format, what review process)
3. Interview the user to fill gaps:
   - What triggers this agent? (JIRA issue type, comment trigger, manual invocation)
   - What's the expected output? (PR, JIRA comment, file set, report)
   - What external services does it need? (APIs, MCP tools, databases)
   - What quality gates exist? (reviews, builds, tests, human sign-off)
   - What are the failure modes? (repo access, build failures, scope ambiguity)
   - Are there existing agents/skills to reuse or extend?
4. Produce a **Requirements Document** summarizing: scope, inputs, outputs, external dependencies, quality gates, failure modes, constraints

**Checkpoint:** `ask_questions` — "Does this requirements summary capture what you need? Anything missing or wrong?"

### Phase 1: Responsibility Analysis
**Input:** Requirements document from Phase 0
**Process:** (follows `agent-as-function/references/subagent-analysis.md`)
1. Inventory every responsibility the agent needs to perform
2. Classify each: subagent vs orchestrator duty
3. For each subagent candidate, specify: role, cognitive load, inputs, outputs, tools needed
4. Identify which responsibilities are reusable from existing agent families (e.g., ralph-scribe pattern for handoff)

**Output:**
- Responsibility inventory table
- Classification decisions with rationale
- Proposed subagent roster (name, role, model recommendation, I/O)
- Orchestrator duties list

**Checkpoint:** `ask_questions` — "Here's the responsibility breakdown. Which subagents should be split differently? Any that should merge? Any orchestrator duties that should be delegated?"

### Phase 2: Architecture Design
**Input:** Approved responsibility analysis
**Process:**
1. Define the routing table — every `(subagent, result)` → action
2. Map the data flow — who reads what, who writes what
3. Identify iteration loops (write → review → revise) with max bounds
4. Identify parallel dispatch opportunities (multiple reviewers, research panels)
5. Define the artifact contract — directory structure, status.json fields, custom result codes per subagent
6. Decide on model allocation per subagent (reasoning-heavy → Opus, mechanical → Sonnet, formatting → Haiku)
7. Identify post-task hooks if needed (scientist-style analysis, metrics collection)

**Output:**
- Routing table
- Data flow diagram (ASCII or Mermaid)
- Artifact directory structure
- Per-subagent result code table
- Model allocation table
- Iteration/loop limits

**Checkpoint:** `ask_questions` — "Here's the architecture. Check: routing table completeness, data flow correctness, iteration limits, model choices. Anything to adjust?"

### Phase 3: Skill Gap Analysis
**Input:** Approved architecture + target repo research
**Process:** (follows `agent-as-function/references/skill-discovery.md`)
1. List every domain the agent needs knowledge about (e.g., docs format conventions, API surface, build system, review standards)
2. Audit existing skills — which are reusable as-is, which need extension, which are missing
3. For each subagent, list the skills it should mount
4. For each gap, describe the candidate skill: name, trigger conditions, content scope, reference files needed
5. Identify shared skills (used by multiple subagents) vs. subagent-specific skills

**Output:**
- Skill inventory: existing (reuse), existing (extend), new (create)
- Per-subagent skill mount list
- Candidate skill specs for new skills (name, scope, trigger, estimated size)

**Checkpoint:** `ask_questions` — "Here's the skill plan. Are there domain areas I missed? Any skills that should be split or merged? Priorities for which to create first?"

### Phase 4: Workflow Decomposition
**Input:** Approved architecture + skill plan
**Process:** (follows `agent-as-function/references/workflow-decomposition.md`)
1. Identify natural phase boundaries in the orchestrator's workflow
2. Design the scratchpad contract (`state.md` structure)
3. For each phase, specify: phase skill name, domain skills loaded, transition conditions
4. Design the compact workflow table for the orchestrator prompt
5. For revision/variant workflows, design the variant workflow table

**Output:**
- Phase table (number, name, skill, summary)
- Scratchpad contract (state.md template)
- Per-phase skill manifest (what skills load at each transition)
- Variant workflow tables (if applicable)

**Checkpoint:** `ask_questions` — "Here's the workflow decomposition. Correct phase boundaries? Right skills at each phase?"

### Phase 5: Bootstrap Implementation
**Input:** All approved artifacts from Phases 0–4
**Process:** Create files incrementally, with sub-checkpoints:

#### 5a. Profile configuration
- Create or update `profile.json` with the new agent family
- Configure data source, match rules, stages, MCP servers
- **Sub-checkpoint:** "Profile config looks like this. Correct?"

#### 5b. Orchestrator template
- Create `ralph.<name>.agent.md` with:
  - Frontmatter (agents list, model, description)
  - Identity section
  - Orchestration model (subagent roster, routing table, dispatch model, rules)
  - Execution procedure
  - Error handling
  - Workflow section (renders the workflow partial)
- Wire the `agent-as-function-contract` partial
- **Sub-checkpoint:** "Orchestrator template created. Review the routing table and dispatch logic."

#### 5c. Subagent templates (one at a time)
- For each subagent in the approved roster:
  - Create the `.agent.md` stub with frontmatter
  - Create the shared include partial (if applicable) or direct prompt content
  - Define input/output artifacts, result codes, instructions
  - Wire the `agent-as-function-contract` partial
  - **Sub-checkpoint per subagent:** "Created `<subagent>`. Review its inputs, outputs, and result codes."

#### 5d. Workflow skills
- Create each phase skill following the decomposition from Phase 4
- Wire transition sections with skill manifests
- Create the workflow partial (rendered by the orchestrator)
- **Sub-checkpoint:** "Workflow skills created. Review phase transitions."

#### 5e. Domain skills
- For each "new" skill from the skill gap analysis:
  - Draft SKILL.md with frontmatter, instructions, reference pointers
  - Create reference files for domain knowledge
  - **Sub-checkpoint per skill:** "Created `<skill>`. Does the scope and trigger condition look right?"

### Phase 6: Validation
**Input:** All created files
**Process:** (follows `agent-as-function-audit` checklist)
1. Run template rendering tests — all new templates must render without errors
2. Validate JSON (profile.json) 
3. Audit agent-as-function compliance:
   - Orchestrator purity — no output.md reads, no data relaying
   - Artifact contract — every subagent writes status.json + output.md
   - Routing table completeness — every result code is handled
   - Data flow — no orchestrator appears in data transmission, subagents read filesystem
4. Check for dangling references — skills mentioned but not created, agents in roster but not wired
5. Verify ordering constraints cover all hard dependencies

**Output:**
- Audit findings (if any)
- Fix actions taken
- Final file inventory

**Checkpoint:** "Validation complete. N files created, M audit findings fixed. Here's the inventory. Ready to test?"

### Phase 7: Test Plan (optional)
**Input:** Completed agent family
**Process:**
1. Draft 2-3 realistic test cases — JIRA issues or prompts that exercise the main workflow
2. Identify edge cases — revision flow, blocked researcher, build failure, reviewer disagreement
3. Propose evaluation dimensions (from agent-eval skill) relevant to this agent type
4. If the user wants, set up the skill-creator evaluation loop for the domain skills

**Checkpoint:** "Here are the test cases. Want to run them, or adjust first?"

---

## File Structure

The skill itself and its reference files:

```
.github/skills/agent-creator/
├── SKILL.md                          # Main skill — workflow overview + phase instructions
└── references/
    ├── requirements-template.md      # Phase 0 output template
    ├── responsibility-template.md    # Phase 1 output template  
    ├── architecture-template.md      # Phase 2 output template
    ├── skill-gap-template.md         # Phase 3 output template
    ├── workflow-template.md          # Phase 4 output template
    └── validation-checklist.md       # Phase 6 checklist
```

The skill doesn't need scripts or bundled assets — it produces markdown documents and agent templates using existing infrastructure patterns.

## Relationship to Existing Skills

```
agent-creator (NEW — top-level workflow)
  ├── uses: agent-as-function (architecture patterns, subagent analysis, data flow)
  ├── uses: agent-subagent-wiring (wiring checklist, role patterns)
  ├── uses: skill-creator (skill authoring, evaluation loop)
  ├── uses: agent-as-function-audit (final validation)
  └── uses: agent-eval (test evaluation dimensions)
```

The agent-creator is a **composition skill** — it sequences the existing skills into a guided workflow. It doesn't duplicate their content; it tells you which reference to read at each step.

---

## Implementation Order

| Step | What | Depends on | Effort |
|------|------|-----------|--------|
| 1 | Write `SKILL.md` — main skill body with all 8 phases | — | Medium |
| 2 | Write `references/requirements-template.md` | Step 1 | Small |
| 3 | Write `references/responsibility-template.md` | Step 1 | Small |
| 4 | Write `references/architecture-template.md` | Step 1 | Small |
| 5 | Write `references/skill-gap-template.md` | Step 1 | Small |
| 6 | Write `references/workflow-template.md` | Step 1 | Small |
| 7 | Write `references/validation-checklist.md` | Step 1 | Small |
| 8 | Test: use the skill to create a toy agent family | Steps 1-7 | Medium |
| 9 | Iterate based on test run | Step 8 | Varies |

## Open Questions

1. **Should the skill create the Docker/compose infrastructure too?** Currently, profile infrastructure (Dockerfile, docker-compose.yml, setup script) is manually authored per profile. The agent-creator could generate scaffolds for these, but it adds complexity. **Recommendation:** Phase 5a creates `profile.json` only; Docker infrastructure is a separate step documented as a follow-up.

2. **Should it support non-Ralph agent frameworks?** The skill is deeply tied to Ralph's artifact contract (status.json, manifest.json, `.ralph/tasks/` paths). Making it generic would sacrifice the specificity that makes it useful. **Recommendation:** Keep it Ralph-specific. Document the pattern so it can be adapted.

3. **How to handle the "too many checkpoints" problem?** 8 phases × sub-checkpoints could be tedious for experienced users. **Recommendation:** Add a `--fast` mode mentioned in the skill where steps 0-4 are collapsed into a single "analyze and propose" phase with one checkpoint, and step 5 creates everything at once with one final checkpoint.

4. **Should phase outputs be persisted to files?** Each phase produces a deliverable (requirements doc, responsibility analysis, etc.). These could be written to `plans/<agent-name>/` for traceability or kept in conversation context. **Recommendation:** Write to files — it creates an audit trail and lets the user review outside the conversation.
