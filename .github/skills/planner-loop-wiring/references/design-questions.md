# Design Questions

Run these questions with the user via `ask_questions` before implementing the planner loop. Group them into a single ask_questions call — the user answers all at once.

## Required Questions

These must be answered explicitly. Do not proceed without them.

### 1. Target profile

> Which profile directory should the planner be added to? (e.g., `profiles/ralph-vscode/`)

Follow-up: read the orchestrator and all subagent files in that profile to understand the current pipeline before continuing.

### 2. Task granularity

> How granular should the planner break tasks? Choose one:
> - **Fine-grained** — one task per file or narrowly scoped change (e.g., "add tag definition", "register tag in init", "add grammar entry")
> - **Feature-grained** — one task per logical feature unit that should be validated together (e.g., "add tag definition + registration + grammar")
> - **Let the planner decide** based on complexity

Default recommendation: **feature-grained** — groups related changes that must be validated together while still keeping tasks small enough for reliable single-pass implementation.

### 3. Max revision rounds per task

> How many coder→reviewer rounds should be allowed per task before accepting as-is?
> - 2 (default for simple pipelines)
> - 3 (recommended for planner-driven pipelines — more tasks means each should get more focus)
> - Other number

Default recommendation: **3**.

### 4. Toggle parameter name

> What trigger parameter should disable the planner? This allows users to invoke the agent with the planner bypassed (e.g., `@RalphAutocomplete(skip_planner)` skips the planner).
> - `skip_planner` (recommended)
> - Other name
> - No toggle (planner always runs)

Default recommendation: **`skip_planner`** — wraps all planner sections in `{%- unless triggerParams.skip_planner %}`.

### 5. Verification pass

> Should the planner verify completeness after all tasks execute?
> - **Yes** (recommended) — after all planned tasks complete, the planner re-reads the analyst's spec and inspects the codebase to catch gaps. Max 2 planner passes.
> - **No** — planner runs once, no verification

Default recommendation: **Yes**.

## Optional Questions

Use recommended defaults if the user doesn't have a preference.

### 6. Task types

> What `type` values make sense for this project's tasks? Examples from the VS Code extension profile:
> - `implementation`, `testing`, `grammar`, `mixed`
>
> Suggest types that match the target repo's domain. The planner assigns a type to each task in `tasks.json`.

Default: infer from the target repo. Common set: `implementation`, `testing`, `refactoring`, `configuration`, `mixed`.

### 7. Architecture context

> Should the planner include an architecture overview of the target repo in its prompt? (Recommended — helps the planner make informed decomposition decisions.)
> - **Yes** — copy/adapt the architecture section from the existing coder agent
> - **No** — the planner relies on the analyst's output only

Default recommendation: **Yes**.

### 8. Revision mode scoping

> In revision mode (re-run after reviewer feedback), should the planner re-plan the entire task or scope revision tasks to only the required fixes?
> - **Fixes only** (recommended) — smaller tasks, faster iterations
> - **Full re-plan** — treats the revision like a new analysis

Default recommendation: **Fixes only**.

## How to Use This Question Set

1. Read all required questions and prepare a single `ask_questions` call
2. Include the recommended defaults in the question text so the user can accept or override
3. Wait for the user's answers
4. If any required answer is missing or ambiguous, ask a targeted follow-up
5. Record answers in your working notes — reference them during implementation

Example `ask_questions` call:

```
I need a few design decisions before wiring the planner loop. Here are the questions — you can accept the recommended defaults or override:

1. **Target profile**: Which profile? (e.g., profiles/ralph-vscode/)
2. **Task granularity**: Fine-grained (per-file), feature-grained (per-feature unit, recommended), or let planner decide?
3. **Max rounds per task**: 2, 3 (recommended), or other?
4. **Toggle parameter**: `skip_planner` (recommended) or other name?
5. **Verification pass**: Yes (recommended, 2-pass max) or no?
6. **Task types**: What types suit this repo? (default: implementation, testing, refactoring, configuration, mixed)
7. **Architecture context in planner**: Yes (recommended) or no?
8. **Revision mode**: Fixes-only (recommended) or full re-plan?
```
