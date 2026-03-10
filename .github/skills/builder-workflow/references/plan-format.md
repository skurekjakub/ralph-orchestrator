# Phased Implementation Plan Format

Plans are stored in `plans/<plan-name>/` as a collection of markdown files. The builder orchestrator reads these plans and executes them phase by phase.

## Directory Structure

```
plans/<plan-name>/
├── 00-overview.md              (required — plan index and metadata)
├── 01-phase-0a-<slug>.md       (first phase)
├── 02-phase-0b-<slug>.md       (second phase)
├── 03-phase-a-<slug>.md        (third phase)
├── ...
└── 09-phase-gh-<slug>.md       (last phase)
```

**Naming convention**: `{NN}-phase-{id}-{slug}.md` where:
- `NN` = two-digit sequence number (01–09)
- `id` = phase identifier (0a, 0b, a, b, c, ..., or compound like `gh`)
- `slug` = kebab-case description

## Overview File (00-overview.md)

The overview is the entry point. It contains all metadata the orchestrator needs.

### Required sections

#### 1. Title + TL;DR

```markdown
# {Plan Title}

## TL;DR

{1-3 sentences summarizing what the plan does and the key changes}
```

#### 2. Architecture (optional)

```markdown
## Architecture

{High-level diagram or description of the new architecture or workflow}
```

#### 3. Phase Index

```markdown
## Phase Index

| Phase | File | Scope | Repo |
|-------|------|-------|------|
| **0a** | [01-phase-0a-slug.md](01-phase-0a-slug.md) | Brief scope description | target-repo-name |
| **0b** | [02-phase-0b-slug.md](02-phase-0b-slug.md) | Brief scope description | this repo |
| **A** | [03-phase-a-slug.md](03-phase-a-slug.md) | Brief scope description | this repo |
| ... | ... | ... | ... |
```

Key fields:
- **Phase**: identifier used in cross-phase references and artifact directories
- **File**: relative link to the phase file
- **Scope**: what this phase covers
- **Repo**: target repository (`this repo` for the current workspace, or external repo name)

#### 4. File Manifest

```markdown
## File Manifest

### Create
- `path/to/new-file.ts` — purpose (Phase X)

### Modify
- `path/to/existing-file.ts` — what changes (Phase X)

### External ({repo-name} repo)
- `path/to/file.ts` — what changes (Phase X)
```

Groups files by operation (Create/Modify) and by repository. Each entry tags which phase it belongs to.

#### 5. Decisions

```markdown
## Decisions

| Decision | Rationale |
|----------|-----------|
| **Choice made** | Why this was chosen over alternatives |
| ... | ... |
```

Documents key design decisions the implementer must respect.

#### 6. Resolved Gaps (optional)

```markdown
## Resolved Gaps

| # | Gap | Resolution |
|---|-----|-----------|
| 1 | Gap description | How it was resolved |
| ... | ... | ... |
```

Documents questions that came up during planning and their answers.

#### 7. Verification Checklist

```markdown
## Verification Checklist

1. `npm run lint` — passes
2. Template rendering — works correctly
3. Skills resolve at declared paths
4. ...
```

Numbered list of end-to-end checks the verifier will run after all phases complete.

## Phase Files

Each phase file describes one unit of work for the implementer.

### Structure

```markdown
# Phase {ID}: {Title}

## Overview
{what this phase does and why}

## Dependencies
{which other phases must complete first, or "None"}

## Files

### Create
- `path/to/file.ts` — purpose

### Modify
- `path/to/file.ts` — what changes

## Implementation

{Detailed instructions for the implementer:}
- Step-by-step changes to each file
- Code snippets showing what to add/modify
- Patterns to follow
- Validation commands to run

## Cross-Phase References
{references to artifacts or state from other phases, if any}
```

### Phase file conventions

- **Self-contained**: Each phase file contains enough context for the implementer to execute it independently (given dependencies are met)
- **Concrete**: Include actual code snippets, file paths, and command examples — not just descriptions
- **Scoped**: Each phase modifies a focused set of files. Avoid phases that touch everything.
- **Validated**: Include validation steps the implementer should run after completing the phase
- **Cross-references**: Use phase IDs (e.g., "Phase A", "phase-0b") when referencing other phases

### Dependency notation

Dependencies are expressed in the phase file's Dependencies section:
- `None` — can execute independently
- `Phase 0a` — depends on a specific phase
- `Phase 0a, Phase 0b` — depends on multiple phases
- Dependencies also implicit from the Phase Index ordering (earlier phases complete first by default)

## Creating a New Plan

1. Start with `00-overview.md` — define the TL;DR, phase index, and file manifest
2. Create phase files in dependency order
3. Each phase should be implementable in one agent session (not too large)
4. Tag every file in the manifest with the phase that creates/modifies it
5. Write concrete verification checks that can be run automatically
6. Cross-repo phases should clearly identify the target repo path
