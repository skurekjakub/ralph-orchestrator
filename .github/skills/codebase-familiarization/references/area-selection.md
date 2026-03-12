# Area Selection

Use this guide to decide how many reference files to create and what each one should cover.

## Primary Principle

Create references for stable, meaningful areas of responsibility.

That usually means:

- a product surface
- a subsystem
- a framework layer
- a documentation section
- an operational surface

That usually does not mean:

- a random utility folder
- a single leaf folder with one obvious file
- generated output
- vendor code

## Default Granularity

### Small repositories

Create broad references for major top-level areas.

Example:

- application
- configuration
- scripts
- tests

### Medium repositories

Use second-level areas when the top level is too broad.

Example:

- `src/api`
- `src/services`
- `src/ui`
- `docs/user-guide`

### Large repositories or monorepos

Use a mixed strategy:

- broad router sections at the top
- focused references for the most important second-level areas
- separate references for each app or package family when appropriate

## Good Splits

Choose area boundaries that help a future agent answer navigation questions quickly.

Good examples:

- `development`, `customization`, `configuration`
- `website-content`, `digital-marketing`, `media-libraries`
- `apps/web`, `apps/admin`, `packages/shared`

Bad examples:

- `controllers`, `services`, `types` when those exist in every subsystem and are not meaningful at repo level
- one reference per tiny folder only because the tree is deep

## Audience Matters

Adjust the area split based on who will consume the generated skill.

### Documentation authors

Prioritize:

- doc section boundaries
- page hierarchy
- topic relationships
- related implementation roots

### Developers

Prioritize:

- runtime boundaries
- entrypoints
- extension points
- APIs and internal modules

### Operators or platform engineers

Prioritize:

- deployment surfaces
- infrastructure configuration
- environment setup
- scripts and automation

## What To Exclude By Default

Exclude these unless the user explicitly wants them:

- changelogs
- release notes
- generated build outputs
- caches
- vendored dependencies
- lockfiles
- machine-generated snapshots

## When To Add Separate References

Create a dedicated reference when an area:

- has its own nested structure worth navigating
- has its own audience or workflow
- maps to a distinct implementation root
- is important enough that agents will repeatedly need it

## Naming

Reference filenames should be stable and boring.

Prefer names like:

- `app-core.md`
- `developer-api.md`
- `ops-deployment.md`
- `business-content.md`

Avoid names that only make sense for the current task.
