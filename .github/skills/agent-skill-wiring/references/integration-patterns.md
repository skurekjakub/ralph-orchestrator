# Integration Patterns

How skills get referenced in Ralph subagent templates. Each pattern serves a different purpose — choose based on the skill's role and the subagent's workflow.

---

## Pattern A: Skills Table

The most common pattern. A `## Skills` section with a markdown table listing skill names and one-sentence descriptions. The subagent reads all listed skills before starting work.

```markdown
## Skills

Read these skills before starting.

| Skill | What it covers |
|---|---|
| **ralph-ralphchives** | Search the archives for prior work |
| **ralph-research-guide** | Complete research methodology |
| **new-skill-name** | What this skill provides |
```

**When to use**: Task/domain knowledge skills that the subagent should always consult. Researchers, coders, planners.

**Real example**: `ralph.ralph-researcher.agent.md` in ralph-docs — always-load research skills.

---

## Pattern B: Two-Tier Table (mandatory + conditional)

Splits skills into "always load" (core) and "load when relevant" (supplementary). Supplementary rows can be gated by Liquid `triggerParams` conditionals.

```markdown
### Always load (core skills)

| Skill | What it helps you do |
|---|---|
| **core-skill** | Essential for every run |

### Load when relevant (supplementary skills)

| Skill | When to load |
|---|---|
| **domain-skill** | When the task spans multiple product areas |
{%- if triggerParams.codesamples %}
| **codesamples-skill** | Task involves code sample changes |
{%- endif %}
{%- if triggerParams.release_notes %}
| **release-notes-skill** | Task involves release note writing |
{%- endif %}
```

**When to use**: Subagents with many potential skills where loading all of them wastes context. Planners, researchers.

**Real example**: `ralph.ralph-planner.agent.md` in ralph-docs — core planning skill always loaded, domain skills conditional.

---

## Pattern C: Authoritative Reference

Skills declared as the **source of truth** for a reviewer. The reviewer must read them cover-to-cover and only flag issues that violate rules defined in these skills.

```markdown
## Reference Skills (MUST read before reviewing)

Load and read these skills **cover to cover** before examining any file:

| Skill | Purpose |
|---|---|
| **style-guide-review** | Writing standards, page structure |
| **documentation-syntax** | Syntax, frontmatter, Liquid template rules |

These are your authority. If a rule isn't in these skills, it's not a valid finding.
```

**When to use**: Reviewer subagents where skills define the acceptance criteria. The "authority" framing prevents the reviewer from inventing rules.

**Real example**: `ralph.ralph-reviewer-style.agent.md` in ralph-docs.

---

## Pattern D: Inline Bold Reference

Skills cited by name in bold within a numbered workflow step. No table — the skill is read at a specific point in the subagent's process.

```markdown
## Implementation Steps

1. Read the analyst's plan
2. Read all of these skills about testing best practices:
   **test-behavior-testing**, **test-mocking-strategy**, **test-structure-patterns**
3. Implement the changes following the patterns from the skills
```

**When to use**: Skills that should be read at a precise step rather than up-front. Common for coder subagents with step-by-step workflows.

**Real example**: `ralph.ralph-coder.agent.md` in ralph-vscode — testing skills referenced inline.

---

## Pattern E: Conditional Section

An entire skills section wrapped in a Liquid conditional. The section only appears when a trigger parameter is set.

```markdown
{%- if triggerParams.codesamples %}
## Code Samples Skills

Read these skills for code sample handling:

| Skill | What it covers |
|---|---|
| **codesamples** | Project structure, feature-folder conventions |
| **codesamples-verification** | Verification checklist |
{%- endif %}
```

**When to use**: Feature-gated skills that only apply when the JIRA trigger comment includes a specific parameter (e.g., `@RalphDf(codesamples)`).

Can also be combined with Pattern B (conditional rows inside a table).

---

## Choosing the Right Pattern

| Skill type | Recommended pattern | Example |
|---|---|---|
| Domain knowledge (always needed) | A — Skills table | Research methodology, product domain |
| Domain knowledge (sometimes needed) | B — Two-tier table | Product area skills loaded by topic |
| Review criteria / acceptance rules | C — Authoritative reference | Style guide, syntax rules |
| Implementation guidance at a specific step | D — Inline bold | Testing patterns, build verification |
| Feature-gated domain knowledge | E — Conditional section | Code samples, release notes |
| Workflow phase skill (router) | Not in subagent — orchestrator only | Workflow router skills stay in the orchestrator |

---

## Anti-Patterns

- **Don't put skills in the orchestrator prompt** — the orchestrator is a pure router. Only workflow router skills belong there.
- **Don't reference skills the subagent can't access** — every skill name must be in the variant's `stages[].skills[]` array in `profile.json`.
- **Don't duplicate skill content in the prompt** — reference the skill by name, don't copy its content into the agent template.
- **Don't gate mandatory skills behind conditionals** — if a skill is always needed, put it in the "always load" tier.
- **Don't add skills to every subagent** — only the subagent(s) that use the knowledge should reference it.
