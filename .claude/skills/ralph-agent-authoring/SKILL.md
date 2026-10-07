---
name: ralph-agent-authoring
description: "Authors and wires Ralph's runtime agent families: Liquid agent templates in profiles/<id>/agents/*.agent.md, shared partials in shared/agent-includes/, runtime skills in shared/skills/<category>/, and profile.json variants, stages, skills, and mcpServers. Use when adding or editing a runtime agent or subagent, wiring a skill into a profile, adding or reordering workflow phases, adding a planner/verification loop, consolidating phase skills into a router skill, using TemplateContext variables or the {% section %} tag, or debugging why an agent can't see a skill. Trigger on 'add a subagent', 'wire this skill', 'add a phase', 'new reviewer for ralph-docs', 'the agent doesn't see the skill', 'edit the ralph template'."
---

# Ralph Runtime Agent Authoring

These agents do not work on this repo. They run inside Docker containers against a **target** repo mounted at `/workspace`, driven by Claude Code (the default CLI, which both bundled profiles run) or by Copilot CLI when a stage sets `cli: "copilot"`. Every path you write _inside_ a container agent's template or runtime skill is a container path (`/workspace/...`, `.ralph/tasks/{{ taskId }}/...`), not an orchestrator path. Host (`mode: "local"`) stages, such as the `ralph.scientist` post-task hook, run in their own workspace on the host and take their paths from `{{ artifactDir }}` and the `hook.*` variables. Name CLI tools through `{{ cliTools.* }}` so one template reads right on both CLIs.

## Moving parts

| What             | Where                                        | Notes                                                                                    |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Agent templates  | `profiles/<id>/agents/ralph.<name>.agent.md` | Liquid source of truth                                                                   |
| Shared partials  | `shared/agent-includes/**`                   | Pulled in with `{% render 'dir/name' %}` (`.md` implied)                                 |
| Runtime skills   | `shared/skills/<category>/<name>/SKILL.md`   | Found by folder name, recursively; Liquid-rendered like templates                        |
| Wiring           | `profiles/<id>/profile.json`                 | Schema: `profileFileSchema` / `variantSchema` / `stageSchema` in `src/config/schemas.ts` |
| Generated output | `profiles/<id>/.build/`                      | Rewritten every task. Never edit; fix the source                                         |

## How rendering and mounting work

- Before each task (and again per stage in multi-stage pipelines and post-task hooks), `AgentTemplateRenderer` and `SkillTemplateRenderer` (`src/container/setup/agent-includes.ts`, `skill-includes.ts`) render with LiquidJS. The template variables are the fields of the `TemplateContext` interface in `src/container/setup/agent-includes.ts`, built by `buildTemplateContext()`. Read that interface instead of guessing names. Adding a field means updating `buildTemplateContext()` **and** the key set in `tests/container/template-context-lint.test.ts`, which fails on unknown variables.
- `{% section "name" %}…{% endsection %}` (`src/container/setup/liquid-tags.ts`) wraps content in `<name>…</name>` so the model sees hard section boundaries. Use it for identity, security, contract and workflow blocks.
- Each stage renders only the agents its root agent can reach (through `subagents`), in its CLI's format, into `profiles/<id>/.build/<cli>/agents/`; its `skills` render to `profiles/<id>/.build/skills/<name>/`. Both directories are synced in place, so bind mounts keep working. For Claude Code the overlay mounts both directories whole, read-only, at `/workspace/.ralph/claude/agents/` and `/workspace/.ralph/claude/skills/`; for Copilot it mounts each file at `/workspace/.github/agents/<file>` and each skill at `/workspace/.github/skills/<name>/`. A skill not listed in `profile.json` does not exist for the agent.
- Local stages (`mode: "local"`, post-task hooks included) render their agents and skills into a workspace of their own under the task's output directory (`StageWorkspaceResolver`, `src/services/stage-workspace.ts`): Claude Code into its private home (`home/agents/`, `home/skills/`), Copilot into `work/.github/`. They get exactly the skills their stage lists, like container stages. The `ralph.scientist` hook stages list the runtime skills in `shared/skills/analysis/` (`agent-eval`, `run-telemetry-analysis`, `skill-creator`, `mcp-builder`), which the hook prompts in `shared/agent-includes/post-hooks/` name. Don't rename or move those skills without updating the hook prompts and `profile.json`.

## Agent frontmatter (canonical format)

Templates use one CLI-neutral frontmatter, validated by `agentFrontmatterSchema` (`src/cli/agent-definition.ts`) and translated per CLI by the agent file writers in `src/cli/{claude,copilot}/`:

```yaml
---
name: ralph-writer # unique per profile; names the artifact dir
description: "Writer sub-agent — …"
model: opus # Claude Code alias or full id; `inherit` for subagents only
subagents: [ralph-validator] # agents this one may dispatch, by name
tools: [Read, Edit, Bash] # optional Claude Code built-in subset
skills: [ralph-workflow] # optional, Claude Code only: preloaded into a subagent, loaded with the Skill tool first by a stage root (whose tools must keep Skill); must be in the stage's skills
effort: high # optional, Claude Code only
maxTurns: 300 # optional, Claude Code only
runtimes: [claude, copilot] # optional, default both
copilot:
  model: gpt-5.4 # optional Copilot model instead of the mapping of `model`
---
```

The frontmatter is a strict YAML subset: `key: value`, quoted strings, one-line `[a, b]` lists, one nested level. A stage's `agent` is the file stem (`ralph.ralph`). Startup validation (`src/validate/agents.ts`) rejects unknown keys, dangling `subagents`, duplicate names, cycles, and agents that cannot run on a stage's CLI. Inside bodies, `{{ self.name }}` is the rendering agent's own name and `{{ cliTools.subagent }}` etc. name the stage CLI's tools.

## Pick the task

| You want to…                                                                     | Read                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a runtime skill and/or make an agent use it                               | `references/skill-wiring.md`                                                                                                                                                             |
| Add a subagent (reviewer, scout, scribe, validator…) to a family                 | `references/subagent-wiring.md`                                                                                                                                                          |
| Insert, remove, or reorder workflow phases                                       | `references/workflow-phases.md`                                                                                                                                                          |
| Add a planner + per-task loop + verification pass                                | `references/planner-loop.md`                                                                                                                                                             |
| Merge per-phase skills into one router skill                                     | `references/skill-consolidation.md`                                                                                                                                                      |
| Design a new family, refactor to agent-as-function, audit or evaluate a workflow | Plugin skills `agent-architecture:agent-as-function`, `agent-architecture:agent-creator`, `agent-architecture:agent-as-function-audit`, `agent-architecture:agent-fractal-workflow-eval` |
| Score a finished run                                                             | `agent-eval` skill                                                                                                                                                                       |

When a design choice needs the user (variants, which subagents, gating parameter, loop caps), ask with `AskUserQuestion` in one batch before editing.

## Invariants

- Orchestrators are pure routers: they dispatch, route on each subagent's `status.json` `result`, and never read `output.md` or do the substantive work. Subagents follow `shared/agent-includes/agent-as-function-contract.md` and write under `{{ artifactDir }}/<agent>/`.
- One spelling per agent name across frontmatter `name:` and `subagents:`, roster tables, routing tables, and artifact paths.
- Standard and revision paths (`isRevision`, `revisionStatuses`) are separate. Every change must be checked against both.
- Feature toggles come from trigger params (`triggerParams.<key>`, see `docs/user-guide/trigger-parameters.md`). The toggle-off path must behave exactly as the agent does without the feature.
- Domain knowledge lives in skills, not pasted into templates. Reference skills by name.

## Verify

```bash
npm run validate     # env, config, Docker, profiles (skill names, MCP servers + requiredConfig, port clashes)
npx vitest run tests/container/template-integration.test.ts tests/container/template-context-lint.test.ts tests/container/skill-includes.test.ts
npm test             # before finishing
```

Then grep the profile for the new name or old owner to catch dangling references.

## Reference docs

`docs/dev-doc/agent-templates.md`, `docs/dev-doc/multistage-pipelines.md`, `docs/dev-doc/agent-as-function.md`, `docs/user-guide/profiles.md`, `docs/user-guide/skills.md`, `docs/user-guide/template-variables.md`.
