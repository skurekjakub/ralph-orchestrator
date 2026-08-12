# Migration vs Fractal Factory Workflow Comparison

## Executive Summary

The migration fractal and the fractal factory share the same high-level fractal shape: a session orchestrator routes multiple passes, coordinators dispatch specialists, artifacts accumulate across passes, and gap hunting can trigger re-entry. The important difference is what each system treats as its operational control plane.

Migration is task-graph-driven. Its planning phase produces an executable `task-graph.json`, and the rest of the workflow is organized around advancing individual slices through dependency-gated states. The graph is not just documentation of work; it is the work queue, dependency model, scope boundary, verification contract, and re-entry surface.

Fractal Factory is pipeline-and-roster-driven. Its planning phase produces `roster.json`, `architecture.json`, and `test-plan.json`, but execution is governed mainly by pass status in `progress.json` plus agent lifecycle state in `roster.json`. The roster describes what must be produced, but it is not an executable task graph in the same sense as migration's slices.

That is why migration feels more grounded in the task graph: the task graph is the central runtime object. In fractal-factory, the central runtime objects are pass state, coordinator routing, and batch status transitions.

## Shared Structural Pattern

Both systems use the same broad pattern:

- A pure session orchestrator routes passes rather than doing substantive work directly.
- Coordinators own pass-level sequencing and specialist dispatch.
- Specialists read and write shared JSON artifacts using read-modify-write discipline.
- Gap hunting can trigger iterative refinement and partial re-entry rather than full restart.
- Delivery happens only after the core production and verification phases complete.

This means the difference is not whether they are both fractal systems. They are. The difference is what the workflow is centered on once planning is complete.

## Migration: Task Graph As The Runtime Backbone

### Planning Output

Migration's planning flow turns discovered behavior into executable migration slices. The slice planner produces `.migration/task-graph.json`, and those slices are the actual units of execution.

Each slice carries the information needed to drive implementation directly:

- dependency edges through `dependsOn`
- execution state
- scope boundaries
- feature linkage
- invariants to preserve
- acceptance criteria
- rollback notes
- verification oracles

That gives migration a single artifact that simultaneously answers:

- what can run next
- what is blocked
- what done means for a slice
- what must be verified before dependents unlock
- what new work should look like if gaps are found

### Execution Model

The execution coordinator explicitly works slice by slice in task-graph order. It selects the first eligible slice whose dependencies are already verified, routes coder then reviewer, and only advances when that slice is approved. If review fails repeatedly, that slice becomes blocked. The unit of progress is therefore a concrete slice in the graph, not a generic pass counter.

This produces several strong properties:

- Dependency gating is explicit and local.
- The coder works from a bounded spec rather than broad pass intent.
- The reviewer validates against slice-level invariants and acceptance criteria, not just global architecture intent.
- Progress is naturally inspectable because the graph itself shows what is pending, implemented, verified, or blocked.

### Re-Entry And Evolution

Migration's gap hunting can add new slices back into `task-graph.json`. That is important because re-entry changes the executable plan itself, not only pass status. The graph evolves as understanding improves.

This makes migration's workflow operationally closed-loop:

1. Discover system behavior.
2. Convert it into slices.
3. Execute slices.
4. Verify slices.
5. Add or revise slices if gaps are found.

The same artifact remains the control plane across those steps.

## Fractal Factory: Pass State Plus Roster Status

### Planning Output

Fractal-factory planning produces a design package rather than an executable work graph:

- `architecture.json` defines passes, artifact flows, and depth decisions.
- `roster.json` defines the produced agent family: names, hierarchy, result codes, read/write responsibilities, and lifecycle status.
- `test-plan.json` defines golden scenarios.

These are strong design artifacts, but they do not become a task graph that execution walks item by item with dependency edges between produced outputs.

### Execution Model

Execution is controlled by the pass coordinator plus lifecycle state in `roster.json`.

The main loop is:

1. Select the next batch of produced agents from `roster.json`.
2. Run prompt-writer on that batch.
3. Run prompt-reviewer on that same batch.
4. Retry the batch up to the configured limit.
5. Mark exhausted batch members `blocked`.
6. Continue to later batches.
7. After prompt batches are done, run infra-writer.

This is a valid production workflow, but it is materially different from migration's slice graph:

- The unit of work is a produced agent prompt batch, not a graph node with explicit downstream dependencies.
- Dependencies are largely implicit in ordering conventions such as bottom-up roster order and pass sequencing.
- Review is primarily structural and contract-based against roster and architecture, not execution against per-item invariants in a graph node.
- Re-entry resets passes and targeted roster state, but does not mutate a first-class execution graph.

### Re-Entry And Evolution

Gap hunting in fractal-factory produces `gap-report.json` and recommends re-entry to pass 2 or pass 3. The orchestrator resets affected passes and deletes status files so coordinators can run again with gap context.

This is iterative, but it is still pass-centric. The gap report influences future planning and execution, yet there is no equivalent of migration adding new executable nodes into a persistent task graph. The system revisits stages of design rather than extending a runtime graph of work items.

## The Core Workflow Difference

The most important contrast is this:

- Migration plans executable work.
- Fractal-factory plans a producible system.

Migration's planner emits a graph of concrete implementation slices that the rest of the system executes directly.

Fractal-factory's planner emits architectural intent and an agent roster. Execution then uses a coordinator-managed batch loop to realize that design. The roster describes the target system; it is not itself a task graph for producing that system.

Another way to say it:

- In migration, planning and execution share the same dominant abstraction: slices in a task graph.
- In fractal-factory, planning and execution switch abstractions: planning speaks in architecture and roster terms, execution speaks in writer-reviewer batches and agent statuses.

That abstraction shift is the main reason migration feels tighter.

## Comparison By Dimension

| Dimension | Migration | Fractal Factory |
|---|---|---|
| Primary control plane | `task-graph.json` | `progress.json` plus `roster.json` |
| Planned unit of work | migration slice | produced agent definition |
| Execution unit | one eligible slice | one batch of produced agents |
| Dependency model | explicit `dependsOn` edges | implicit pass order and roster/bottom-up ordering |
| Definition of done | slice acceptance criteria and invariants | prompt passes review, then whole package passes verification |
| Re-entry mechanism | modify or add slices in task graph | reset passes and targeted roster/status state |
| Progress visibility | graph shows blocked, implemented, verified per slice | counts and statuses show designed, written, reviewed, verified per agent |
| Failure locality | one slice can block without collapsing the graph | one batch can block and later batches continue |
| Verification granularity | slice-level reviewer checks against local contract | package-level validators plus prompt batch review |

## Why Migration Feels Better Integrated With Work

Migration binds specification, execution, verification, and re-planning to the same object. A slice is simultaneously:

- the scope contract for the coder
- the review target for the reviewer
- the dependency unit for the coordinator
- the progress unit for the orchestrator
- the change surface for gap hunting

Fractal-factory spreads those concerns across several artifacts:

- `architecture.json` for system design
- `roster.json` for produced agent inventory and lifecycle
- `progress.json` for pass state
- `gap-report.json` for re-entry hints

That separation is not wrong, but it means there is no single artifact that plays the same unifying role as migration's task graph.

## What Fractal Factory Could Borrow From Migration

If the goal is to make fractal-factory feel more like migration operationally, the most promising direction is not changing the pass structure. It is introducing a first-class production graph between planning and execution.

That graph could describe produced work items such as:

- orchestrator prompt
- coordinator prompts
- specialist prompt groups
- workflow skill router
- per-specialist phase files
- schemas
- bootstrap and docs

Each node could carry:

- dependencies
- status
- acceptance criteria
- verification hooks
- affected artifacts
- retry history
- gap-hunting annotations

Then execution would advance graph nodes rather than batches inferred from roster state. The roster would still matter, but it would describe the target system while a production graph would describe the work required to realize it.

That would bring fractal-factory closer to migration's strongest property: one artifact that remains authoritative from planning through execution, review, and re-entry.

## Bottom Line

Migration works with the task graph because the task graph is the workflow.

Fractal-factory works through a pipeline because its workflow is distributed across pass routing, roster lifecycle, and batch coordination. It is better described as a staged production pipeline than as task-graph execution.

So the difference is not merely implementation detail. The two systems encode different philosophies:

- Migration centers executable work items.
- Fractal-factory centers staged synthesis of a designed artifact set.

That is why migration's workflow feels more tightly coupled to execution reality, while fractal-factory feels more like a controlled document-and-prompt manufacturing pipeline.