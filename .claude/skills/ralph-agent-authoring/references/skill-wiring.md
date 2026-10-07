# Wiring a runtime skill

Making a skill usable by a runtime agent takes up to three edits, and not every skill needs all three:

1. **Registration**: add the name to `stages[].skills[]` in `profiles/<id>/profile.json`. Without it the skill is never rendered or mounted.
2. **Reference**: name the skill in the subagent template(s) that should read it.
3. **Workflow callout** (optional): mention it in a phase reference file when it matters at one step only.

Keep orchestrators pure. They reference only their workflow router skill; domain and task skills belong in subagent prompts.

## 0. Create the skill (if new)

- Pick a category under `shared/skills/`: `domain/` (product knowledge, coding/testing/review rules), `integrations/` (external services: ADO, Ralphchives, code graph, screenshots), `tasks/` (task-specific guidance: code samples, release notes, training modules), `workflow/<docs|vscode>/` (phase and router skills), or a product router like `xperience/`. Propose a new category only if none fits.
- The folder name must equal the frontmatter `name:`. Lookup is by folder name anywhere under `shared/skills/` (`findSkillDir` in `src/container/setup/skill-includes.ts`), so names must be unique across categories.
- Write a concise SKILL.md with heavy material in `references/`. The `skill-creator` skill covers authoring and evals.
- Every `.md` in the skill is Liquid-rendered with `TemplateContext`. Partials resolve from both `shared/skills/` and `shared/agent-includes/`. Wrap literal `{{ … }}` / `{% … %}` (e.g. Jekyll or Liquid examples for the target repo) in `{% raw %}…{% endraw %}`.

## 1. Register in profile.json

Add the name to the `skills` array of the stage whose agent (or its subagents) will read it, in every variant that needs it. Subagents dispatched by a stage's orchestrator share that stage's mounted skills.

```jsonc
"variants": [{
  "match": { "projects": ["DOC"], "commentTrigger": "@RalphAutocomplete" },
  "stages": [{
    "agent": "ralph.ralph",
    "role": "primary",
    "skills": ["vscode-workflow", "test-behavior-testing", "new-skill-name"]
  }]
}]
```

`npm run validate` fails if a listed name has no `SKILL.md` under `shared/skills/`. Local (hook) stages get no mounts: they render their listed skills into their own workspace (see SKILL.md).

## 2. Reference it in the subagent template

Choose the lightest pattern that works. Each has a live example:

| Pattern                                                                                                      | Use for                                                       | Example                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------- |
| **Skills table** (`## Skills` + `\| Skill \| What it covers \|`)                                             | Knowledge the subagent always needs                           | `profiles/ralph-docs/agents/ralph.ralph-researcher.agent.md`    |
| **Two-tier table** (always load / load when relevant, conditional rows gated by `{%- if triggerParams.x %}`) | Many optional skills where loading all of them wastes context | `profiles/ralph-docs/agents/ralph.ralph-planner.agent.md`       |
| **Authoritative reference** ("read cover to cover; if a rule isn't in these skills it isn't a finding")      | Reviewers whose acceptance criteria are the skills            | `shared/agent-includes/ralph-docs/ralph-reviewer-style-body.md` |
| **Inline bold at a step** ("2. READ **test-behavior-testing**, …")                                           | Guidance needed at one precise step                           | `profiles/ralph-vscode/agents/ralph.ralph-coder.agent.md`       |
| **Conditional section** (whole block inside `{%- if triggerParams.codesamples %}`)                           | Feature-gated work (`@RalphDf(codesamples)`)                  | `shared/agent-includes/ralph-docs/ralph-standard-workflow.md`   |

On Claude Code an agent can also list a skill in its frontmatter `skills`: a subagent starts with it preloaded, and a stage root loads it with the `Skill` tool before anything else. Startup validation rejects a frontmatter skill its stage doesn't register.

Anti-patterns: skills in the orchestrator prompt (except its workflow router), skill content pasted into the template, a mandatory skill behind a conditional, the same skill on every subagent "just in case", referencing a skill the stage doesn't register.

## 3. Workflow callout (optional)

If the skill matters at one phase only, add "Read **new-skill-name** before …" to that phase's reference under `shared/skills/workflow/<docs|vscode>/<router>/references/`.

## Checklist

- [ ] Folder name = `name:` = entry in `profile.json`, in every intended variant/stage
- [ ] Each intended subagent references it; no other agent's skill references changed
- [ ] Conditional gating uses the right `triggerParams` key, and the param is documented in `docs/user-guide/trigger-parameters.md`
- [ ] Liquid variables used by the skill exist in `TemplateContext` (lint test passes)
- [ ] `npm run validate` and the template tests listed in SKILL.md pass
