---
name: feature-implementation-workflow
description: "End-to-end workflow for implementing new features or modifying existing functionality in the Ralph Orchestrator codebase. Covers the full lifecycle: research, design, implementation, testing, documentation, and verification. Use this skill when starting a new feature, adding a new service or component, modifying existing behavior, fixing bugs that require multi-file changes, or when you want a checklist for implementation completeness. Triggers on: implement feature, add new, build this, full implementation, where do I start, implementation checklist, what files need changing."
---

# Feature Implementation Workflow

Sequential phases for implementing features in the Ralph Orchestrator codebase. Each phase references a detailed skill or instruction for the specifics — this skill provides the sequence and decision points.

## Phase 1: Research & Context Gathering

**Goal:** Understand what exists before changing anything.

1. Read the relevant source files — never propose changes to code you haven't read
2. Trace the data flow: where does input come from, what transforms it, where does output go
3. Identify all touch points: config schemas, types, service classes, DI registration, tests, docs
4. Check for existing patterns that solve similar problems — follow them

**Key reference:** Use `Explorer.subagent` for broad codebase exploration when you're unsure which files are involved. Check the `.github/instructions/meta.instructions.md` for coding conventions that must be followed.

### Decision point

Before proceeding, you should be able to answer:
- Which files need changing?
- Which interfaces/types are affected?
- Does this need new DI registrations in `awilix-cradle.ts`?
- Does this touch config schemas (`src/config/schemas.ts`, `src/config/types.ts`)?

## Phase 2: Types & Interfaces

**Goal:** Define the contract before the implementation.

1. Add or modify types in `src/config/types.ts` (for config) or the relevant module's types file
2. If adding a new service, define the `I`-prefixed interface in the same file as the class
3. Update Zod schemas in `src/config/schemas.ts` if config structure changes
4. Use `enum` for fixed string sets — never bare string literal unions

**Key reference:** See `DEPENDENCY-INJECTION.md` for the interface/class convention. See `src/config/schemas.ts` for Zod schema patterns.

## Phase 3: Implementation

**Goal:** Write the code.

1. Implement the feature following existing patterns in the codebase
2. Accept a `Logger` parameter in any module doing I/O or orchestration
3. Register new services in `src/awilix-cradle.ts` (the sole composition root)
4. All imports use `.js` extensions (ESM/NodeNext resolution)
5. Never re-export — update original import sites instead

**Key references:**
- **stage-pipeline** skill — when modifying the execution pipeline, stage modes, or executor creation
- **local-dashboard** skill — when adding dashboard features or live monitoring
- **mcp-builder** skill — when creating or modifying MCP servers

### Decision point

If the feature involves Docker compose changes, profile config, or container setup:
- Does it need compose overlay changes? → `src/container/setup/compose-overlay.ts`
- Does it need lifecycle hook changes? → `src/container/lifecycle.ts`
- Does it affect profile setup? → `src/container/setup/profile-setup.ts`

## Phase 4: Testing

**Goal:** Verify behavior through the public API.

1. Create or update test files in `tests/` mirroring the `src/` structure
2. Use existing factories from `tests/helpers/` — check what's available before creating new ones
3. Follow **behavior-testing** principles throughout

**Key references:**
- **behavior-testing** skill — test observable outputs, not internal call chains
- **test-structure-patterns** skill — organize by behavior, use Given/When/Then, name tests as sentences
- **test-mocking-strategy** skill — mock at architectural boundaries only, prefer fakes over elaborate mock setups
- `testing.instructions.md` — ESM mocking patterns, factory naming, retry delay injection

### Checklist

- [ ] Tests cover the happy path through the public API
- [ ] Tests cover error/edge cases (invalid input, missing config, failures at boundaries)
- [ ] Test names describe behaviors, not method names
- [ ] Mocks are only at architectural boundaries (execa, fs, fetch, DB)
- [ ] No assertions on internal call ordering or private method invocations
- [ ] Tests survive if you refactor internals without changing the contract

## Phase 5: Verification

**Goal:** Ensure nothing is broken.

```bash
npx tsc --noEmit                          # Source compilation
npx tsc --noEmit -p tests/tsconfig.json   # Test compilation
npx eslint .                              # Lint
npx vitest run                            # Full test suite
```

All four must pass before proceeding. Fix any failures — don't skip them.

**Key reference:** **tsx-scripts** skill — for running ad-hoc TypeScript scripts to debug or inspect runtime behavior during verification.

## Phase 6: Documentation

**Goal:** Keep docs in sync with code.

Update **all** documentation that references the changed behavior. The canonical list:

| Document | What to update |
|---|---|
| `ARCHITECTURE.md` | System overview, component descriptions, design decisions |
| `CONFIGURATION.md` | Config fields, schemas, profile options |
| `README.md` | Responsibility table, output layout, quick-start |
| `.github/copilot-instructions.md` | Source directory map, profile infrastructure, conventions |
| `CLAUDE.md` | Key files table, architecture summary, conventions |
| `DATAFLOW.drawio` | Visual dataflow diagram (XML) |
| `SECURITY.md` | If security boundaries change |
| `MCP.md` | If MCP server config changes |
| `docs/` | Domain-specific docs (agent templates, compose layering, etc.) |

### Checklist

- [ ] All docs referencing changed behavior are updated
- [ ] No stale references to removed code/files/config
- [ ] New config fields are documented with types and defaults
- [ ] New design decisions are recorded in ARCHITECTURE.md

## Phase 7: Final Verification

Run the full pipeline one final time after doc changes:

```bash
npx tsc --noEmit && npx tsc --noEmit -p tests/tsconfig.json && npx vitest run
```

This catches any doc-adjacent code issues introduced during the documentation phase.
