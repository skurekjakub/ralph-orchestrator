# Produced System Task Graph

**Goal**: Make the Fractal Factory produce agent systems that use a `task-graph.json` for dependency-gated execution — mirroring the pattern used by the migration fractal (`.fractals/migration/`).

## Current State

The factory produces agent systems where:
- The **execution coordinator** does a simple routing table loop: dispatch writer → reviewer → next writer, with per-task tracking via inline status.json routing
- The **production-graph.json** exists only inside the factory itself as the factory's internal execution state — it is NOT part of the produced output
- The **produced-agent.schema.md** defines coordinators with status-based routing tables (read child status.json → dispatch next)
- The **slice/task planner** role doesn't exist in the produced system template — planning directly populates the roster

## Desired State

Produced systems follow the migration fractal's pattern:
- A **planner specialist** decomposes discovery/analysis outputs into a `task-graph.json` with dependency edges, acceptance criteria, and inline invariants
- The **execution coordinator** selects tasks from the task graph by dependency readiness (all `dependsOn` verified), dispatches coder→reviewer per task, updates task status in the graph
- The **orchestrator** recomputes progress counts from the task graph's `summary.byStatus`
- **Gap hunters** produce a side-channel gap report — they find flaws but do not mutate the task graph themselves (single-responsibility: find flaws, not plan fixes)
- The **planner specialist** is re-dispatched after gap hunting to read the gap report and mutate the task graph (add new tasks, revise existing ones) — the planner has the full context from discovery, analysis, and invariants
- The **session orchestrator** uses task graph summary counts for progress recomputation

## Reference Implementation

**`.fractals/migration/`** is the reference. Key agents:
- `migration-slice-planner` — creates `task-graph.json` from feature inventory + behavior matrix + dependency graph
- `migration-execution-coordinator` — dependency-gated task selection, coder→reviewer→test-writer loop per slice
- `migration.agent.md` (orchestrator) — reads task-graph.json for progress recomputation
- `migration-gap-hunter` — finds missed items, writes them to a gap report (triggering planner re-dispatch to update the task graph)

## Design Decisions

1. **task-graph.json, not production-graph.json** — The produced system's artifact is `task-graph.json` (matching migration convention), not `production-graph.json` (which is the factory's internal artifact). This avoids confusion between the factory's execution state and the produced system's execution state.

2. **Schema convergence** — The `task-graph.json` schema for produced systems is a simplified, domain-generic version of the migration's format. The factory's `production-graph.schema.md` informs it but is not identical (the factory's version has factory-specific fields like `rosterAgentIds` and `verificationHooks`). Uses `tasks` array (not `slices`).

3. **Planner is always produced** — Every produced system gets a task-graph planner specialist. For simple systems (few agents), the planner still runs but produces fewer tasks. This is consistent with the factory's own structure and the orchestrator skill's "always include Pass 3" guidance.

4. **Execution coordinator pattern change** — The produced execution coordinator shifts from "dispatch each child sequentially" to "select eligible task from graph, dispatch coder→reviewer loop for it, advance". This is the biggest behavioral change.

5. **Gap hunter single-responsibility** — Gap hunters ONLY find flaws and produce a gap report. They do NOT mutate the task graph. The planner specialist is re-dispatched to read the gap report and update the task graph. This preserves clean separation: hunters find, planners plan.

6. **Backward compatibility** — Existing produced systems in the repo (migration, etc.) won't be retroactively changed. Only new factory runs produce the updated pattern.

## Scope

| In scope | Out of scope |
|---|---|
| `produced-agent.schema.md` — add execution coordinator graph-driven pattern | Retrofit existing fractals (migration already has it) |
| `produced-agent-template.md` — update coordinator/orchestrator variants | Changes to the factory's own production-graph.json |
| `production-graph-planner` — update to include planner specialist in output | New MCP servers or external integrations |
| `routing-planner` — update loop coordinator routing to reference task-graph | Dashboard changes |
| `roster-planner` — require planner specialist when Pass 3 is included | |
| `prompt-writer` — awareness of task-graph-driven coordinator patterns | |
| `prompt-reviewer` — validate graph-driven routing tables | |
| Skill reference: `agent-fractal-orchestrator-architecture` — update artifact contracts and pipeline-design | |
| New schema: `produced-task-graph.schema.md` — the task graph schema for produced systems | |

## Phases

1. **Foundation** — New `produced-task-graph.schema.md`, update `artifact-contracts.md`
2. **Schema + Template** — Update `produced-agent.schema.md` and `produced-agent-template.md` for graph-driven execution
3. **Factory Agents** — Update production-graph-planner, routing-planner, prompt-writer, prompt-reviewer
4. **Skill Updates** — Update `agent-fractal-orchestrator-architecture` skill references
5. **Documentation + Verification** — README, consistency check
