# Skill Discovery & Creation

How to explore the agent's target domain, audit existing skills for gaps, propose candidates, and write effective skill files.

## Phase 1: Explore the Target Domain

Understand the environment where the agent operates — the repo, system, or API it makes changes to.

**What to look for:**
- Build systems, validation tools, CI pipelines (what catches mistakes?)
- Custom syntax, DSLs, templating languages (what does the agent need to write correctly?)
- Naming conventions, file organization patterns (what are the implicit rules?)
- Configuration files, registries, manifests (what must stay in sync when changes are made?)
- Common error patterns (what goes wrong most often?)

**How to explore:**
- Use subagents for breadth — send an Explore agent with broad questions first, then follow up with targeted deep dives on specific conventions
- Read real examples in the repo, not just documentation — actual usage often reveals conventions that docs don't cover
- Check build/test scripts to understand what gets validated automatically
- Look at CI configs and linting rules — these encode domain constraints the agent must respect

**Output:** A mental model of the domain's key concepts, conventions, and failure modes.

## Phase 2: Audit Existing Skills

Read every skill the agent currently has. For each, note:
- What domain knowledge it covers
- What it's missing or gets wrong
- Where it overlaps with other skills

**Common patterns to look for:**
- Skills that were written early and never updated as the domain evolved
- Skills that try to cover too much (candidates for splitting)
- Domain concepts that span multiple skills but aren't covered deeply in any
- Syntax references that are incomplete (missing tags, outdated params)
- Skills with vague descriptions that won't trigger when needed

**Output:** A gap analysis — what the agent doesn't know that it should.

## Phase 3: Propose Candidates

Based on the gap analysis, enumerate candidate skills. For each:
- **Name**: Short, descriptive (e.g., `build-errors`, not `troubleshooting-guide`)
- **Scope**: One concern per skill — if you need "and" in the description, consider splitting
- **Value**: How does this prevent a real failure mode or improve quality?
- **Overlap risk**: Does this duplicate content already in another skill?

Present candidates to the user with descriptions and let them select which to create. Suggest groupings if some candidates are better merged.

**Sizing principle:** Keep skills small and focused. A skill should be consumable in one read without losing context. If it exceeds ~200 lines, consider whether it's trying to cover multiple concerns — use the `references/` pattern to offload detail.

## Phase 4: Create Skills

### Writing the frontmatter

The `description` field is the most important part — it controls when the agent reads the skill. Make it action-oriented and "pushy":

**Weak:** "Reference for Liquid tags."
**Strong:** "Complete reference for all custom Liquid tags in the docs site. Use this skill whenever writing or editing documentation pages — it lists every available tag with exact syntax and arguments. If you're unsure whether a tag exists or what arguments it takes, check here first."

Include both WHAT the skill does AND specific contexts that should trigger it. Descriptions have a tendency to undertrigger — being pushy combats this.

### Writing the body

Concrete, operational guidance works best:
- Use examples from the actual domain (real tag syntax, real file paths, real error messages)
- Include common mistakes with fixes — agents learn more from "don't do X, do Y instead" than from pure reference material
- Cross-reference other skills by name where the agent should consult them for related guidance
- Tables work well for decision logic (severity ladders, format choices, error → fix mappings)

### Keep it DRY

If content already exists in another skill, reference it rather than duplicating it:
- "See **documentation-syntax** for the full tag reference" is better than copying the tag list
- "For identifier conventions, see the **new-page-creation** skill" avoids maintaining the same rules in two places

Duplication creates drift — when one copy gets updated but the other doesn't, the agent gets conflicting guidance.

### Skill categories

Different types of skills have different optimal structures:

| Category | Structure | Example |
|---|---|---|
| **Syntax reference** | Tag/API inventory with params and examples | All Liquid tags with arguments |
| **Decision guide** | Severity ladder or decision tree with examples | Which callout type to use |
| **Error troubleshooting** | Error pattern → cause → fix mapping | Common build errors |
| **Checklist** | Ordered steps with validation criteria | Page removal checklist |
| **Convention guide** | Rules + examples + common mistakes | Identifier naming conventions |

## Further reading

- [GitHub Copilot skill authoring](https://docs.github.com/en/copilot/customizing-copilot/copilot-extensions/building-copilot-extensions) — Official docs on skill file structure, progressive disclosure, and bundled resources.
- [Claude Code memory and CLAUDE.md](https://docs.anthropic.com/en/docs/claude-code/memory) — How project-level context files shape agent behavior. Skills serve a similar role with scoped, on-demand loading.
- [Prompt engineering: use examples](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-examples) — Why concrete examples in skill bodies outperform abstract rules.
