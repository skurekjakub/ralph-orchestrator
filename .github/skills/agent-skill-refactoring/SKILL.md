---
name: agent-skill-refactoring
description: "Systematic workflow for decomposing monolithic agent prompts into per-phase skills, discovering domain knowledge gaps, creating focused skills, and integrating them into the agent's workflow. Use this skill when an agent has a bloated instruction file that needs breaking into phases, when you need to analyze a target domain for skill gaps, when auditing skills for overlap or redundancy, or when wiring new domain skills into existing workflow phases. Trigger whenever the user mentions improving agent skills, decomposing agent workflows, adding domain knowledge, or refactoring agent instructions."
---

# Agent Skill Refactoring

Decompose monolithic agent prompts into phased workflows, discover domain knowledge gaps, create focused skills, and wire them into the right workflow phases.

## Core Idea: Phases as Skills

The most impactful refactoring is turning a monolithic agent prompt into **per-phase skills loaded just-in-time**. Instead of one giant instruction file, each workflow phase becomes its own skill — the agent reads only what it needs for the current phase. A scratchpad file (`state.md`) tracks which phase the agent is in and lists skills to read next, surviving across session continuations.

The workflow partial in the agent's prompt shrinks to a compact table:

| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | workflow-setup | Branch, scratchpad, context search |
| 2. Research | workflow-research | Gather context, sub-agents |
| 3. Write | workflow-write | Implement changes |
| ... | ... | ... |

Each phase skill ends with a transition section that updates state.md with the next phase and its skill manifest — including domain-specific skills the agent should consult.

## Process

| Phase | What to do | Reference |
|-------|-----------|-----------|
| **0. Decompose** | Break monolithic prompt into phase skills + scratchpad contract | [references/workflow-decomposition.md](references/workflow-decomposition.md) |
| **1. Explore** | Analyze the target domain (repo, API, system) for conventions and failure modes | [references/skill-discovery.md](references/skill-discovery.md) |
| **2. Audit** | Read all existing skills, build gap analysis | [references/skill-discovery.md](references/skill-discovery.md) |
| **3. Propose** | Enumerate candidate skills with overlap risks, let user select | [references/skill-discovery.md](references/skill-discovery.md) |
| **4. Create** | Write skill files with pushy descriptions and concrete examples | [references/skill-discovery.md](references/skill-discovery.md) |
| **5. Integrate** | Wire skills into workflow phase transition lists + inline references | [references/skill-integration.md](references/skill-integration.md) |
| **6. Deduplicate** | Compare new vs existing skills, merge overlaps, clean up references | [references/skill-integration.md](references/skill-integration.md) |

Read the reference file for the phase you're working on — each contains detailed steps, templates, and examples.

## Quick Reference

**Phase skill template** — every phase skill has this structure:
```
# Phase N: <Name>
## Before you begin → read state.md, verify phase
## Instructions → steps + inline domain skill references
## Before moving to Phase N+1 → update state.md with next skills
```

**Skill integration** — two levels:
1. **Transition lists**: Phase N's "Before moving to Phase N+1" sets the skill manifest for the next phase
2. **Inline references**: Mention domain skills at the exact decision point in the phase instructions

**Overlap resolution** — after creating new skills:
- Heavy overlap → merge unique content into existing skill, delete new one
- Moderate → merge unique parts into the natural home
- Minimal → keep both, add cross-reference

**Description writing** — the `description` field is the primary trigger mechanism. Make it "pushy" — include both WHAT the skill does AND specific contexts for WHEN to use it. Undertriggering is more common than overtriggering.

## Further Reading

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic's orchestration patterns and delegation strategies
- [Claude Code best practices](https://docs.anthropic.com/en/docs/claude-code/best-practices) — Memory files and project context patterns
- [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot) — Instruction files, skills, and agent modes
- [Prompt engineering: be direct](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/be-direct) — Writing clear, imperative instructions
- [OpenAI agent patterns](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) — Multi-agent orchestration and guardrails
