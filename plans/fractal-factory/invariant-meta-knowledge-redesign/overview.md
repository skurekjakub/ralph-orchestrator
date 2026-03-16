# Fractal Factory — Invariant Meta-Knowledge Redesign Overview

## Goal

Refine the Fractal Factory meta-knowledge design so cross-run memory stores only tightly curated, reusable invariant heuristics and process patterns, not raw domain-local invariant inventories.

## Problem Statement

The current meta-knowledge wording is close to correct, but it still leaves too much room for signal analyzers and integrators to persist invariant-oriented signals that are really specific to a single domain run. That is the wrong persistence boundary for a factory whose produced agent families operate under different domain rules.

The redesign needs to make three boundaries explicit:

1. Raw invariants belong to run-local artifacts such as `domain-model.json`, behavior matrices, or task graphs.
2. Cross-run memory should keep only reusable invariant-handling knowledge: extraction heuristics, verification heuristics, failure modes, and curation rules.
3. Any exception that preserves invariant-related knowledge across runs must be aggressively abstracted and quality-gated so it is no longer a domain fact.

## Desired End State

After this change:

- The meta-knowledge reference architecture explicitly forbids persisting raw per-domain invariant inventories.
- The synthesis prompt templates for produced systems steer analyzers toward reusable patterns rather than domain facts.
- The Fractal Factory's own signal analyzers and knowledge integrator reject raw domain-local invariant signals and accept only abstracted invariant heuristics.
- The README and architectural docs describe meta-knowledge as curated cross-run strategy, not accumulated domain rules.

## Key Design Decisions

1. **Run-local invariants stay in domain artifacts.** Discovery, planning, execution, verification, and gap hunting continue to use per-run invariant artifacts.
2. **Cross-run memory stores meta-patterns only.** The persistent store keeps guidance about how to discover, test, and audit invariants, not the invariant content itself.
3. **Tightly curated exception path.** Invariant-related signals may persist only if they are generalized into reusable heuristics or recurring failure modes with clear actionability.
4. **Prompt-level enforcement first.** Start by tightening architecture docs and synthesis prompts before changing broader factory behavior.

## Phases

| Phase | Title | Purpose |
|---|---|---|
| 1 | Architecture Boundary | Update docs to state the correct persistence boundary for invariants |
| 2 | Prompt Constraint Rollout | Change signal-analyzer and integrator prompts to reject raw invariant inventories |
| 3 | Template Alignment | Update produced-system meta-knowledge templates and top-level docs to match |

## Risks

1. Overcorrecting could make analyzers stop extracting useful invariant-related learning entirely.
2. Leaving the wording vague will cause future prompt writers to reintroduce raw invariant persistence under different names.
3. Produced-system templates and the factory's own prompts can drift if only one side is updated.

## Acceptance Snapshot

- Docs say raw invariants are per-run domain data, not meta-knowledge.
- Signal analyzers are told to abstract invariant-related insights into heuristics or failure modes.
- Knowledge integrator quality gate explicitly rejects domain-local invariant inventories.
- Produced-system templates mirror the same rules.