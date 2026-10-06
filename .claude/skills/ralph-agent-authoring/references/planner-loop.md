# Adding a planner loop

A planner sits between the analyst/researcher and the coder/writer. It turns the plan into ordered task files, and the orchestrator runs a coder→reviewer loop **per task**. After all tasks, the planner runs once more to verify the result against the original spec and, if needed, emits gap-fill tasks.

Use it when one coder→reviewer pass over a whole plan keeps missing pieces. Don't use it for a simple new subagent; `subagent-wiring.md` covers that.

**Canonical implementations, to copy from rather than re-derive:**

- `profiles/ralph-vscode/agents/ralph.ralph-planner.agent.md` + `ralph.ralph.agent.md` (toggle `skip_planner`)
- `profiles/ralph-docs/agents/ralph.ralph-planner.agent.md` + `shared/skills/workflow/docs/ralph-workflow/references/`

## Decisions (ask in one `AskUserQuestion` batch; defaults in bold)

1. Target profile/family.
2. Granularity: fine (per file) / **feature (changes validated together)** / planner decides.
3. Max coder→reviewer rounds per task: 2 / **3**.
4. Toggle param that bypasses the planner: **`skip_planner`** / other / none.
5. Verification pass: **yes (max 2 planner passes)** / no.
6. Task `type` values for `tasks.json` (default `implementation`, `testing`, `refactoring`, `configuration`, `mixed`).
7. Copy the coder's architecture section into the planner: **yes** / no.
8. Revision mode: **fixes only** / full re-plan.

## Three-level iteration

```
Planner pass (max 2): 1 = plan, 2 = verify
  └─ Task progression: tasks.json in order
       └─ Per-task coder→reviewer loop (max N rounds; at the cap, accept and move on)
Pass 2 results: verified → Package | gaps_found → run new tasks → Package (no pass 3) | blocked → stop
```

The orchestrator tells the planner which pass it is on in the dispatch context. On the verification pass the planner re-reads the analyst spec, its previous `tasks.json`, and the latest coder/reviewer artifacts, and then inspects the actual code. If anything is missing, it writes **only** new task files and replaces `tasks.json` with them. Cross-task integration gaps, such as a definition added but never registered, are exactly what per-task reviewers miss.

## Planner prompt essentials

Result codes `planned` / `verified` / `gaps_found` / `blocked`. Artifacts under `{{ artifactDir }}/ralph-planner/`: `output.md`, `tasks.json` (`mode`, `task_count`, `tasks[]` with `id` `TASK-NN`, `title`, `path`, `depends_on`, `files`, `type`, plus the lifecycle fields the orchestrator updates), and `task-NN-<slug>.md` (Objective, Scope, Constraints, Execution Steps, Acceptance Criteria incl. build/lint/test). Rules: never implement code, never ask for human input, return `blocked` if the plan is too vague, no overlapping scope between tasks.

## Wiring edits (all planner text inside `{%- unless triggerParams.<toggle> %}`)

1. Create the planner `.agent.md` (copy a canonical one; adapt architecture, task types, constraints).
2. Orchestrator: add to `agents:` after the analyst; add a roster row; add a routing branch with rows for all four planner results and per-task coder/reviewer routing; add three-level iteration tracking; add planner `blocked` error handling; add "Never break analysis into tasks yourself — dispatch `ralph-planner`".
3. Keep the toggle-on (`{%- if triggerParams.<toggle> %}`) branch **identical** to the old analyst → coder → reviewer flow.
4. Workflow: phase tables (standard + revision) mention the planner dispatch and the per-task loop. The analyze reference dispatches the planner after the analyst. The implement-loop reference iterates `tasks.json`, scopes review to the current task, and dispatches the verification pass after the last task.
5. Coder: read the current task file from `{{ artifactDir }}/ralph-planner/` and implement only that task. Reviewer: review against that task's acceptance criteria. Scribe: list `ralph-planner/` artifacts.
6. Document the toggle in `docs/user-guide/trigger-parameters.md`.

## Validate

Every planner result has a route, in both toggle branches. Caps match the decisions. Coder, reviewer and scribe changes are all gated. Standard and revision tables are updated. With the toggle set, the old behaviour is unchanged. Then run the verification commands in SKILL.md.
