# ☢ CONTAINMENT — TOXIC, DO NOT USE ☢

Everything below this folder is **quarantined**. It is semantically unrelated to
Ralph Orchestrator: agent families built for other products (Kentico docs authoring,
generic web-app migration, an agent-factory meta-tool), an aborted fiction-writing
pipeline run, guides for unrelated stacks, and plans for those side projects.

It is kept only as an archive. It is actively **disruptive** as context: it uses the
same vocabulary as this repo (agents, skills, fractals, orchestrators, Ralph) but
describes different systems, so reading it produces confidently wrong conclusions.

## Rules for agents (Claude Code or any other)

- **Never** read, search, grep, glob, cite, summarize, or index anything in `containment/`.
- **Never** use it as an example, template, precedent, or source of conventions.
- **Never** move or copy anything out of it, or reference it from code, docs, skills, or
  agent prompts — unless the user explicitly asks for that specific item.
- If a search result lands here, discard it and keep searching elsewhere.

Enforcement: `.rgignore` hides it from ripgrep-based search (Claude Code Grep/Glob),
`.cgcignore` keeps it out of the CodeGraphContext index, and ESLint ignores it.

## Contents

| Path | What it is |
|---|---|
| `fractals/docwriter/` | Kentico documentation-authoring agent family (31 Copilot agents) for the docs repo |
| `fractals/migration/` | Generic web-app migration agent family |
| `fractals/fractal-factory/` | Fractal Factory meta-tool (Copilot agent-family generator), superseded by the `agent-architecture` plugin |
| `fractals/critical-instr.md` | Copilot-CLI-only constraint snippet used by the families above |
| `fractal-factory-run-fantasy-writer/` | Run state of an aborted Fractal Factory run for a fiction-writing domain |
| `docs/` | Guides for unrelated stacks and pasted posts |
| `plans/` | Plans for the side-project agent families above (fractal-factory, fractal-migration, discovery-registry, docwriter extensions, Overralph/agent-factory) |
| `todos/` | Backlog notes for those side projects |
| `terraform/` | Placeholder Terraform for an unrelated e-commerce GitHub org |
