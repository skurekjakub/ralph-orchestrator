---
name: feature-implementation-workflow
description: "End-to-end workflow for implementing new features or modifying existing functionality in the Ralph Orchestrator codebase. Covers the full lifecycle: research, design, implementation, testing, documentation, and verification. Use this skill when starting a new feature, adding a new service or component, modifying existing behavior, fixing bugs that require multi-file changes, or when you want a checklist for implementation completeness. Triggers on: implement feature, add new, build this, full implementation, where do I start, implementation checklist, what files need changing."
---

# Feature Implementation Workflow

Sequential phases for implementing features in the Ralph Orchestrator codebase. Each phase references a detailed skill or instruction for the specifics — this skill provides the sequence and decision points.

### When NOT to use this skill

Skip this workflow for:
- Single-file bug fixes or typo corrections
- Doc-only changes (update the doc directly)
- Adding a test to existing coverage
- Changes that don't touch config schemas, DI, or cross-file contracts

If you can complete the change without needing to trace data flow or update interfaces, you don't need this workflow.

### Skills referenced by this workflow

| Skill | Used in | Purpose |
|---|---|---|
| **behavior-testing** | Phase 4 | Test observable outputs, not internal call chains |
| **test-structure-patterns** | Phase 4 | Organize by behavior, Given/When/Then, test naming |
| **test-mocking-strategy** | Phase 4 | Mock at boundaries only, prefer fakes |
| **stage-pipeline** | Phase 3 | Execution pipeline, stage modes, executor creation |
| **local-dashboard** | Phase 3 | Dashboard features, live monitoring |
| **mcp-builder** | Phase 3 | MCP server creation/modification |
| **tsx-scripts** | Phase 5 | Ad-hoc TypeScript scripts for debugging |

### Related documents

| Document | Role |
|---|---|
| `ARCHITECTURE.md` | Primary source for system design, component details, profile infrastructure tree, security |
| `CONFIGURATION.md` | Primary source for all config fields, env vars, schemas, runtime macros |
| `README.md` | Primary source for setup guide, output layout, responsibility split |
| `CLAUDE.md` | Key files table, architecture summary, conventions (for Claude Code) |
| `.github/copilot-instructions.md` | Source directory map, brief architecture summary (for GitHub Copilot) |
| `DEPENDENCY-INJECTION.md` | Interface/class convention, cradle as sole composition root |
| `SECURITY.md` | Threat model, network isolation, container hardening |
| `MCP.md` | MCP server architecture, compose merge, config structure |
| `docs/agent-templates.md` | Template authoring, rendering pipeline, `TemplateContext` variable reference |
| `docs/compose-layering.md` | Three-file compose merge pattern |
| `docs/multistage-pipelines.md` | Stage config fields, execution modes, stage context variables |
| `docs/data-source-registration.md` | Plugin pattern, factory registration, third-party integration |
| `docs/mcp-sidecar-design.md` | MCP isolation architecture, network topology |

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

Determine which documents are affected by your change, then update them. The table below is the canonical doc inventory — check each row against your change.

### Change-type quick checks

- **Added a file or directory?** → Update the source directory map in `.github/copilot-instructions.md` and `CLAUDE.md`
- **Changed config fields or env vars?** → Update `CONFIGURATION.md`, Zod schemas, and `config.json.sample`
- **Modified the execution pipeline?** → Update `ARCHITECTURE.md` component details and `docs/multistage-pipelines.md`
- **Changed compose infrastructure?** → Update `docs/compose-layering.md` and `SECURITY.md` if network/hardening changed
- **Added or modified trigger parameters?** → Update `docs/user-guide/trigger-parameters.md` and `CONFIGURATION.md`
- **Changed MCP server config?** → Update `MCP.md` and `CONFIGURATION.md` § MCP Servers
- **Changed agent template variables?** → Update `docs/agent-templates.md`

### Doc inventory — always check these

| Document | What to update |
|---|---|
| `ARCHITECTURE.md` | System overview, component details, profile infrastructure tree, security |
| `CONFIGURATION.md` | Config fields, env vars, schemas, profile options, runtime macros |
| `README.md` | Output layout, responsibility table |
| `.github/copilot-instructions.md` | Source directory map (primary), brief summaries (references other docs for detail) |
| `CLAUDE.md` | Key files table, architecture summary, profile structure |
| `DATAFLOW.drawio` | Visual dataflow diagram (XML — edit in draw.io) |
| `SECURITY.md` | Threat model, network isolation, container hardening |
| `MCP.md` | MCP server architecture, config structure |
| `docs/agent-templates.md` | Template variables, rendering pipeline |
| `docs/compose-layering.md` | Compose merge pattern |
| `docs/multistage-pipelines.md` | Stage fields, execution modes |
| `docs/data-source-registration.md` | Plugin integration guide |
| `docs/user-guide/trigger-parameters.md` | Orchestrator-level and template-level trigger params |

### Checklist

- [ ] All duplicated structures updated together (profile trees, env vars, conventions)
- [ ] No stale references to removed code/files/config
- [ ] New config fields documented in both types and CONFIGURATION.md
- [ ] New design decisions recorded in ARCHITECTURE.md

## Phase 7: Final Verification

Run the full pipeline one final time after doc changes:

```bash
npx tsc --noEmit && npx tsc --noEmit -p tests/tsconfig.json && npx vitest run
```

This catches any doc-adjacent code issues introduced during the documentation phase.
