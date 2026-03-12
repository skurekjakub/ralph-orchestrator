# Phase 5: Report

## Before you begin

1. **Read `state.md`** at `.builder/artifacts/{plan-name}/state.md`
2. **Verify Phase 4 (Verify)** is complete — verifier has returned
3. **Confirm all prior phases** are recorded in `state.md`

## Instructions

### Dispatch the scribe

Delegate to the `builder-scribe` sub-agent. Pass:

```
Plan directory: {plan-path}
Artifact root: .builder/artifacts/{plan-name}
```

The scribe will:
- Read `manifest.json` for the full audit trail
- Read `state.md` for phase outcomes
- Read all subagent output artifacts
- Read the verifier's report
- Write the completion report to `.builder/artifacts/{plan-name}/scribe/output.md`
- Write status to `.builder/artifacts/{plan-name}/scribe/status.json`

### Read the result

After the scribe returns, read `.builder/artifacts/{plan-name}/scribe/status.json`.

| `result` | Action |
|---|---|
| `reported` | Print completion summary and exit |

### Print completion summary

After the scribe finishes, print a brief summary to the user:

```
Plan execution complete: {plan-name}
Phases: {completed}/{total} completed, {skipped} skipped, {failed} failed
Verification: {verified|issues}
Report: .builder/artifacts/{plan-name}/scribe/output.md
```

Get the phase counts from `state.md` (you already maintain this).

## Finalize

Update `state.md`:
- Set "Current phase" to `complete`
- Set "Overall" to `completed` (or `completed with issues` if verifier found issues or phases failed)
- Record final timestamp: run `date -u +%Y-%m-%dT%H:%M:%SZ`
