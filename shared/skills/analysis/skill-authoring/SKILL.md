---
name: skill-authoring
description: "How to write or improve a Ralph runtime skill under shared/skills/: folder layout, frontmatter, a description that makes agents load the skill, a lean body with references, Liquid rendering, and wiring the skill into a stage. Use it whenever you propose a new skill or a change to an existing one, including when a run analysis finds a skill gap or a skill an agent ignored, misread or loaded too late."
---

# Skill Authoring

A runtime skill is a folder under `shared/skills/<category>/` that teaches agents one area of knowledge or one workflow. An agent sees the name and description of every skill its stage mounts, and loads a skill's body only when it decides the skill applies. A skill is therefore worth what its description makes agents reach for, plus what its body gives them once they do.

## Anatomy

```
<skill-name>/
├── SKILL.md       frontmatter (name, description) and the instructions
└── references/    optional: long material the body points to
```

- The folder name equals the frontmatter `name` and is unique across all of `shared/skills/`: stages mount skills by name, side by side.
- Categories: `domain/` (product and codebase knowledge, coding and review rules), `integrations/` (external services), `tasks/` (one task type), `workflow/<docs|vscode>/` (phase and router skills), `analysis/` (the run-analysis hook). Propose a new category only when none fits.
- Ship no script an agent has to run. Agents run in a locked-down container or, in hook stages, may only read and run read-only commands, so a skill that depends on executing its own code fails in most stages.

## The description

The description decides whether the skill is ever loaded. State what the skill covers and the situations that call for it, in the words an agent doing such a task would think in: file types, task phrases, failure symptoms. Agents tend to load too few skills, so name every situation the skill helps with, and none it doesn't.

## The body

- Keep `SKILL.md` to a few hundred lines. Move long tables, catalogues and examples into `references/<topic>.md`, and say in the body when to read each one. Give a reference longer than about 300 lines a table of contents.
- Write instructions in the imperative and explain why each one matters. An agent that knows the reason handles the case the rule did not foresee; a bare "MUST" makes it brittle.
- Generalise. A skill written around the one run that exposed a gap overfits: describe the pattern behind the run, and use the run as an example.
- Give a template or a worked example for every output format the skill prescribes.
- Cut what does not pull its weight. Every line costs context in every run that loads the skill.

## Liquid

Every `.md` in a skill is rendered with Liquid before an agent reads it, with the stage's template variables (`taskId`, `artifactDir`, `triggerParams`, `cliTools`, …; not `self`). Partials resolve from `shared/skills/` and `shared/agent-includes/`.

- Name tools through {% raw %}`{{ cliTools.skill }}`, `{{ cliTools.subagent }}`, `{{ cliTools.shell }}` and `{{ cliTools.read }}`{% endraw %}, so the skill reads right on every CLI.
- Gate optional content on a trigger parameter, such as {% raw %}`{% if triggerParams.codesamples %}`{% endraw %}, rather than writing a second skill.
- Wrap literal Liquid, such as Jekyll examples for the target repository, in a `raw` block, or the render consumes it.

## Wiring

A skill reaches an agent only when its name is in the `skills` of the agent's stage in `profiles/<id>/profile.json`. The agent template that should use it then names it: in a skills table, or as "load **<name>** before …" at the step that needs it. Keep orchestrators to their workflow router skill; domain and task skills belong to the subagents that do the work.

## Proposing a change

- New skill: write `SKILL.md`, and any references, under `shared/skills/<category>/<name>/`, together with the template change that tells the right subagent to load it. Its entry in `profile.json` is part of the change; describe it if you cannot edit that file.
- Existing skill: start from the current file and change only what the finding demands, so the difference shows exactly what the finding motivated.
