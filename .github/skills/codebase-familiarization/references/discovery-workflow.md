# Discovery Workflow

Use this workflow to explore an unfamiliar repository before generating a reference skill.

## Goal

Build a structural understanding of the repo first, then write the skill. Do not start by drafting area documents from isolated files.

## Discovery Order

1. Read the workspace tree at the repo root.
2. Identify the likely primary surfaces:
   - `src`, `app`, `packages`, `services`, `libs`
   - `docs`, `profiles`, `scripts`, `tests`
   - top-level product directories in a monorepo
3. Inspect one level deeper inside the promising surfaces.
4. Inspect a second level deeper only where it changes the structural picture.
5. Look for naming signals:
   - business domains
   - runtime boundaries
   - deployment surfaces
   - extension points
   - framework or platform layers
6. Cross-check with high-signal files:
   - `README.md`
   - architecture docs
   - configuration docs
   - package manifests
   - workspace files
7. If relevant, map documentation structure to implementation roots.

## What To Capture During Discovery

For each likely area, capture:

- the directory or file path that defines the area
- what responsibility the area owns
- whether it is user-facing, internal, infra, docs, tests, or tooling
- the main entrypoints or code roots
- the nearest sibling areas it interacts with

## Heuristics

- The higher in the tree, the broader the concept.
- Repeated patterns usually indicate a framework or plugin boundary.
- Paired directories often reveal an architecture split, for example:
  - `src` and `tests`
  - `app` and `packages`
  - `docs` and `resources`
  - `core` and `integrations`
- A directory with many focused subdirectories often deserves its own reference file.
- A directory with mostly flat files often belongs inside a broader parent reference.

## What Not To Do

- Do not generate one reference file per leaf folder by default.
- Do not overfit to filenames before understanding the area they live in.
- Do not let generated or vendored folders distort the structure.
- Do not confuse implementation language boundaries with product boundaries.

## Good End State

You should be able to sketch the repo as a small set of stable areas before writing anything:

- core application areas
- integration or extension areas
- operations or environment areas
- documentation or content areas
- tests and tooling

If you cannot do that yet, keep exploring before generating the skill.
