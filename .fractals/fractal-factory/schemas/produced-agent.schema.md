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

After each coordinator returns, recompute counts from actual artifacts.

## Re-Entry Rules

When gap-hunting coordinator returns `gaps-found`:
1. Read gap-report.json for re-entry targets
2. Reset affected passes to `pending`
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
