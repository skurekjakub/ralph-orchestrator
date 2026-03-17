# Always-On Analysis Pass for Produced Agent Systems

## Goal

Make the Analysis pass (Pass 2) a **default-on** requirement for every agent system the fractal factory produces, rather than a conditional pass the pipeline-architect can freely skip. Every produced system works with some existing material (codebases, docs, APIs, specs), and that material has behavioral semantics worth extracting before planning.

## What Exists Today

The pipeline-architect decides per-domain whether to include Pass 2. The heuristic is soft:

> **Include 2 (Analysis) when:** The domain has behavioral rules, invariants, or semantics that must be extracted before planning. Skip when the domain is simple enough that discovery output is sufficient for planning.

This means the pipeline-architect can skip analysis whenever it judges the domain "trivially simple." In practice, agents underestimate domain complexity — a domain that looks simple at discovery time often reveals hidden behaviors during analysis. Skipping analysis produces shallow task graphs with no inline invariants, no dependency edges, and no acceptance criteria tied to actual behavior.

## What Changes

1. **Analysis becomes default-on.** The pipeline-architect must include Pass 2 unless it provides an explicit, documented justification. The burden of proof flips from "include if complex" to "skip only if provably unnecessary."

2. **The pipeline-design reference** gets a new "always include" tier: Analysis joins Discovery, Execution, and Delivery as a pass that requires active justification to skip.

3. **The produced-agent schema** gets analysis-specific specialist guidance — how to write analysis agents that extract behavioral properties from the domain's source material.

4. **The roster-planner** must always plan at least one analysis specialist plus one dependency analyzer when Pass 2 is present.

5. **The artifact-designer** must always design an `analysis-matrix.json` (domain-specific behavioral extraction output) and a `dependency-graph.json` when Pass 2 is present.

## Design Decisions

| Decision | Rationale |
|---|---|
| Default-on, not mandatory | A true greenfield generator with zero source material to analyze genuinely doesn't need Pass 2. But the architect must document why. |
| Skip requires explicit justification field | Forces the architect to reason about why analysis is unnecessary rather than silently omitting it. |
| Analysis matrix schema is domain-specific | Migration extracts state transitions; security extracts attack vectors; test gen extracts behavior. The categories vary, but the *structure* (per-item property extraction + invariants) is universal. |
| Invariants remain mandatory in analysis output | Even when the domain-specific categories vary, every analysis specialist must extract invariants. This is the one universal extraction target. |
| Dependency analyzer is always paired with analysis specialists | Understanding relationships between discovered items is universally valuable for planning. |

## Scope

| Area | Files Affected |
|---|---|
| Skill reference | `pipeline-design.md` |
| Factory agent — pipeline-architect | `fractal-factory-pipeline-architect.agent.md` |
| Factory agent — artifact-designer | `fractal-factory-artifact-designer.agent.md` |
| Factory agent — roster-planner | `fractal-factory-roster-planner.agent.md` |
| Produced system schema | `produced-agent.schema.md` |
| Produced system template | `produced-agent-template.md` |
