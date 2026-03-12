---
name: agent-skill-wiring
description: "Create and wire skills into Ralph agent-as-function profiles — write a new skill from provided data or take an existing one, place it under shared/skills/, add it to profile.json, and reference it in the correct subagent templates at specific workflow steps. Use this skill whenever someone wants to add a skill to a profile, create a skill and wire it, mount a skill into containers, make an agent aware of a skill, reference a skill in a subagent prompt, connect a skill to a workflow phase, write a skill from examples or data. Also triggers on: 'wire this skill', 'add skill to profile', 'create a skill for', 'write a skill based on this data', 'the agent doesn't see this skill', 'mount skill', 'register skill', or any request to make a skill available and referenced in an agent family's prompts."
---

# Agent Skill Wiring

Create skills and wire them into Ralph agent-as-function profiles so that agent containers can read the skill and the correct subagents are instructed to use it.

This skill handles two scenarios:
- **Wire an existing skill** — the skill already exists under `shared/skills/`, just needs profile registration and agent template references
- **Create then wire** — write a new skill from provided data (examples, specs, guidelines), place it under `shared/skills/<category>/`, then wire it

Wiring involves up to three layers — not every skill needs all three:

1. **Profile registration** — add the skill name to `profile.json` → variant → `stages[].skills[]` so it gets Docker-mounted into the container as `.github/skills/<name>/`
2. **Subagent template references** — update the relevant `.agent.md` files so the subagent knows to read the skill at the right moment
3. **Workflow reference files** (optional) — update phase reference `.md` files if the skill should be called out at a specific workflow step

The orchestrator itself stays pure — it only ever needs the workflow router skill. Domain and task skills belong in subagent prompts.

## Prerequisites

- The target profile exists under `profiles/<id>/`
- You know which profile variant(s) should have access to the skill
- If the skill already exists, it's under `shared/skills/<category>/<name>/SKILL.md`

## References

| File | Purpose |
|---|---|
| `references/wiring-procedure.md` | Step-by-step procedure for all edits (profile.json, agent templates, workflow files) |
| `references/integration-patterns.md` | Five patterns for how skills get referenced in subagent templates, with examples |

## Skill Directory Layout

Skills live under `shared/skills/<category>/<name>/SKILL.md`. The category subdirectory is organizational — the orchestrator finds skills by name recursively.

| Category | What belongs here |
|---|---|
| `domain/` | Product knowledge, coding patterns, testing strategy, review rules |
| `integrations/` | External service interaction (ADO, Ralphchives, code graph, screenshots) |
| `tasks/` | Task-specific guidance (code samples, release notes, training modules) |
| `workflow/<profile-short>/` | Workflow phase skills and router skills for a specific profile |
| `xperience/` | Xperience by Kentico product domain (router with references) |
| `xperience-documentation/` | Xperience documentation patterns (router with references) |

When creating a new skill, ask the user which category fits. If none match, propose a new category name.

## Process

### Step 0: Create the Skill (if it doesn't exist yet)

If the user is providing data, examples, or specifications and asking you to turn it into a skill:

1. **Gather the input** — read whatever the user provides (examples, specs, guidelines, raw data)
2. **Use `skill-creator` patterns** to author the SKILL.md:
   - YAML frontmatter with `name:` and `description:` (description should be "pushy" — list trigger phrases)
   - Body under 500 lines, imperative form, explain the "why"
   - Optional `references/` subdirectory for detailed docs, examples, schemas
   - If the skill needs Liquid template variables, note which ones and confirm they're available in the target stage context
3. **Ask the user which category** to place it under (`domain/`, `integrations/`, `tasks/`, etc.)
4. **Create** `shared/skills/<category>/<name>/SKILL.md` (and `references/` if needed)

Then continue to Step 1 below to wire it.

### Step 1: Discovery

Before making any edits, gather context:

1. **Read the skill** — `shared/skills/<category>/<name>/SKILL.md` — understand what it provides
2. **Identify the target profile** — which profile directory under `profiles/`
3. **Read `profile.json`** — identify all variants and their `stages[].skills[]` arrays
4. **List the subagent templates** — `profiles/<profile>/agents/*.agent.md`
5. **Scan for existing skill references** — grep the agent templates for `## Skills` tables, skill name references, and workflow step mentions

Record: skill name, skill category, target profile, relevant variants, current skills arrays, all subagent filenames.

### Step 2: Design Questions (interactive)

Use `ask_questions` to confirm the wiring decisions with the user. Batch all questions into a single call. The answers determine which files get edited and how deeply the skill is integrated.

**Required questions:**

1. **Skill status** — does the skill already exist, or should it be created from the provided data? If creating, what input data is available? (Skip if already answered by context.)

2. **Category placement** (if creating) — which `shared/skills/<category>/` directory should the skill go in? List the existing categories and let the user pick or propose a new one.

3. **Which profile?** — confirm the target profile (e.g., `profiles/ralph-docs/`, `profiles/ralph-vscode/`)

4. **Which variants?** — should the skill be available to all variants or only specific ones? List the variant names from `profile.json` and let the user pick. (Default: all variants that have the relevant subagent)

5. **Which subagent(s)?** — which subagent templates should reference this skill? List the profile's subagents and ask the user to select. Common mappings:
   - Research/domain knowledge skills → researcher/analyst
   - Code pattern/testing skills → coder + reviewer
   - Integration/tooling skills → whichever subagent uses the tool
   - Archival/reporting skills → scribe
   - Task planning skills → orchestrator's planner (if present)

6. **How should the skill be referenced?** — for each selected subagent, confirm the integration depth (see `references/integration-patterns.md` for the five patterns):
   - **Skills table row** — add a row to the agent's `## Skills` or `| Skill | ... |` table (most common)
   - **Inline instruction** — add a sentence like "Read the **skill-name** skill before..." at a specific workflow step
   - **Conditional** — wrap in a Liquid `triggerParams` conditional (e.g., only when `codesamples` param is set)
   - **Workflow reference file** — update a phase reference `.md` file to mention the skill

7. **Conditional gating?** — should the skill only load when a specific trigger parameter is present? (e.g., `{%- if triggerParams.codesamples %}`)

### Step 3: Wire

Read `references/wiring-procedure.md` and execute the edits.

### Step 4: Validate

After all edits:

- [ ] Skill name appears in `profile.json` `stages[].skills[]` for all selected variants
- [ ] Skill name spelling matches the `name:` field in the skill's YAML frontmatter
- [ ] Each selected subagent template references the skill (table row, inline, or both)
- [ ] Conditional gating (if used) uses the correct `triggerParams` key
- [ ] No other subagent had its existing skill references accidentally modified
- [ ] The orchestrator prompt was NOT modified (it stays pure)
