# Phase 0: Scaffold

**Status:** not-started
**Agents:** none
**Dependencies:** none

## Objective

Create the `.migration/` directory structure and seed files so subsequent agents have a known filesystem layout.

## Deliverables

### Directory structure

```
.migration/
  agents/
  slices/
```

### Seed files

**`progress.json`**

```json
{
  "version": 1,
  "lastUpdated": null,
  "cycle": 0,
  "counts": {
    "featuresDiscovered": 0,
    "featuresAnalyzed": 0,
    "slicesPlanned": 0,
    "slicesImplemented": 0,
    "slicesVerified": 0,
    "slicesFailedParity": 0,
    "slicesBlocked": 0,
    "openRisks": { "critical": 0, "high": 0, "medium": 0, "low": 0 }
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "newItemsLastCycle": null,
    "newItemsHistory": []
  },
  "passStatus": {
    "discovery": "not-started",
    "semantics": "not-started",
    "planning": "not-started",
    "execution": "not-started",
    "verification": "not-started",
    "gapHunting": "not-started",
    "delivery": "not-started"
  }
}
```

**`migration-manifest.json`**

```json
[]
```

### What NOT to create

All other artifact files (`feature-inventory.json`, `behavior-matrix.json`, `dependency-graph.json`, `task-graph.json`, `risk-register.json`, `verification-matrix.json`, `rollback-plan.json`) are created by their owning agents on first write. Do not seed them.

## Implementation

Either:
- Create manually
- Write a `bootstrap.sh` script that creates the directories and writes the two seed files

## Verification

- [ ] `.migration/` directory exists
- [ ] `.migration/agents/` directory exists
- [ ] `.migration/slices/` directory exists
- [ ] `.migration/progress.json` is valid JSON with all fields at zero/null/not-started
- [ ] `.migration/migration-manifest.json` is `[]`
- [ ] No other artifact files exist yet
