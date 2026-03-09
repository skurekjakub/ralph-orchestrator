# Phase C: Orchestrator Routing Update

**Repo:** `ralph-orchestrator`
**Depends on:** Phase B (coder subagent template must exist)
**File:** `profiles/ralph-docs/agents/ralph.ralph.agent.md`

## Step 4: Add `ralph-coder` to orchestrator

### Subagent table addition

Add `ralph-coder` to the subagent dispatch table:

| Agent | Role | Result codes |
|-------|------|-------------|
| `ralph-coder` | Bootstraps codesamples .NET project when `xpversion` trigger param is provided | `bootstrapped` → proceed to researcher; `failed` → exit with error |

### Conditional dispatch rule

Add a new conditional dispatch block:

> **When `triggerParams.codesamples` AND `triggerParams.xpversion` are both set:**
> 1. Dispatch `ralph-coder` with the bootstrap task BEFORE `ralph-researcher`
> 2. Wait for `status.json` result:
>    - `bootstrapped` → proceed to normal flow (researcher → writer → review)
>    - `failed` → write `===RALPH_RESULT_START===` error block and exit

This condition is important — `codesamples` alone (without `xpversion`) should NOT trigger the coder. The coder only runs when a specific version to install is provided.

### Updated phase flow

The orchestrator's phase sequence becomes conditional:

**Without codesamples/xpversion (default):**
```
Setup → Research → Write → Review → Commit → PR → Handoff
```

**With codesamples + xpversion:**
```
Setup → Coder (bootstrap) → Research → Write → Review → Commit → PR → Handoff
```

### Error handling

If coder returns `failed`:
- Read `status.json` summary for the failure reason
- Write a result block with `status: "error"` and include the coder's summary
- Do NOT proceed to researcher (the project is in an unknown state)
