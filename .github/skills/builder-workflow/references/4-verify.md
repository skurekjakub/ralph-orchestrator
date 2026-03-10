# Phase 4: Verify

## Before you begin

1. **Read `state.md`** at `.builder/artifacts/{plan-name}/state.md`
2. **Verify Phase 3 (Execute)** is complete — all phases processed
3. **Review completed phases** — note how many completed vs skipped vs failed

## Instructions

### Dispatch the verifier

Delegate to the `builder-verifier` sub-agent. Pass:

```
Plan directory: {plan-path}
Artifact root: .builder/artifacts/{plan-name}
```

The verifier will:
- Read the planner's execution plan for the verification checklist
- Read `state.md` to understand which phases completed/skipped/failed
- Run each verification check
- Write results to `.builder/artifacts/{plan-name}/verifier/output.md`
- Write status to `.builder/artifacts/{plan-name}/verifier/status.json`

### Read the result

After the verifier returns, read `.builder/artifacts/{plan-name}/verifier/status.json`.

| `result` | Action |
|---|---|
| `verified` | Proceed to Phase 5 (Report) |
| `issues` | Proceed to Phase 5 (Report) — issues will be included |

**Do NOT read `output.md`** — you are a router. The scribe will read the verifier's output.

Note: The verifier never blocks the pipeline. Whether `verified` or `issues`, we always proceed to report.

## Before moving to the next phase

Update `state.md`:
- Set "Current phase" to `report`
- Set "Verification" → "Status" to the verifier's result (`verified` or `issues`)
- Add a note recording the verifier's summary from `status.json`
