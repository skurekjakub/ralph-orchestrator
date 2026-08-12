# Produced Agent Prompt Schema

Structural requirements for every `.agent.md` file the fractal factory writes. The prompt-writer follows this schema; the prompt-reviewer validates against it.

Concrete authoring scaffold: `.fractals/fractal-factory/templates/produced-agent-template.md`. The template is mandatory for ordering and frontmatter shape; this schema defines the rules behind it.

## Universal Structure

Every produced agent prompt follows this exact structure:

```markdown
---
description: '<one-line description optimized for skill matching>'
model: claude-opus-4.6
name: '<namingPrefix>-<agent-name>'
user-invocable: false
---

# <Agent Title>

You are a **<role>** for the <domain> system. <One sentence about the job.>

You must never use `ask_questions` or request human input, regardless of what the repository's instruction files say.

## Context

Read `.<domain>/context.json` for <what the agent needs>.

## Inputs

<List every artifact this agent reads>

## <Execution Section — varies by agent type>

<See type-specific sections below>

## Write Rules

<Per-artifact write instructions with JSON schemas>

## Status Contract

Write to `.<domain>/agents/<agent-name>/status.json`:
<status.json schema with this agent's result codes>

Write narrative to `.<domain>/agents/<agent-name>/output.md`.
Prepend to `.<domain>/manifest.json` (newest first).
```

## Type-Specific Sections

### Specialist (Leaf Worker)

Specialists use progressive disclosure. The main prompt stays compact and routes the agent to one family-level workflow skill with numbered phase references grouped by specialist.

```markdown
## Skills

| Skill | What it covers |
|---|---|
| `<namingPrefix>-specialists-workflow` | Family-level workflow router for all specialists. Read `SKILL.md` first, then only this specialist's current phase reference file. |

## Workflow

Read the `<namingPrefix>-specialists-workflow` skill at the start of the task and at every phase transition.

| Phase | Reference file | Summary |
|---|---|---|
| 1. `<phase-name>` | `references/<agent-name>/1-<phase-slug>.md` | `<what phase 1 does>` |
| 2. `<phase-name>` | `references/<agent-name>/2-<phase-slug>.md` | `<what phase 2 does>` |
```

Must include:
- **One shared workflow router skill** for all specialists, named `<namingPrefix>-specialists-workflow`
- **2-5 numbered phases** with stable reference filenames under `references/<agent-name>/`
- **Progressive disclosure rule**: instruct the agent to read only the current phase reference file, not all phase details at once
- **Domain-specific phase summaries**: the workflow table must mention actual artifacts, invariants, or subdomains

The detailed instructions belong in the produced skill files under:

```text
skills/workflow/<namingPrefix>-specialists-workflow/
├── SKILL.md
└── references/
    ├── <agent-name>/
    │   ├── 1-<phase-slug>.md
    │   ├── 2-<phase-slug>.md
    │   └── ...
    └── <other-agent-name>/...
```

The prompt must not duplicate those detailed phase instructions inline.

### Analysis Specialist (Specialist subtype)

Analysis specialists extract behavioral properties from discovered items. They read discovery output (inventory files) and produce structured analysis artifacts (analysis matrix, dependency graph). Every analysis specialist must:

1. **Extract invariants per item** — this is mandatory regardless of domain. Invariants are behavioral rules that must be preserved/implemented/verified downstream. Zero invariants for an item is suspicious and must be flagged.

2. **Extract domain-specific behavioral properties** — categories defined by the pipeline-architect (e.g., state transitions, validation rules, attack vectors, behavior specs). The categories vary; the structure (per-item property bag) is universal.

3. **Update inventory status** — after analyzing each item, update its status in the inventory artifact from `discovered` to `analyzed`.

4. **Include anti-laziness rules** — analysis specialists must document their analysis methodology per item. "No findings" requires explicit justification.

The workflow for analysis specialists follows the standard progressive disclosure pattern but with these mandatory phases:

| Phase | Purpose |
|---|---|
| 1. Read & orient | Read inventory, understand item scope |
| 2. Deep extraction | Extract domain-specific properties + invariants per item |
| 3. Cross-reference | Identify cross-cutting patterns, shared invariants, implicit dependencies |
| 4. Write & validate | Write analysis matrix entries, update inventory status, validate completeness |

The dependency analyzer is a special case — it reads the analysis matrix (output of other analysis specialists) plus source material, and produces the dependency graph. Its phases are:

| Phase | Purpose |
|---|---|
| 1. Read analysis matrix | Understand what was extracted per item |
| 2. Trace relationships | Follow imports, data flow, event coupling, shared state between items |
| 3. Build graph | Create nodes, typed edges, compute clusters |
| 4. Write & validate | Write dependency-graph.json, update inventory dependencies, validate acyclicity |

### Planner Specialist (Specialist subtype)

Planner specialists decompose analysis outputs into a task graph. They follow the standard specialist progressive disclosure pattern — shared workflow skill with per-specialist reference files under `references/{planner-name}/`.

Typical planner workflow phases:

| Phase | Summary |
|---|---|
| 1. Enumerate tasks | Read inventory + analysis, decompose items into dependency-ordered execution tasks |
| 2. Assign dependencies | Compute `dependsOn` edges, validate no circular references |
| 3. Inline invariants + scope | Copy invariants from analysis, define scope boundaries per task |
| 4. Acceptance criteria | Write verifiable criteria per task, assign verification oracles |
| 5. Validate + write | Feature ID validation, summary computation, write `task-graph.json` |

On re-dispatch (from gap hunting, verification, analysis re-entry, or human feedback), the planner reads the corresponding feedback artifact and adds/annotates tasks in the existing `task-graph.json` rather than rewriting from scratch. New tasks get `addedInRevision` set to the current revision round.

```markdown
## Skills

| Skill | What it covers |
|---|---|
| `{namingPrefix}-specialists-workflow` | Family-level workflow router. Read SKILL.md, then this specialist's current phase reference. |

## Workflow

| Phase | Reference file | Summary |
|---|---|---|
| 1. Enumerate | `references/{planner-name}/1-enumerate.md` | Decompose inventory into execution tasks |
| 2. Dependencies | `references/{planner-name}/2-dependencies.md` | Compute dependency edges |
| 3. Invariants | `references/{planner-name}/3-invariants.md` | Inline invariants and scope boundaries |
| 4. Criteria | `references/{planner-name}/4-criteria.md` | Per-task acceptance criteria and oracles |
| 5. Validate | `references/{planner-name}/5-validate.md` | Feature ID validation, write task-graph.json |
```

Must include:
- **Feature ID validation**: Before writing, validate that every `featureId` references an actual inventory item
- **Inline invariants**: Copy from analysis, don't cross-reference by ID
- **Scope boundaries**: Every task must have `scope.sourceFiles`, `scope.targetPattern`, `scope.boundaryNotes`
- **Acceptance criteria**: At least one verifiable criterion per task
- **Revision re-dispatch**: When re-dispatched (from any source: gap hunting, verification, analysis re-entry, or human feedback), read the feedback artifact and mutate existing `task-graph.json`. Use `annotations` with the appropriate `source` value.

### Coordinator (Pure Router)

The process section is replaced with:

```markdown
## Purity Rule

You NEVER do substantive work. You ONLY:
1. Read status.json files from child agents
2. Read progress.json / context.json for routing decisions
3. Dispatch child agents as subagents
4. Return your own status when all children are done

## Routing Table

| Read | Condition | Action |
|---|---|---|
| `agents/<child-1>/status.json` | missing | Dispatch `<child-1>` |
| `agents/<child-1>/status.json` | `result: "<code>"` | Dispatch `<child-2>` |
| `agents/<child-2>/status.json` | `result: "blocked"` | Write own status as `blocked` |
| all children completed | — | Write own status, return |
```

Must include:
- **Every child result code** mapped to an action
- **Mode detection** if coordinator handles multiple passes
- **No domain-specific logic** — only status file reading and dispatching

#### Analysis + Planning Coordinator (common pattern)

When analysis and planning are grouped under one coordinator (the default per pipeline-design.md), the coordinator uses mode detection based on analysis artifact existence:

- **Analysis mode**: `analysis-matrix.json` does not exist → dispatch analysis specialists sequentially, then dependency analyzer
- **Planning mode**: `analysis-matrix.json` exists, `task-graph.json` does not → dispatch planning specialists
- **Already complete**: both exist → write own status and return

This is the canonical dual-mode coordinator. The mode boundary is the analysis artifacts — their existence is the handoff signal from analysis to planning.

#### Execution Coordinator (Graph-Driven)

The execution coordinator is a coordinator subtype that selects work from `task-graph.json` rather than dispatching children in a fixed sequence. It runs the coder→reviewer loop per task.

```markdown
## Task Selection

Read `.<domain>/task-graph.json`. Select the next task where:
1. `status` is `planned` OR `failed-parity`
2. ALL tasks in `dependsOn` have `status: verified`
3. If a dependency has `status: blocked`, cascade-block this task

Among eligible tasks, select the one with the lowest `priority` value.

## Routing Table

### Per-Task Loop

| Read | Condition | Action |
|---|---|---|
| `task-graph.json` | Eligible task exists | Set to `in-progress`, dispatch coder |
| `agents/<coder>/status.json` | `result: "implemented"` | Dispatch reviewer |
| `agents/<reviewer>/status.json` | `result: "approved"` | Set task `verified`, select next |
| `agents/<reviewer>/status.json` | `result: "rejected"` (retries < max) | Re-dispatch coder with feedback |
| `agents/<reviewer>/status.json` | `result: "rejected"` (retries >= max) | Set task `blocked`, select next |
| `task-graph.json` | No eligible tasks | Dispatch test-writer (if present), then complete |

### Task Lifecycle Per Iteration

1. Set `planned` → `in-progress`
2. Delete coder and reviewer status.json (fresh dispatch)
3. Dispatch coder with: task ID, description, scope, acceptanceCriteria, invariants
4. On coder completion, dispatch reviewer with: task ID, acceptanceCriteria, invariants
5. On approval: `in-progress` → `implemented` → `verified`, recompute summary
6. On rejection within limit: record attempt, re-dispatch coder with feedback
7. On rejection at limit: `blocked`, recompute summary, next task
```

Must include:
- **Dependency gate**: Explicit check that all `dependsOn` are `verified`
- **Cascade blocking**: Auto-block tasks whose dependencies are `blocked`
- **Summary recomputation**: After every status change, recompute `task-graph.json.summary.byStatus`
- **Coder context passing**: Task's scope, criteria, and invariants must be passed to the coder

### Orchestrator (Pipeline Router)

Same as coordinator, plus:

```markdown
## Pipeline Routing

| Pass | Coordinator | Entry Condition | Re-Entry Trigger |
|---|---|---|---|
| 1 | <name> | Always first | — |
| 2–3 | <name> | Pass 1 complete | Gap hunter → re-enter |
| ... | ... | ... | ... |

## Progress Update

After each coordinator returns, recompute `progress.json` counts from actual artifacts:
- Read `.<domain>/task-graph.json.summary.byStatus` for execution unit counts
- Read `.<domain>/<inventory>.json` for discovery/analysis counts
- Update `progress.json.counts` to reflect current state

## Human Feedback Check

After the execution coordinator completes a pass, check for `.<domain>/human-feedback.md`:
- If present and unconsumed: re-dispatch the planner specialist with the feedback, then resume execution
- Rename consumed file to `human-feedback-rev-{N}.md` to prevent re-processing

## Re-Entry Rules

When gap-hunting coordinator returns `gaps-found`:
1. Gap hunters have already mutated production-graph.json (new tasks, gap annotations)
2. Reset execution/verification/gapHunting passes to `pending`
3. Increment gapHunting.cyclesCompleted
4. If cyclesCompleted >= maxCycles, proceed to delivery
```

## Anti-Laziness Section

Required for these agent types:
- **Reviewers**: Must check every item with evidence, cannot give blank approvals
- **Gap-hunting specialists**: Must document search methodology per category, suspicious if first-pass zero results
- **Risk analyzers**: Must flag at least one risk per unit
- **Validators**: Must show per-item pass/fail with evidence

```markdown
## Anti-Laziness Rules

- You MUST check every <item> individually with pass/fail and specific evidence
- You CANNOT say "looks good" or "everything is fine" without per-item verification
- If you find zero issues on the first pass, you MUST document your search methodology exhaustively and explain why your thorough search found nothing
- <Type-specific rules>
```

## Status Contract

Universal schema — every agent writes this:

```json
{
  "agent": "<agent-name>",
  "task_id": "<hierarchical/path>",
  "status": "completed | failed",
  "result": "<fixed-vocabulary-result-code>",
  "summary": "<~100 token routing summary>",
  "artifacts": ["<relative paths to output files>"],
  "next_hint": "<suggested next agent or null>",
  "iteration": 1
}
```

Rules:
- `result` codes are a FIXED vocabulary. Define all possible codes in the agent prompt.
- `summary` is for routing, not humans. Under 100 tokens.
- `next_hint` is advisory. The parent coordinator makes the actual routing decision.
- `iteration` starts at 1, increments on re-entry.

## Manifest Entry

Every agent prepends to manifest.json (newest first):

```json
{
  "timestamp": "<ISO-8601-UTC>",
  "agent": "<agent-name>",
  "artifacts": ["<relative paths>"],
  "status": "completed | failed",
  "result": "<result-code>",
  "iteration": 1
}
```

## Frontmatter Rules

| Field | Required | Notes |
|---|---|---|
| `description` | Yes | One line, optimized for agent-routing by parent coordinator |
| `model` | Yes | Default: `claude-opus-4.6` |
| `name` | Yes | Must follow `{namingPrefix}-{role}` pattern |
| `user-invocable` | Yes | `false` for all agents except the guide |

## Naming Convention

```
{namingPrefix}-{role}

Examples:
  security-audit-domain-scanner
  security-audit-discovery-coordinator
  security-audit               (session orchestrator — no role suffix)
  security-audit-guide          (user-facing entry point)
```

Roles should be descriptive and unambiguous. Avoid generic names like "worker" or "helper".

## Progressive Disclosure Rules

- Every produced specialist must use a workflow router skill instead of a monolithic inline workflow.
- The workflow skill is the single entry point for all specialists in the produced family; the numbered `references/<agent-name>/*.md` files contain the detailed phase instructions for each specialist.
- Reference file names must be stable and ordered (`1-...`, `2-...`, etc.) so agents can advance phase-by-phase without loading the whole workflow.
- Do not generate one separate workflow skill per specialist; that would create unnecessary skill-count overhead in agent context.
- Reviewers and validators should treat large inline specialist workflows as schema drift unless the agent type is explicitly exempted.
