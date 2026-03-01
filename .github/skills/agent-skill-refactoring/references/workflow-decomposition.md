# Workflow Decomposition

How to break a monolithic agent prompt into per-phase skills with a scratchpad contract.

## Why decompose

A 500-line monolithic prompt overwhelms context — the agent forgets instructions from the top by the time it reaches the bottom. Per-phase skills mean the agent only loads instructions relevant to its current phase. A scratchpad file (`state.md`) tracks progress across phases and session continuations.

## The pattern

1. The workflow partial (loaded into the agent's prompt) contains only a compact phase table mapping phase names → skill names
2. Each phase skill has three sections: "Before you begin" (read state.md, verify phase), instructions, and "Before moving to Phase N" (update state.md with next phase + skills)
3. Domain skills are referenced inline within phase skills at specific decision points
4. The agent follows a ritual: read state.md → read the phase skill → do the work → update state.md → move to next phase

## Step 1: Identify natural phases

Read the current agent instructions end-to-end. Look for sequential stages — moments where the agent shifts from one mode of work to another:

- **Setup** (branch, environment, scratchpad initialization)
- **Research** (gathering context, reading source, using sub-agents)
- **Implementation** (writing, coding, making changes)
- **Validation** (review, testing, build checks)
- **Delivery** (commit, PR, handoff, reporting)

These are your phase boundaries. Each phase becomes its own skill file. Some workflows combine phases (e.g., "review + revision loop" in one skill) — that's fine if the phases are tightly coupled.

## Step 2: Design the scratchpad contract

The agent needs a persistent scratchpad file (`state.md`) that tracks:

```markdown
# Task State: <task-id> — <task-title>

## Current Phase
Phase 1: Setup

### Skills for this phase
- workflow-setup

## Completed Phases
(phase name + key outcomes)

## Key Decisions
(each decision and its rationale)

## Tracked Artifacts
(branch names, identifiers, PR URLs — add as you go)

## Notes
(anything else)
```

The "Skills for this phase" section is the **skill manifest** — the definitive list of what the agent should read before starting work. Phase skills update this list in their transition sections, making it the mechanism for wiring domain skills into the workflow.

## Step 3: Write the phase skills

Each phase skill follows this template:

```markdown
---
name: workflow-<phase-name>
description: "<workflow> Phase N. Read this skill when <trigger condition>.
Covers <what it does>. <When to read it.>"
---

# Phase N: <Name>

## Before you begin
1. Read `state.md`
2. Verify current phase — this skill is for Phase N
3. Review completed phases for context from earlier work

## Instructions
<concrete steps for this phase>
<inline references to domain skills at decision points>

## Before moving to Phase N+1
Update `state.md`:
- Set "Current Phase" to Phase N+1
- Set "Skills for this phase" to:
  - workflow-<next-phase>
  - <domain-skill-1>
  - <domain-skill-2> (if <condition>)
- Add Phase N to "Completed Phases" with key outcomes
```

**Key design points:**
- The transition section lists both the next phase skill AND the domain skills needed for it
- Conditional domain skills use parenthetical qualifiers: `(if creating new pages)`, `(if build is broken)`
- Unconditional skills go first in the list

## Step 4: Replace the monolithic prompt

The original agent instruction file gets replaced with a compact workflow table:

```markdown
| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | workflow-setup | Branch, scratchpad, context search |
| 2. Research | workflow-research | Gather context, delegate to sub-agents |
| 3. Write | workflow-write | Implement changes |
| 4. Review | workflow-review | Quality check, revision loop |
| 5. Commit | workflow-commit | Pre-commit checks, push |
| 6. Handoff | workflow-handoff | Write report, exit block |

Before each phase: read state.md → read the phase skill → follow instructions → update state.md.
```

This table is the only thing in the agent's main prompt. Everything else lives in skills loaded on demand.

## Workflow variants

If the agent handles different task types (e.g., new work vs. revisions), create separate workflow tables and separate phase skills. Variants can share domain skills but should have their own phase skills — revision workflows skip research but add feedback analysis steps.

## Further reading

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic's guide on orchestration patterns, delegation, and tool use. The "workflow" and "agent" pattern categories directly inform how phase skills relate to sub-agent delegation.
- [Prompt engineering: be direct](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-direct) — Why concise, imperative instructions in skill bodies outperform verbose explanations.
- [Claude Code best practices](https://docs.anthropic.com/en/docs/claude-code/best-practices) — Memory files, CLAUDE.md patterns, and how project context affects agent behavior. The scratchpad pattern extends these ideas.
- [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — How instruction files, skills, and agent modes layer together in VS Code.
- [OpenAI agent patterns](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) — Multi-agent orchestration, guardrails, and handoff patterns applicable to phase decomposition.
