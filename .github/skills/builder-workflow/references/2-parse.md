# Phase 2: Parse

## Before you begin

1. **Read `state.md`** at `.builder/artifacts/{plan-name}/state.md`
2. **Verify the current phase** — this skill is for Phase 2 (parse). If `state.md` shows a different phase, update it.
3. **Confirm Phase 1 (Setup)** is complete — artifact dirs exist, `manifest.json` and `state.md` are initialized.

## Instructions

### Dispatch the planner

Delegate to the `builder-planner` sub-agent. Pass:

```
Plan directory: {plan-path}
Artifact root: .builder/artifacts/{plan-name}
```

The planner will:
- Read `00-overview.md` and all phase files
- Extract the phase execution order, file manifest, decisions, and verification checklist
- Write the structured execution plan to `.builder/artifacts/{plan-name}/planner/output.md`
- Write status to `.builder/artifacts/{plan-name}/planner/status.json`

### Read the result

After the planner returns, read `.builder/artifacts/{plan-name}/planner/status.json`.

| `result` | Action |
|---|---|
| `parsed` | Proceed to Phase 3 (Execute) |
| `invalid` | Print the planner's summary, stop execution |

**Do NOT read `output.md`** — you are a router. The implementer reads the planner's output directly.

### On invalid

If the planner returns `invalid`:
1. Update `state.md`: set "Overall" to `failed`
2. Print error to user:
   ```
   Plan parsing failed: {summary from status.json}
   ```
3. Stop execution — do not proceed to Phase 3

## Before moving to the next phase

Update `state.md`:
- Set "Current phase" to `execute`
- Add a note recording the planner's status summary
