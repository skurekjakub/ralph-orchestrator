---
name: agent-workflow-phase-editor
description: "Edit multi-phase agent workflows in the Ralph Orchestrator — insert, remove, reorder, or modify workflow phases while keeping all cross-references, phase numbers, and profile configs consistent. Use this skill whenever someone wants to add a new phase to an agent workflow, remove a phase, reorder phases, renumber phases, restructure a workflow pipeline, add a skill to a workflow, or modify the phase sequence for any ralph profile. Also triggers on 'add a step to the workflow', 'insert between phase X and Y', 'move phase X after Y', 'the coder should also do X', or any request that changes the ordered phase list in a workflow table."
---

# Workflow Phase Editor

Agent workflows in the Ralph Orchestrator are **phase-based pipelines** where each phase has a corresponding skill file, a row in a workflow table, and cross-references to adjacent phases. Changing the phase sequence requires coordinated edits across multiple files — missing one creates inconsistencies that confuse the agent at runtime.

This skill walks you through the full procedure for any phase modification: insert, remove, reorder, or edit.

## Anatomy of a Workflow

Every profile can have multiple workflow variants (e.g. standard + revision, or per-agent-variant like ralph vs malph). Each workflow consists of three layers:

### 1. Workflow Table (the index)

Lives in `shared/agent-includes/<profile>/<workflow-name>.md`. This is a Markdown table the orchestrator agent reads to know which skill to consult for each phase:

```markdown
| Phase | Skill | Summary |
|-------|-------|---------|
| 1. Setup | workflow-setup | Branch verify, state.md init |
| 2. Analyze | workflow-analyze | Dispatch analyst |
| 3. Implement | workflow-implement | Code changes |
| 4. Commit | workflow-commit | Stage, commit, push |
```

### 2. Skill Files (the instructions)

Each phase has a skill at `shared/skills/workflow/<profile-short>/<skill-name>/SKILL.md`. Each skill contains phase number references in up to **5 locations**:

```
① YAML frontmatter `description` — "Phase N. Read this skill when..."
② H1 heading — "# Phase N: Name"
③ "Before you begin" → "this skill is for Phase N"
④ "Before you begin" → "confirm Phase N-1 (...) is complete"
⑤ "Before moving to Phase N+1" section — sets next phase name + skill
```

### 3. Profile Config

`profiles/<profile>/profile.json` → variant → `stages[].skills[]` array. Lists all skill names the agent has access to. New skills must be added here or the agent can't read them.

## Procedures

### Insert a New Phase

This is the most common operation. You're adding a phase between two existing ones.

**Step 1: Identify all affected files.**

Determine which workflow(s) the new phase belongs to. A profile may have multiple workflow variants — check if the new phase applies to all of them or just some.

```
shared/agent-includes/<profile>/           → workflow table(s)
shared/skills/workflow/<profile-short>/    → skill files
profiles/<profile>/profile.json            → skills list
```

Run this to see the full picture:
```bash
# List all workflow tables for a profile
ls shared/agent-includes/<profile>/

# List all skills for a profile
ls shared/skills/workflow/<profile-short>/

# See all phase references across skills
grep -rn "Phase [0-9]" shared/skills/workflow/<profile-short>/ | head -40
```

**Step 2: Create the new skill file.**

Create `shared/skills/workflow/<profile-short>/<skill-name>/SKILL.md` following the standard template:

```markdown
---
name: <skill-name>
description: "<Profile> workflow Phase N. <When to read this skill>. <What it covers>."
---

# Phase N: <Name>

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Phase N.
3. **Review completed phases** — confirm Phase N-1 (<previous phase name>) is complete.

## Instructions

<the actual work>

## Before moving to Phase N+1

Update `state.md`:
- Set "Current Phase" to `Phase N+1: <next phase name>`
- Set "Skills for this phase" to:
  - <next-skill-name>
- Keep the reminder line: `> ⚠️ STOP — Read every skill listed above BEFORE doing any work in this phase.`
- Add Phase N to "Completed Phases" with <relevant artifact>
```

If the skill is only used by subagents (not the orchestrator), add `-subagent-` to the name (e.g. `vscode-workflow-subagent-test`). Subagent skills are read by delegated agents, not by the orchestrator following the workflow table.

**Step 3: Insert the row in the workflow table(s).**

Edit each affected workflow table in `shared/agent-includes/<profile>/`. Insert the new row at the correct position.

**Step 4: Renumber all downstream skills.**

This is the tedious but critical part. Every skill file _after_ the insertion point needs its phase number incremented in all 5 locations (see "Anatomy" above). Also update the predecessor skill's "Before moving to" section to point to the new phase instead of the old next phase.

Concretely, for an insertion at position N:
- **Skill at N-1** (predecessor): Update "Before moving to" → now points to Phase N (the new phase)
- **New skill at N**: Points to Phase N+1 in its "Before moving to" section
- **All skills at N+1, N+2, ...**: Increment every phase reference by 1

Do this for **both standard and revision workflows** if the phase applies to both. Revision workflows use "Revision Phase N" prefixes — maintain that prefix when renumbering.

**Step 5: Update profile.json.**

Add the new skill name to the `stages[].skills[]` array in the correct position within `profiles/<profile>/profile.json`.

**Step 6: Verify.**

```bash
npx vitest run tests/container/template-integration.test.ts
```

This renders all declared skills through the Liquid template engine and catches missing skills, broken references, and syntax errors.

### Remove a Phase

Reverse of insertion:
1. Remove the row from workflow table(s)
2. Delete the skill directory
3. Decrement phase numbers in all downstream skills
4. Update the predecessor's "Before moving to" to skip over the removed phase
5. Remove from `profile.json` skills list
6. Run template integration tests

### Reorder Phases

Effectively a remove + insert:
1. Note the current phase numbers of the phase being moved and all phases between source and destination
2. Update the workflow table row order
3. Renumber all affected skills (both the moved phase and everything in between)
4. Update all "Before moving to" cross-references in the chain
5. Run template integration tests

### Add a Subagent Skill (no phase change)

When adding a skill that a subagent reads (not a new orchestrator phase):
1. Create the skill file with `-subagent-` in the name
2. Add to `profile.json` skills list
3. Reference from the subagent's agent template (e.g. "read the `<skill>` skill")
4. No workflow table or phase renumbering needed
5. Run template integration tests

## Checklist

Before considering the edit complete:

- [ ] Workflow table(s) updated with correct phase numbers and skill names
- [ ] New skill file follows the standard template (frontmatter, H1, Before you begin, Instructions, Before moving to)
- [ ] All downstream skills have correct phase numbers in all 5 locations
- [ ] Predecessor skill's "Before moving to" points to the correct next phase
- [ ] New skill's "Before moving to" points to the correct next phase
- [ ] `profile.json` skills list includes the new skill (if applicable)
- [ ] Revision workflow updated (if the phase applies to revisions too)
- [ ] `npx vitest run tests/container/template-integration.test.ts` passes
- [ ] Full test suite passes: `npx vitest run`

## Common Mistakes

- **Forgetting the revision workflow.** Standard and revision workflows are separate files with separate phase numbering. If a phase applies to both, update both.
- **Missing the frontmatter description.** Phase numbers appear in the YAML `description` field — this is easy to overlook since it's metadata, not body content.
- **Off-by-one in predecessor.** The skill _before_ the insertion point needs its "Before moving to" section updated to point to the new phase, not the old next phase.
- **Stale "confirm Phase N-1 is complete" reference.** When renumbering, don't just increment the number — also update the parenthesized name (e.g. "confirm Phase 4 (Commit & Push)" → "confirm Phase 5 (Package)").
