---
name: feature-task-planning
description: "Structured planning methodology for complex multi-file feature work. Decomposes a feature into phase specification files (detailed design per phase) and a task-graph JSON (discrete, ordered, dependency-tracked tasks with acceptance criteria). Use this skill whenever planning work that spans 5+ files, involves multiple agents or components, requires phased rollout, or needs an explicit execution order. Also use when the user says 'plan this', 'make a task graph', 'break this down into phases', or 'create an implementation plan'."
---

# Feature Task Planning

A two-artifact planning methodology that separates *design* (phase specs) from *execution tracking* (task graph). The combination gives you detailed reasoning about each phase plus a machine-parseable, dependency-aware execution plan.

## When to Use This

- Feature spans 5+ files or touches multiple subsystems
- Work has natural phases (foundation → core → integration → docs)
- Tasks have dependencies that constrain execution order
- You need crash-resumable progress tracking (task statuses)
- Multiple people (or future-you) need to understand the plan

Don't use this for quick single-file changes or exploratory work.

## Artifact Pair

| Artifact | Format | Purpose |
|---|---|---|
| Phase specs | `plans/<feature>/phase-N-<name>.md` | Deep design: rationale, code snippets, schemas, edge cases, acceptance criteria |
| Task graph | `plans/<feature>/task-graph-<family>.json` | Flat task list with IDs, prerequisites, targets, status tracking, execution order |

The phase specs are the *why and how*. The task graph is the *what and when*.

## Workflow

### Step 1: Scope Discovery

Before writing anything, gather enough context to define phases. Interview the user or analyze the codebase:

1. **What's the goal?** One sentence describing the end state.
2. **What exists today?** Read the files/systems that will be modified.
3. **What are the subsystems?** Group changes by area (infra, core logic, integration, docs).
4. **What are the dependencies?** Which changes must land before others?
5. **What are the constraints?** Backward compatibility, no new agents, performance budget, etc.

Write a brief `plans/<feature>/overview.md` if the feature is complex enough to warrant a high-level summary separate from the phases.

### Step 2: Phase Decomposition

Split the work into numbered phases. Each phase should be:
- **Independently comprehensible** — a reader can understand Phase 3 without reading Phase 2
- **Dependency-ordered** — Phase N's outputs are consumed by Phase N+1 (mostly)
- **Testable** — you can verify that a phase is correctly implemented

The typical phase progression (adapt as needed):

| Phase | Pattern | Example |
|---|---|---|
| 1 | Foundation / Infrastructure | Bootstrap scripts, directory scaffolds, seed files |
| 2–N | Core feature work | New components, modified components, integration wiring |
| N+1 | Cross-cutting concerns | Invariant rollout, schema extensions, shared patterns |
| N+2 | Documentation | Guide updates, architecture doc updates, header comments |
| N+3 | Verification | End-to-end consistency checks |

### Step 3: Write Phase Specs

For each phase, create `plans/<feature>/phase-N-<name>.md` following this structure:

```markdown
# Phase N: <Name>

**Goal**: One sentence.
**Dependencies**: Which phases must be complete first.
**Outputs consumed by**: Which later phases use this phase's outputs.

---

## Tasks

### N.1 — <Task Title>

**File**: `path/to/target`

<Rationale — why this change is needed>

**Changes**:

1. <Specific change with code snippets, schemas, or examples>
2. ...

**Acceptance Criteria**:
- [ ] Criterion 1
- [ ] Criterion 2

### N.2 — <Task Title>
...
```

Phase spec guidelines:
- Include actual code snippets, JSON schemas, and file paths — not vague descriptions
- Document design decisions and their rationale inline (or in a `designDecisions` block)
- Call out edge cases: what happens when X is missing, what's the failure mode, what's the fallback
- Cross-reference other phases when tasks produce artifacts consumed downstream
- Keep each phase spec self-contained enough that an implementer can work from it alone

### Step 4: Build the Task Graph

After all phase specs are written, create `plans/<feature>/task-graph-<family>.json`. This is a structured JSON file that flattens all phase tasks into a single ordered list with explicit dependencies.

Read `references/task-graph-schema.md` for the complete JSON schema. Key principles:

1. **Every task has a unique ID** — use a prefix + sequential number (e.g., `M-001`, `D-001`, `O-001`)
2. **Every task references its phase spec** — `ref` field points to the section (e.g., `phase-3-research-scout.md § 3.1`)
3. **Prerequisites are explicit** — `prerequisites` array lists task IDs that must complete first
4. **Acceptance criteria are concrete** — verifiable statements, not vague goals
5. **Execution order is derived** — the `executionOrder` block groups tasks into steps, noting which can run in parallel

The task graph header includes metadata: version, family name, description, summary counts, assumptions, and (optionally) design decisions. The `summary` block gives a quick overview of scope (total tasks, phases, new files, modified files).

### Step 5: Debrief & Refinement Loop

After producing the phase specs + task graph, present the plan to the user for review. This is the critical quality gate — the plan should be scrutinized before any implementation begins.

Present:
1. **Executive summary** — total tasks, phases, key design decisions
2. **Phase-by-phase walkthrough** — one paragraph per phase summarizing what it does and why
3. **Dependency highlights** — any non-obvious ordering constraints
4. **Risk areas** — phases or tasks that are complex, uncertain, or have broad blast radius
5. **Open questions** — anything you're unsure about

Then ask for feedback:
- "Does this phasing make sense? Should any phases be split or merged?"
- "Are there missing tasks or unnecessary ones?"
- "Do the design decisions align with your intent?"
- "Any constraints I missed?"

Iterate until the user approves. Each iteration:
1. Incorporate feedback into the phase specs
2. Update the task graph to reflect changes (task additions, removals, reordering)
3. Re-present the updated plan

Do not begin implementation until the user explicitly approves the plan.

### Step 6: Implementation

Execute tasks in the order specified by `executionOrder.steps`. For each step:

1. Mark the task(s) as `in-progress` in a todo list
2. Read the corresponding phase spec section for detailed implementation guidance
3. Implement the changes
4. Verify against acceptance criteria
5. Mark the task as `completed`

After each phase completes, do a brief checkpoint with the user if the feature is large.

When all tasks are complete, mark the task graph's statuses as `"implemented"` and add `implementedAt` and `implementationStatus: "complete"` to the header.

## Splitting Into Multiple Task Graphs

For very large features, split into multiple task graph files in the same `plans/<feature>/` directory:

- `task-graph-manual.json` — changes applied directly (e.g., editing agent files)
- `task-graph-orchestrator.json` — changes requiring orchestrator infrastructure
- `task-graph-<variant>.json` — any other logical grouping

Each graph is independent but can reference the same phase specs. Document the split rationale in an `overview.md` or `dual-family-architecture.md` file.

## Status Lifecycle

Task statuses track progress:

```
not-started → in-progress → implemented
                          → blocked (with reason)
                          → deferred (moved to follow-up)
```

Graph-level status:
```json
{
  "implementationStatus": "complete",
  "implementedAt": "2026-03-13"
}
```

## Tips

- **Phase specs are the source of truth for design**; the task graph is the source of truth for execution order and status.
- **Err toward more tasks, not fewer.** A task that touches 3 files is fine. A task that touches 15 files should be split.
- **Prerequisites should be minimal.** Only list the tasks that *must* complete before this one can start. Don't chain everything linearly if tasks can run in parallel.
- **Acceptance criteria should be verifiable.** "Agent file exists with correct frontmatter" not "agent works correctly."
- **Design decisions in the task graph** are for decisions that affect the whole graph. Per-task decisions go in the phase spec.
