# Wiring Procedure

Step-by-step edits to wire a skill into a profile. Perform in order.

---

## Step 1: Confirm the skill exists

Verify `shared/skills/<category>/<name>/SKILL.md` exists and has valid YAML frontmatter with a `name:` field. The `name` value is what goes into `profile.json` — it must match exactly.

```bash
# Quick check
cat shared/skills/<category>/<name>/SKILL.md | head -5
```

If the skill doesn't exist yet, create it first using `skill-creator` patterns, then return here.

## Step 2: Add to `profile.json` stages[].skills[]

Open `profiles/<profile>/profile.json`. For each variant that should have the skill, add the skill name to the relevant stage's `skills` array.

**Which stage?** Skills belong to the stage whose agent uses them:
- If the profile has a single stage, add to that stage's `skills` array
- If the profile has multiple stages (pipeline), add to the stage containing the subagent that will read the skill

**Which variants?** Based on the user's answer from the design questions:
- All variants → add to every variant's relevant `stages[].skills[]`
- Specific variants → add only to those

```jsonc
{
  "variants": [
    {
      "displayName": "ralph",
      "stages": [
        {
          "agent": "ralph.ralph",
          "skills": [
            "existing-skill-1",
            "existing-skill-2",
            "new-skill-name"        // ← add here
          ]
        }
      ]
    }
  ]
}
```

**Validation**: The orchestrator validates skill names at startup. If the name doesn't match `shared/skills/<category>/<name>/SKILL.md`, startup will fail with a clear error.

## Step 3: Reference in subagent templates

For each subagent that should use the skill, edit its `.agent.md` file in `profiles/<profile>/agents/`.

Choose the integration pattern based on the user's design answers (see `references/integration-patterns.md` for detailed examples):

### Pattern A: Skills table row (most common)

Find the `## Skills` section (or `| Skill |` table). Add a row:

```markdown
| **new-skill-name** | What it provides — one sentence |
```

If the table uses tiered sections (always-load vs load-when-relevant), place the new skill in the appropriate tier.

### Pattern B: Inline bold reference

Add an instruction that cites the skill by name in bold at the relevant workflow step:

```markdown
3. Read the **new-skill-name** skill before processing the output.
```

### Pattern C: Conditional (Liquid gated)

Wrap the reference in a `triggerParams` conditional:

```markdown
{%- if triggerParams.feature_flag %}
| **new-skill-name** | Loaded when `feature_flag` is set |
{%- endif %}
```

### Pattern D: Authoritative reference

For reviewer skills that define the source of truth:

```markdown
## Reference Skills (MUST read before reviewing)

| Skill | Purpose |
|---|---|
| **new-skill-name** | Defines the rules for X |
```

## Step 4: Update workflow references (if applicable)

If the skill should be called out at a specific workflow phase, update the relevant workflow reference file(s) under `shared/skills/workflow/<profile-short>/<workflow-name>/references/`.

Common patterns:
- Add a note like "Read **new-skill-name** before starting this phase" in the relevant phase reference
- Add the skill to a phase's "Skills to load" list if the reference has one

This step is **optional** — not every skill needs workflow-level callout. Skip if the subagent template reference is sufficient.

## Step 5: Validate

Run through this checklist:

- [ ] `shared/skills/<category>/<name>/SKILL.md` exists with valid `name:` frontmatter
- [ ] Skill name in `profile.json` matches `name:` in frontmatter exactly
- [ ] Skill appears in the correct variant(s) and stage(s) in `profile.json`
- [ ] Each selected subagent template references the skill
- [ ] Conditional gating (if used) uses the correct `triggerParams` key
- [ ] No existing skill references were accidentally modified
- [ ] Orchestrator prompt was NOT modified (it stays pure — only workflow router skills)
- [ ] If the skill has Liquid syntax (dynamic content), confirm the template context variables it uses are available to the target stage

### Startup validation

The orchestrator validates skills at startup. Run a quick check:

```bash
npm run validate
```

This catches:
- Missing skill directories (name in `profile.json` not found in `shared/skills/`)
- Missing `SKILL.md` files
