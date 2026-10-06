# Discovery Registry — Implementation Plan

## Goal

Give every leaf agent in the docwriter fractal pipeline a persistent, append-only channel to record out-of-scope discoveries — facts, gaps, or insights that don't fit the agent's current task scope but are valuable for the gap-hunting phase. A dedicated `discoveries/` directory replaces the dead `gaps`/`notes` fields in `writer-output.json` and extends the capability to all leaf agents, not just the content-writer.

## Problem Statement

1. **Content-writer's `gaps` field is dead.** It exists in the `writer-output.json` schema but the execution-coordinator never reads it. Discoveries made during writing are silently lost.
2. **No other leaf agent has any discovery mechanism.** Code-analyzer, impact-mapper, research-scout, and cross-ref-updater can observe things outside their scope but have nowhere to record them.
3. **Global agent outputs are fully overwritten.** A single `discoveries.json` registry would require read-merge-write, violating the agent pattern and risking corruption during multi-task execution.
4. **Gap-hunter (Pass 6) is the only discovery consumer** but currently operates only on what it can infer from comparing artifacts — it has no direct signal from the agents that actually touched the code/docs.

## Solution: Per-Invocation Discovery Files

A `discoveries/` directory under `.docwriter/` where each agent invocation writes a single file:

```
.docwriter/discoveries/{agent}--{context}--c{cycle}.json
```

- **No read-merge-write** — each invocation creates exactly one file, never reads or modifies others
- **Naturally append-only** — re-entry cycles produce new files (different `c{cycle}` suffix)
- **Gap-hunter globs all** — `discoveries/*.json` provides a complete picture
- **Bootstrap manages lifecycle** — `--clean` wipes the directory; fresh creates it

### File Naming Convention

| Segment | Source | Example |
|---------|--------|---------|
| `{agent}` | Agent short name | `code-analyzer`, `content-writer` |
| `{context}` | Task ID or `global` | `T-001`, `global` |
| `c{cycle}` | Pipeline cycle number from `progress.json` | `c1`, `c2` |

Examples:
- `code-analyzer--global--c1.json` (global agent, first cycle)
- `content-writer--T-003--c1.json` (per-task agent, first cycle)
- `impact-mapper--global--c2.json` (global agent, re-entry cycle)

### Discovery Entry Schema

```json
{
  "agent": "code-analyzer",
  "context": "global",
  "cycle": 1,
  "timestamp": "2026-03-15T10:30:00Z",
  "discoveries": [
    {
      "id": "DISC-001",
      "type": "undocumented-behavior | missing-coverage | stale-content | cross-cutting-concern | scope-expansion",
      "summary": "Brief description",
      "evidence": "What the agent observed that triggered this",
      "suggestedAction": "What should be done about it",
      "affectedArea": "Optional: file path or doc area",
      "severity": "high | medium | low"
    }
  ]
}
```

## Phases

| Phase | Name | Scope |
|-------|------|-------|
| 1 | Foundation | Bootstrap, discovery schema spec, directory lifecycle |
| 2 | Leaf Agent Wiring | Add discovery output to 5 leaf agents + execution-coordinator awareness |
| 3 | Gap-Hunter Consumption | Wire discoveries/ as a gap-hunter input source |
| 4 | Documentation & Routing | ROUTING-ARCHITECTURE.md, changelog, orchestrator data-flow updates |
| 5 | Verification | End-to-end consistency check across all modified agents |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Directory of files, not single registry JSON | Avoids read-merge-write, naturally append-only, no corruption risk |
| File-per-invocation naming | Unique by construction (agent + context + cycle), no collision possible |
| Content-writer `gaps`/`notes` fields removed | Discovery file replaces the dead channel entirely — no reason to keep fields nobody reads |
| Discoveries preserved across `--clean` | No — `--clean` wipes discoveries since they're cycle-specific, unlike meta-knowledge |
| Gap-hunter is the sole consumer | Keeps consumption centralized; other agents don't need to read discoveries |
| 5 agents get discovery output | code-analyzer, content-writer, impact-mapper, research-scout, cross-ref-updater — the "boots on the ground" |
