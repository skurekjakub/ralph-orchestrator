---
name: skill-consolidator
description: "Consolidate multiple individual phase skills into a single router skill with reference files. Use this skill whenever someone wants to merge several related skills into one, reduce the number of skills in a profile, create a router skill from individual phase skills, or restructure a flat list of workflow skills into a hierarchical router+references pattern. Also triggers on: 'too many skills loaded', 'combine these skills', 'merge workflow skills into one', 'consolidate skills', 'reduce skill count', 'create a router skill', 'single entry point for the workflow', or any request to restructure multiple per-phase skills into a unified skill with conditional routing."
---

# Skill Consolidator

Transforms N individual per-phase skills into **one router skill** with a `SKILL.md` that dispatches to `references/<phase>-<name>.md` files. The router uses Liquid conditionals to show the correct routing table based on workflow context (e.g. standard vs. revision), and each reference file guards its content with Liquid so it renders as empty for the wrong workflow.

This matters because agent context is finite. Loading 11 individual `SKILL.md` files wastes context on metadata, frontmatter, and boilerplate that repeats across phases. A single router skill loads one `SKILL.md` with a routing table, and the agent reads only the reference file for its current phase — dramatically reducing context usage.

## When to Use

- A profile's `skills` array lists many individual phase skills (e.g. `workflow-setup`, `workflow-research`, `workflow-write`, ...) that all belong to one logical workflow
- The agent is hitting context limits from too many loaded skills
- You want a single entry point that routes to per-phase instructions

## Prerequisites

Before starting, gather this information:

1. **Which skills to consolidate** — list all individual skill names from `profile.json`
2. **The workflow(s) they belong to** — standard, revision, or both? Other named workflows?
3. **The phase ordering** — which phases belong to which workflow, and in what order?
4. **Conditional routing** — are there Liquid conditions that determine workflow type? (e.g. `isRevision`, `triggerParams`)
5. **Cross-references** — which agent-include files reference individual skill names? Which tests?

## Consolidation Procedure

### Phase 1: Audit

Read every individual skill's `SKILL.md` to understand:
- The Liquid guard pattern (if any) — what condition wraps the content?
- The phase number and name
- Whether the skill is shared across workflows or specific to one
- Any inner conditionals (e.g. `{% if triggerParams.skip_review %}`)

Map each skill to its workflow and phase number:

```
Standard workflow:        Revision workflow:
1. setup                  r1. setup (phases 1-2)
2. research               r3. fix
3. write                  r5. commit
4. review (shared)        r6. handoff
6. commit
7. pr
8. handoff
```

### Phase 2: Create the Router Skill Directory

```
shared/skills/<parent>/<group>/<router-name>/
├── SKILL.md
└── references/
    ├── 1-setup.md
    ├── 2-research.md
    ├── ...
    ├── r1-setup.md
    ├── r3-fix.md
    └── ...
```

**Naming conventions for reference files:**
- Standard phases: `<number>-<name>.md` (e.g. `1-setup.md`, `7-pr.md`)
- Revision phases: `r<number>-<name>.md` (e.g. `r1-setup.md`, `r5-commit.md`)
- Shared phases (no guard): `<number>-<name>.md` (e.g. `4-review.md`)
- The number prefix makes phase ordering immediately visible in directory listings

### Phase 3: Write the Router SKILL.md

The router has three parts:

**1. Frontmatter** — name, and a description that's explicit about being the single entry point for the workflow:

```yaml
---
name: <router-name>
description: "Router for the <workflow-name> — both standard and revision. Read this skill at the start of every task and at every phase transition. ..."
---
```

**2. Conditional routing tables** — use Liquid to show only the relevant table:

```liquid
{%- if isRevision %}
## Revision Workflow
| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1–2. Setup | `references/r1-setup.md` | ... |
| 3. Fix | `references/r3-fix.md` | ... |
...
{%- else %}
## Standard Workflow
| Phase | Reference file | Summary |
|-------|---------------|---------|
| 1. Setup | `references/1-setup.md` | ... |
| 2. Research | `references/2-research.md` | ... |
...
{%- endif %}
```

**3. Usage instructions** — tell the agent to read `state.md`, then read the reference file for its current phase, then come back for the next phase.

### Phase 4: Move Content into Reference Files

For each individual skill, extract its `SKILL.md` body (everything below the frontmatter) into the corresponding reference file.

**Liquid guard pattern** — wrap each reference file's content in a guard so it renders empty for the wrong workflow:

For standard-only files:
```liquid
{%- unless isRevision %}
<actual phase instructions here>
{%- else %}
<!-- This file is for the standard workflow. You are running a revision workflow — this file is intentionally empty. -->
{%- endunless %}
```

For revision-only files:
```liquid
{%- if isRevision %}
<actual phase instructions here>
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
```

For shared files (used by both workflows): **no guard** — the content renders unconditionally.

The else block with the HTML comment is important: it tells the agent why the file is empty rather than leaving it confused about whether the file failed to render.

Preserve any inner conditionals from the original skill (e.g. `{% if triggerParams.skip_review %}` or `{% section "name" %}`).

### Phase 5: Update profile.json

Replace the N individual skill entries in the `skills` array with the single router skill name:

```json
// Before:
"skills": ["workflow-setup", "workflow-research", "workflow-write", ...]

// After:
"skills": ["<router-name>"]
```

Do this for every variant that referenced the individual skills.

### Phase 6: Update Agent-Include Workflow Files

Agent-include files at `shared/agent-includes/<profile>/` may contain routing tables that referenced individual skill names. Update them to point to the router skill's reference files instead:

```markdown
<!-- Before: -->
| 1. Setup | Read the `workflow-setup` skill |

<!-- After: -->
| 1. Setup | Read `references/1-setup.md` from the `<router-name>` skill |
```

### Phase 7: Update Tests

Search for test files that reference the old individual skill names:
- `grep -r "workflow-setup\|workflow-research\|workflow-write" tests/`
- Update skill arrays in test fixtures to use the single router name
- Update assertions that check rendered output — the else-block guard means "blank" files now contain the HTML comment, not empty string. Assert on meaningful content absence (e.g. `not.toContain("# Phase 1")`) rather than strict emptiness.

### Phase 8: Update Documentation

Search for references to individual skill names in docs:
- `docs/user-guide/skills.md` or similar
- `ARCHITECTURE.md`, `README.md`
- Any skill-related configuration docs

### Phase 9: Clean Up

Delete the original individual skill directories. They're fully replaced by the router's reference files.

### Phase 10: Verify

Run the full test suite (`npm test`) to confirm nothing broke. Key things to check:
- Router `SKILL.md` renders without Liquid errors in both standard and revision contexts
- Reference files render content for only the correct workflow
- Profile setup discovers and mounts the consolidated skill correctly

## Checklist

Use this as a tracking checklist during consolidation:

- [ ] Audit all individual skills — map to workflow + phase number
- [ ] Create router skill directory with `references/` subdirectory
- [ ] Write router `SKILL.md` with conditional routing tables
- [ ] Move each skill's content into its reference file with Liquid guards + else blocks
- [ ] Update `profile.json` — replace N skill entries with 1 router name
- [ ] Update agent-include workflow tables
- [ ] Update tests (skill arrays + assertions)
- [ ] Update documentation
- [ ] Delete original individual skill directories
- [ ] Run `npm test` — all tests pass
