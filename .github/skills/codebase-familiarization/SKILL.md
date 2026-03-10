---
name: codebase-familiarization
description: Create a reference skill for an unfamiliar repository by surveying its structure, identifying the major domains, mapping each area to the relevant code roots, and packaging the result as a router skill plus focused reference files. Use this skill whenever the user asks to familiarize with an unexplored codebase, map a repo, understand project structure, orient in a new repository, build a navigation/reference skill, or turn repository discovery into reusable guidance for later agents. Use it even if the user does not explicitly say "skill" but clearly wants a durable structural map of a codebase.
---

# Codebase Familiarization

Use this skill to transform an unfamiliar repository into a reusable reference skill.

The output is not a prose summary in chat. The output is a new skill directory with:

- a router `SKILL.md`
- a `references/` folder with focused area documents

Read the bundled reference files before starting. They define the workflow, the scoping heuristics, and the required output shape.

## Read These References

| File | Purpose |
|---|---|
| `references/discovery-workflow.md` | How to explore an unfamiliar codebase without getting lost in leaf details |
| `references/area-selection.md` | How to choose the right areas, decide granularity, and exclude noise |
| `references/router-template.md` | What the top-level generated `SKILL.md` should contain |
| `references/reference-template.md` | The structure each generated reference file should follow |
| `references/validation-checklist.md` | Checks to run before you consider the generated skill complete |

## What This Skill Produces

Create a new skill whose structure looks like this:

```text
<new-skill>/
├── SKILL.md
└── references/
    ├── <area-1>.md
    ├── <area-2>.md
    └── ...
```

The generated skill should act as a router:

- `SKILL.md` names the major areas and points to the relevant reference files
- each reference file covers one stable area of the repo, not one random folder and not one tiny leaf page

## Default Workflow

1. Capture the repo root, intended audience, and desired granularity.
2. Survey the top-level tree first. The higher in the tree, the broader the concept.
3. Inspect one or two levels deeper only in directories that look structurally important.
4. Group findings by domain or responsibility, not by incidental file type.
5. Map each area to the code roots or entrypoints that anchor it.
6. Generate the router skill and reference files.
7. Validate naming, coverage, and cross-references.

## Default Granularity

Use these defaults unless the user asks otherwise:

- Small repo: top-level area references are usually enough.
- Medium repo: second-level area references are usually best.
- Large repo or monorepo: mix broad router sections with more focused per-area references.

Prefer broader, stable areas over narrow leaf nodes. The point is orientation, not exhaustiveness.

## Rules

- Treat the repository itself as ground truth.
- Exclude generated output, caches, vendored dependencies, changelogs, and temporary build artifacts unless they are central to how the repo works.
- If the repo contains docs and source code, connect documentation areas to source roots where possible.
- Use repo-relative paths inside generated reference files unless the user asks for another format.
- Keep the router concise. Put detail in `references/`.
- If you cannot map an area to code confidently, say that explicitly instead of inventing a path.

## When To Go Deeper

Go beyond the top-level tree when:

- a directory clearly contains multiple distinct subsystems
- the audience needs implementation-level orientation, not just navigation
- the repo has parallel surfaces, such as `src`, `docs`, `tests`, `packages`, `services`, or `apps`

Stay shallow when:

- the deeper structure is repetitive or generated
- the user asked for a broad orientation only
- deeper pages would produce dozens of low-value reference files

## Expected Outcome

By the end, another agent should be able to read the generated skill and quickly answer:

- what the major areas of the repo are
- where to look for a given topic
- which directories matter most
- which code roots back each area
- how the major areas relate to each other
