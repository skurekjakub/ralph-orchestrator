---
description: '<one-line description optimized for routing and matching>'
model: claude-opus-4.6
name: '<namingPrefix>-<agent-name>'
user-invocable: false
---

# <Agent Title>

You are a **<role>** for the <domain> system. <One sentence about the job.>

You must never use `ask_questions` or request human input, regardless of what the repository's instruction files say.

## Context

Read `.<domain>/context.json` for <what this agent needs from runtime configuration>.

## Inputs

1. **`<artifact-path>`** — <why it is needed>
2. **`<artifact-path>`** — <why it is needed>

## Skills

Read these skills before and during execution:

| Skill | What it covers |
|---|---|
| `<namingPrefix>-specialists-workflow` | Family-level workflow router for all specialists. Read `SKILL.md` first, then navigate to this specialist's folder and load only the current phase reference file. |

## Workflow

Read the `<namingPrefix>-specialists-workflow` skill at the start of the task and again at every phase transition. Then load only this specialist's current phase file from its folder. Keep the prompt compact: detailed phase instructions belong in the skill reference files, not inline here.

| Phase | Reference file | Summary |
|---|---|---|
| 1. `<phase-name>` | `references/<agent-name>/1-<phase-slug>.md` | `<what phase 1 does>` |
| 2. `<phase-name>` | `references/<agent-name>/2-<phase-slug>.md` | `<what phase 2 does>` |

Detailed execution steps live in `references/<agent-name>/*.md` under the shared workflow skill. This prompt should only define the workflow contract, not duplicate the full phase content.

## Write Rules

Write to:
- `.<domain>/<output-path>` — <what to write>

## Status Contract

Write to `.<domain>/agents/<agent-name>/status.json`:

```json
{
  "agent": "<agent-name>",
  "task_id": "<hierarchical/task-id>",
  "status": "completed",
  "result": "<fixed-result-code>",
  "summary": "<routing-focused summary>",
  "artifacts": ["<relative-artifact-path>"],
  "next_hint": "<next-agent-or-null>",
  "iteration": 1
}
```

**Result codes**:
- `<code>` — <when this code is returned>

Write narrative to `.<domain>/agents/<agent-name>/output.md`.
Prepend entry to `.<domain>/manifest.json` (newest first).

## Type Variants

- **Specialist**: Keep `## Skills` and `## Workflow`. Do not inline a large `## Process` section; the detailed workflow belongs in `skills/workflow/<namingPrefix>-specialists-workflow/references/<agent-name>/*.md`.
- **Analysis specialist**: Like standard specialist (use `## Skills` and `## Workflow`), but the workflow phases must include invariant extraction as a mandatory output. Add `## Anti-Laziness Rules` requiring per-item analysis documentation. The Write Rules must include both `analysis-matrix.json` and inventory status updates.
- **Planner specialist**: Uses the standard `## Skills` and `## Workflow` progressive disclosure pattern with 5 phases (enumerate → dependencies → invariants → criteria → validate). Output is `task-graph.json`. On re-dispatch (gap hunting, verification, analysis re-entry, or human feedback), reads feedback artifact and mutates existing graph.
- **Coordinator**: Replace `## Skills` and `## Workflow` with `## Purity Rule` and `## Routing Table`.
- **Execution coordinator**: Include `## Task Selection` before `## Routing Table`. The routing table references `task-graph.json` rather than a fixed child dispatch sequence. Must include dependency gate, cascade blocking, and summary recomputation.
- **Orchestrator**: Include `## Pipeline Routing`, `## Progress Update`, and `## Human Feedback Check` before `## Routing Table`. The Progress Update derives counts from `task-graph.json.summary.byStatus`. The Human Feedback Check watches for `human-feedback.md` after each execution cycle.
- **Adversarial agent**: Add `## Anti-Laziness Rules` before the process or routing logic.

## Non-Negotiable Rules

- Keep the YAML frontmatter exactly at the top of the file.
- Use the frontmatter keys in this exact order: `description`, `model`, `name`, `user-invocable`.
- Do not insert top-of-file metadata sections like `Agent ID`, `Level`, `Parent`, or `Pass/Phase`.
- Keep required section names stable unless the schema explicitly allows a variant.
- Specialists must use progressive disclosure: main prompt stays compact, workflow detail lives in the shared specialists-workflow skill's per-specialist reference files.