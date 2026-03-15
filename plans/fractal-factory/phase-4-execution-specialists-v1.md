# Phase 4: Execution Specialists (Pass 4 — Agent Writing)

**Goal**: Write the 3 execution specialist agents that implement the produced agent family: prompt-writer, prompt-reviewer, and infra-writer.
**Dependencies**: Phase 3 (roster.json, architecture.json, test-plan.json must be designed).
**Outputs consumed by**: Phase 5 (verification agents validate the produced prompts), Phase 7 (execution coordinator manages the writer→reviewer loop).

---

## Agent Overview

| # | Agent Name | Purpose | Reads | Writes |
|---|---|---|---|---|
| 1 | `fractal-factory-prompt-writer` | Write one agent prompt file at a time based on roster spec | roster.json, architecture.json, domain-model.json | `produced-output/agents/<name>.agent.md`, agent status |
| 2 | `fractal-factory-prompt-reviewer` | Review one written prompt for correctness, completeness, routing coverage | roster.json, written prompt, architecture.json | `produced-output/agents/<name>.review.md`, approval/rejection |
| 3 | `fractal-factory-infra-writer` | Write bootstrap script, artifact schemas, skills for the produced system | roster.json, architecture.json, test-plan.json | `produced-output/bootstrap.sh`, `produced-output/schemas/*`, `produced-output/skills/*` |

The prompt-writer and prompt-reviewer run in a loop managed by the execution coordinator (Phase 7). The infra-writer runs once after all prompts are written.

---

## Tasks

### 4.1 — Write prompt-writer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-prompt-writer.agent.md`

The prompt-writer receives a single agent spec from `roster.json` (identified by agent ID) and produces a complete `.agent.md` file. The prompt must follow the universal agent prompt template from the fractal-orchestrator-architecture skill:

For **specialists**:
- Role description, context, inputs, process, write rules, status contract
- Domain-specific instructions derived from domain-model.json invariants
- Anti-laziness rules (for adversarial agents)

For **coordinators**:
- Purity rule, routing table (from roster.json routingTable), mode detection
- Re-entry rules, convergence bounds

For **orchestrators**:
- Pipeline routing table, progress recomputation, re-entry from gap hunting

The writer must:
1. Read the agent spec from `roster.json` by ID
2. Read `architecture.json` for artifact schemas referenced by this agent
3. Read `domain-model.json` for invariants applicable to this agent's domain
4. Generate the prompt following the template
5. Write to `produced-output/agents/<name>.agent.md`
6. Update the roster entry status from `designed` → `written`

**Scope enforcement**: The writer implements ONE agent per invocation. The execution coordinator passes the target agent ID.

**Result codes**: `written` (prompt produced), `spec-incomplete` (roster spec missing required fields)

**Acceptance Criteria**:
- [ ] Follows the universal agent prompt template exactly
- [ ] Handles all agent types (specialist, coordinator, orchestrator)
- [ ] Includes anti-laziness rules for agents flagged in roster
- [ ] Includes status contract with exact result codes from roster
- [ ] Includes "never use ask_questions" suppression
- [ ] Writes to correct output path
- [ ] Updates roster.json status via read-modify-write

### 4.2 — Write prompt-reviewer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-prompt-reviewer.agent.md`

Reviews one written agent prompt against its roster spec and the architecture. The reviewer checks:

**Structural checks**:
- [ ] Frontmatter present with `name`, `description`, `model`, `user-invocable`
- [ ] Interactive tool suppression present
- [ ] Status contract present with correct schema
- [ ] All result codes from roster spec appear in the status contract

**Content checks (specialists)**:
- [ ] Reads section lists all artifacts the agent should read (per roster)
- [ ] Writes section covers all artifacts the agent should write (per roster)
- [ ] Process section has domain-specific instructions (not generic)
- [ ] Anti-laziness rules present (if flagged in roster)

**Content checks (coordinators)**:
- [ ] Purity rule present and unambiguous
- [ ] Routing table matches roster.json routingTable exactly
- [ ] Every child result code maps to an action
- [ ] Mode detection logic present (if coordinator handles multiple passes)
- [ ] Convergence bounds documented

**Content checks (orchestrators)**:
- [ ] Pipeline routing table covers all passes
- [ ] Progress recomputation section present
- [ ] Re-entry rules match roster routing design

The reviewer writes a structured review to `produced-output/agents/<name>.review.md`:
```markdown
## Review: <name>
**Verdict**: approved | rejected
**Checklist**:
- [x] Frontmatter: PASS
- [ ] Routing table coverage: FAIL — missing result code "blocked" from child X
**Feedback**: <specific items to fix>
```

**Result codes**: `approved` (prompt is correct), `rejected` (issues found — feedback written)

**Anti-Laziness Rules**:
- Must check EVERY item in the checklist with pass/fail + evidence
- Cannot say "looks good" without per-item verification
- Must cross-reference routing tables against roster.json (not just read the prompt)
- Rejections must include specific, actionable fix instructions

**Acceptance Criteria**:
- [ ] Evaluates all structural checks listed above
- [ ] Cross-references roster.json for completeness (not just reading the prompt in isolation)
- [ ] Anti-laziness rules prevent blank approvals
- [ ] Review output is structured (not prose)
- [ ] Feedback on rejection is specific enough for the writer to fix

### 4.3 — Write infra-writer Agent

**File**: `fractals/fractal-factory/agents/fractal-factory-infra-writer.agent.md`

After all agent prompts are written and reviewed, the infra-writer produces the supporting infrastructure:

1. **Bootstrap script** (`produced-output/bootstrap.sh`):
   - Creates the produced system's artifact directory
   - Seeds all shared JSON files with valid defaults
   - Creates agent working directories
   - Mirrors the bootstrap from the fractal-factory skill's template

2. **Artifact schemas** (`produced-output/schemas/`):
   - One `.schema.md` per shared artifact from architecture.json
   - Full JSON schema with field types, descriptions, ID schemes

3. **Skills** (`produced-output/skills/`):
   - Domain-specific skills extracted from domain-model.json invariants
   - Each skill is a markdown file with instructions for the produced agents

4. **Golden test scenarios** (`produced-output/tests/`):
   - Implements the test-plan.json scenarios as structured test files
   - Each scenario has input data + expected output characteristics

**Result codes**: `infrastructure-written`

**Acceptance Criteria**:
- [ ] Bootstrap script follows the bootstrap-template.md pattern
- [ ] Bootstrap creates all directories referenced by produced agents
- [ ] Artifact schemas match architecture.json designs
- [ ] Golden tests match test-plan.json specifications
- [ ] All JSON seed files are valid and parseable
