# Invariant Meta-Knowledge Redesign Proposal

## Proposal

The Fractal Factory should treat invariants as run-local domain artifacts by default and should not accumulate raw invariant inventories across runs in `meta/`.

Cross-run memory should store only tightly curated invariant-related knowledge that survives abstraction, specifically:

- invariant extraction heuristics
- invariant verification strategies
- recurring invariant propagation failure modes
- decomposition or planning patterns that improve invariant coverage

## Why

Produced agent families are governed by different domain rules. A persistent store of raw invariants will quickly fill with domain-local facts that are not reusable across future runs. That degrades relevance scoring, increases noise in `knowledge-brief.json`, and turns `meta/` into a cache instead of a curated strategy layer.

The right abstraction boundary is:

- `domain-model.json`, task graphs, behavior matrices, and verification artifacts keep the actual invariants for the current run
- `meta/` keeps only reusable knowledge about how to find, preserve, test, and reason about invariants across runs

## Design Rules

1. Raw per-run invariant lists never enter `meta/`.
2. Invariant-related synthesis signals must be rewritten as reusable heuristics, strategies, or failure modes.
3. The quality gate rejects domain-local invariant catalogs even if they seem interesting.
4. Context-level invariant observations are retained only as process patterns, not rule inventories.
5. Produced-system meta-knowledge templates must enforce the same boundary as the factory's own prompts.

## Expected Outcome

This keeps cross-run memory small, reusable, and relevant. The factory remembers how to reason about invariants, not everyone else's invariants.