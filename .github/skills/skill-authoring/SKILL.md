---
name: skill-authoring
description: "How to create, improve, and validate Copilot CLI skills for the Ralph Orchestrator project. Use this skill whenever creating a new skill in shared/skills/, updating an existing skill's content or description, reviewing skill quality, or when someone asks about skill structure, frontmatter, triggering, or progressive disclosure."
---

# Skill Authoring

How to create and improve Copilot CLI skills for the Ralph agent profiles. Skills live in `shared/skills/` and are mounted read-only into agent containers at `/workspace/.github/skills/<name>/`.

## Skill Directory Structure

```
shared/skills/
  <skill-name>/
    SKILL.md              (required — main instructions)
    references/           (optional — large reference docs, loaded on demand)
    scripts/              (optional — executable code for deterministic tasks)
    assets/               (optional — templates, icons, other output files)
```

## SKILL.md Anatomy

Every SKILL.md has two parts: **YAML frontmatter** and **Markdown body**.

### Frontmatter (required)

```yaml
---
name: my-skill-name
description: "What the skill does and when to use it."
---
```

- `name`: Skill identifier (matches directory name).
- `description`: The **primary triggering mechanism**. Claude reads this to decide whether to load the skill body. Include both what the skill does AND specific contexts that should activate it.

### Writing Good Descriptions

Claude tends to undertrigger skills — it won't consult them unless the description clearly matches the task. Write descriptions that are slightly "pushy":

**Weak:** "Reference for Liquid tags in the documentation site."
**Strong:** "Complete reference for all Liquid tags, formatting, and components available in the Xperience by Kentico Jekyll documentation site. Use this skill whenever writing or editing documentation pages, inserting Liquid tags, adding assets, creating anchors, or using any documentation-specific component. Consult this instead of guessing tag syntax."

The strong version names specific actions and tells Claude when to reach for it. Aim for 2-3 sentences: what it does, then a "Use this skill whenever..." sentence listing trigger contexts.

### Body Content

The Markdown body is loaded into context when the skill triggers. Keep it under **500 lines** — if approaching this limit, move detailed content into `references/` files with clear pointers about when to read them.

**Progressive disclosure levels:**
1. **Metadata** (name + description) — always in context (~100 words)
2. **SKILL.md body** — loaded when skill triggers (target <500 lines)
3. **Bundled resources** — read on demand (unlimited size)

## Writing Style

- **Imperative form**: "Search the archives" not "You should search the archives"
- **Explain why, not just what**: Instead of rigid rules, explain the reasoning so the model can apply judgment. "Use explicit types instead of `var` — readers need to see the types at a glance" is better than "ALWAYS use explicit types"
- **Avoid heavy-handed directives**: If you find yourself writing ALWAYS or NEVER in all caps, reframe with reasoning. The model is smart — explaining *why* something matters is more effective than shouting
- **Include examples**: Show input/output pairs, code snippets, or templates. Concrete examples communicate intent better than abstract rules
- **Keep it lean**: Remove instructions that aren't pulling their weight. Every line should earn its place

## Project-Specific Conventions

### Naming

All skills are prefixed with `ralph-` to avoid collisions when mounted into target repositories (e.g., `ralph-code-samples`, `ralph-documentation-syntax`, `ralph-screenshots`).

### Enabling Skills in a Profile

Add the skill name to the `skills` array in the profile's `profile.json`:

```json
{
  "skills": [
    "ralph-code-samples",
    "documentation-syntax",
    "style-guide-review"
  ]
}
```

The orchestrator's `generateSkillVolumeMounts()` in `src/container/setup/artifact-mounts.ts` generates read-only volume mounts from `shared/skills/<name>/` to `/workspace/.github/skills/<name>/` inside the container.

### Validation

Skills declared in `profile.json` are validated at startup — missing skill directories cause a validation error. Run `npm test` to verify skills and profile config are consistent.

## Domain Organization

When a skill covers multiple variants or frameworks, organize by domain:

```
cloud-deploy/
  SKILL.md          (workflow + variant selection logic)
  references/
    aws.md
    gcp.md
    azure.md
```

Claude reads only the relevant reference file based on context.

## Checklist for New Skills

1. Create `shared/skills/<name>/SKILL.md` with YAML frontmatter
2. Write a pushy `description` that names specific trigger contexts
3. Keep body under 500 lines — move large references to `references/`
4. Use imperative form and explain reasoning behind rules
5. Include concrete examples (code snippets, templates, input/output pairs)
6. Add the skill name to the target profile's `skills` array in `profile.json`
7. Run `npm test` to validate
