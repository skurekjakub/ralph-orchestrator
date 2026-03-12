# Phase 1: Setup

## Before you begin

1. **Identify the plan path** from the user's invocation (e.g., `plans/codesamples-bootstrap/`)
2. **Extract the plan name** from the directory name (e.g., `codesamples-bootstrap`)

## Instructions

### Validate the plan

1. Check the plan directory exists at the provided path
2. Verify `00-overview.md` exists in the plan directory
3. List the directory contents to confirm numbered phase files exist (e.g., `01-phase-*.md`)

If validation fails, print an error and stop:
```
Error: Plan directory not found at {plan-path}
```
or
```
Error: No 00-overview.md found in {plan-path}
```

### Create artifact directories

Create the artifact root and subdirectories:

```
.builder/artifacts/{plan-name}/
├── planner/
├── phases/
├── verifier/
└── scribe/
```

Phase subdirectories will be created by subagents as needed.

### Initialize manifest.json

Create `.builder/artifacts/{plan-name}/manifest.json` with an empty array:

```json
[]
```

### Initialize state.md

Read `00-overview.md` to get the Phase Index table. Extract phase IDs and titles. Then create `.builder/artifacts/{plan-name}/state.md`:

```markdown
# Builder State: {plan-name}

Started: {timestamp from `date -u`}
Current phase: setup
Overall: in-progress

## Phases

| Phase | Status | Iterations | Notes |
|-------|--------|------------|-------|
| phase-0a | pending | 0 | — |
| phase-0b | pending | 0 | — |
| phase-a | pending | 0 | — |
| ... | ... | 0 | — |

## Verification
Status: pending
```

Populate the phases table from the Phase Index in `00-overview.md`.

## Before moving to the next phase

Verify:
- [ ] Plan directory validated
- [ ] Artifact root created
- [ ] `manifest.json` initialized as `[]`
- [ ] `state.md` created with all phases listed as `pending`

Update `state.md`: set "Current phase" to `parse`.
