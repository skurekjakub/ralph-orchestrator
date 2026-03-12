---
name: planner-loop-wiring
description: "Add a planner subagent with a verification loop to an existing agent-as-function orchestrator family. The planner decomposes analyst output into ordered task files, the coder/reviewer loop executes per-task, and a second planner pass verifies completeness against the original spec. Use this skill whenever adding a planner, task decomposition, per-task execution loop, verification pass, 'break tasks into smaller pieces', 'execute one at a time', 'two-pass planning', 'planner verification', 'spec gap detection', 'plan then verify', or any request to introduce task-level granularity into an existing multi-agent pipeline. Also triggers on: 'add a planning phase', 'the coder is doing too much at once', 'tasks should be smaller', or 'verify all spec items were implemented'."
---

# Planner Loop Wiring

This skill adds a **planner subagent with a two-pass verification loop** to an existing agent-as-function orchestrator family. The planner sits between the analyst and the coder, decomposing the analyst's plan into ordered task files that the coder executes one at a time through a coder→reviewer loop. After all tasks complete, the planner runs again in verification mode to catch spec gaps — producing follow-up tasks if needed.

The result is a three-level iteration structure:
1. **Planner pass** (max 2) — initial plan → execute → verify → optional gap-fill round
2. **Task progression** — ordered tasks from `tasks.json`
3. **Per-task coder→reviewer loop** — configurable max rounds per task

## When to Use This Skill

Use this when an existing agent family has:
- A single coder→reviewer loop processing the analyst's entire plan at once
- Tasks that are too large for reliable single-pass implementation
- Missing changes that slip through because the coder tackles everything in one batch
- No post-implementation verification against the original spec

Do **not** use this when:
- The agent family doesn't follow agent-as-function (use `agent-as-function` first)
- You only need to add a simple subagent without per-task iteration (use `agent-subagent-wiring`)
- You're building an agent family from scratch (use `agent-creator`)

## Companion Skills

| Skill | When to also use it |
|---|---|
| `agent-subagent-wiring` | For the mechanical wiring checklist — this skill extends it with planner-specific patterns |
| `agent-as-function` | If the family doesn't follow the artifact handoff pattern yet |
| `agent-workflow-phase-editor` | If the workflow uses numbered phase skills that need renumbering |

## References

| File | Purpose |
|---|---|
| `references/design-questions.md` | Interactive question set to run with the user before implementation |
| `references/planner-prompt-template.md` | Annotated template for the planner `.agent.md` with customization points |
| `references/wiring-procedure.md` | Step-by-step procedure for all file edits required |
| `references/verification-pass.md` | How the two-pass planner verification loop works |

## Process

### Phase 1: Discovery

Before touching any files, gather context about the target agent family.

1. **Identify the profile** — which profile directory under `profiles/` are we modifying?
2. **Read the orchestrator** — the main `ralph.*.agent.md` that routes subagents
3. **Read the analyst** — understand what output format the planner will consume
4. **Read the coder** — understand current input sources (analyst → coder direct?)
5. **Read the reviewer** — understand review scope
6. **Read the workflow skill/references** — find the phase table and implement-loop reference
7. **Read the scribe** (if present) — artifact list needs updating

Record in your working notes: profile path, orchestrator file, all subagent files, workflow reference files, current routing order, current iteration caps, current coder input sources.

### Phase 2: Design Questions (interactive)

Read `references/design-questions.md` and run the question set with the user via `ask_questions`. This phase is mandatory — the answers determine planner scope, iteration limits, verification behavior, and conditional toggle design.

Do not proceed until the user has confirmed answers for all required questions. Optional questions can use recommended defaults if the user doesn't have a preference.

### Phase 3: Create the Planner Agent

Read `references/planner-prompt-template.md` for the annotated template.

Create `profiles/<profile>/agents/<orchestrator-prefix>.ralph-planner.agent.md` using the template, customized based on the Phase 2 answers:

- Architecture section pulled from the existing coder's architecture context
- Result codes: `planned`, `verified`, `gaps_found`, `blocked`
- Input section for standard and revision modes
- Verification pass section (second-dispatch behavior)
- Task design rules scoped to the target repository's patterns
- `tasks.json` schema with project-appropriate `type` values
- Task file template with project-appropriate acceptance criteria

### Phase 4: Wire Into Orchestrator

Read `references/wiring-procedure.md` for the full edit list.

This involves coordinated edits across multiple files. The wiring procedure covers:

1. Orchestrator frontmatter, subagent table, routing rules, iteration tracking, error handling, ownership constraints
2. Workflow skill phase table(s) — both standard and revision if present
3. Workflow reference files — analyze phase (dispatch planner after analyst), implement-loop (per-task iteration + verification pass)
4. Sibling agents — coder input (read planner task files), reviewer scope (per-task boundaries), scribe artifacts (planner output)

All planner-related sections must be wrapped in Liquid conditionals based on the toggle parameter chosen in Phase 2 (e.g., `{%- unless triggerParams.skip_planner %}`).

### Phase 5: Validate

After all edits, verify consistency:

- [ ] Planner name in orchestrator frontmatter matches `.agent.md` filename
- [ ] Every planner result code (`planned`, `verified`, `gaps_found`, `blocked`) has a routing row
- [ ] Routing table handles both toggle-on and toggle-off paths
- [ ] Iteration tracking describes all three levels (planner pass, task progression, per-task loop)
- [ ] Max rounds per task matches the user's Phase 2 answer
- [ ] Max planner passes = 2 (unless user explicitly changed this)
- [ ] Coder reads planner task files when planner is active
- [ ] Reviewer is aware of per-task scope when planner is active
- [ ] Scribe lists planner artifacts
- [ ] Workflow phase tables updated in both standard and revision variants
- [ ] Implement-loop reference includes verification-pass dispatch after all tasks
- [ ] Analyze reference dispatches planner after analyst (when toggle is on)
- [ ] All Liquid conditionals use the correct toggle parameter name
- [ ] Toggle-off path preserves original behavior exactly (no regressions)
