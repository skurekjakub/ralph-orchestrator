---
paths:
  - "profiles/**"
  - "shared/agent-includes/**"
  - "shared/skills/**"
---

# Runtime agents, partials and skills

- This is product content, not dev tooling. These agents run in Docker, on Claude Code by default or on Copilot CLI, against **other** repos mounted at `/workspace`, so paths inside templates and runtime skills are container paths (`/workspace/…`, `.ralph/tasks/{{ taskId }}/…`). Mode `local` stages and hook stages are the exception: they run on the host, each in a workspace of its own under the task's output directory, with an absolute `{{ artifactDir }}`; hook stages reach the task profile's `agents/` and this repo's `shared/agent-includes`, `shared/skills` and `shared/mcp-servers` through `{{ hook.orchestratorDir }}`.
- Every `.md` here is a Liquid template. Variables come from the `TemplateContext` interface in `src/container/setup/agent-includes.ts`. A variable missing there fails `tests/container/template-context-lint.test.ts`. Wrap literal `{{ }}` / `{% %}` in `{% raw %}`. `{% section "x" %}` emits `<x>…</x>` boundaries.
- `profiles/*/.build/` is generated on every task and stage (agents in `.build/<cli>/agents/`, skills in `.build/skills/`). Never edit it.
- A runtime skill reaches an agent only when its folder name is listed in that stage's `skills` in `profile.json`. Folder name = frontmatter `name`, unique across all of `shared/skills/`.
- Agent frontmatter is the canonical, CLI-neutral schema (`agentFrontmatterSchema` in `src/cli/agent-definition.ts`): `name`, `description`, `model` (Claude Code alias such as `opus`), `subagents`, optional `tools`, `skills`, `effort`, `maxTurns`, `runtimes`, `copilot.model`. The renderer translates it per CLI; never write Copilot keys (`agents`, `user-invocable`) or Copilot model ids as `model`.
- Use `{{ self.name }}` for an agent's own artifact directory and attribution, and `{{ cliTools.subagent }}` / `skill` / `shell` / `read` / `askUser` instead of a CLI's tool names.
- `shared/agent-includes/post-hooks/*.md` drive the host-side `ralph.scientist` hook. They load the runtime skills in `shared/skills/analysis/` by name, so keep those names stable.
- After edits: `npm run validate` and `npx vitest run tests/container/template-integration.test.ts tests/container/template-context-lint.test.ts`. For wiring changes (subagents, skills, phases, planner loops), use the `ralph-agent-authoring` skill.
