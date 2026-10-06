---
paths:
  - "profiles/**"
  - "shared/agent-includes/**"
  - "shared/skills/**"
---

# Runtime agents, partials and skills

- This is product content, not dev tooling. These agents run in Docker against **other** repos mounted at `/workspace`, so paths inside templates and runtime skills are container paths (`/workspace/.github/skills/…`, `.ralph/tasks/{{ taskId }}/…`). Mode `local` hook stages are the exception: they run on the host with cwd = this repo's root.
- Every `.md` here is a Liquid template. Variables come from the `TemplateContext` interface in `src/container/setup/agent-includes.ts`. A variable missing there fails `tests/container/template-context-lint.test.ts`. Wrap literal `{{ }}` / `{% %}` in `{% raw %}`. `{% section "x" %}` emits `<x>…</x>` boundaries.
- `profiles/*/.build/` and `shared/skills/.build/` are generated on every task. Never edit them.
- A runtime skill reaches an agent only when its folder name is listed in that stage's `skills` in `profile.json`. Folder name = frontmatter `name`, unique across all of `shared/skills/`.
- Agent frontmatter is Copilot CLI `.agent.md` format for now. Don't convert it to Claude Code agent format.
- `shared/agent-includes/post-hooks/*.md` drive the host-side `ralph.scientist` hook. They load this repo's `.claude/skills/` by name, so keep those names stable.
- After edits: `npm run validate` and `npx vitest run tests/container/template-integration.test.ts tests/container/template-context-lint.test.ts`. For wiring changes (subagents, skills, phases, planner loops), use the `ralph-agent-authoring` skill.
