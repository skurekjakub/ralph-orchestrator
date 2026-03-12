# Phase 3: Execute (Phase Loop)

## Before you begin

1. **Read `state.md`** at `.builder/artifacts/{plan-name}/state.md`
2. **Verify Phase 2 (Parse)** is complete — planner returned `parsed`
3. **Read the planner's `status.json`** to confirm the execution plan is ready

## Instructions

### Get the phase list

Read `.builder/artifacts/{plan-name}/planner/output.md` **only for the Phase Execution Order table**. Extract:
- Phase IDs in execution order
- Phase file paths
- Target repos
- Dependencies between phases

This is the **only time** the orchestrator reads planner output — to determine the phase sequence.

### Execute each phase

For each phase in the execution order:

#### 1. Pre-checks

**Dependency check:** If this phase depends on another phase, check `state.md`:
- If the dependency completed → proceed
- If the dependency failed or was skipped → mark this phase as `skipped (dependency failed)`, continue to next

**Cross-repo check:** If the phase targets an external repo:
- Check if the repo path exists on the filesystem
- If accessible → proceed, pass repo path to implementer
- If not accessible → mark as `skipped (repo not accessible)`, continue to next

#### 2. Create phase artifact directory

```
.builder/artifacts/{plan-name}/phases/{phase-id}/
├── implementer/
└── reviewer/
```

#### 3. Dispatch builder-implementer (iteration 1)

Pass to the implementer:
```
Plan directory: {plan-path}
Phase file: {plan-path}/{phase-filename}
Phase ID: {phase-id}
Artifact root: .builder/artifacts/{plan-name}
Phase artifact directory: .builder/artifacts/{plan-name}/phases/{phase-id}
Iteration: 1
Target repo: {repo-path or "this repo"}
```

#### 4. Read implementer result

Read `.builder/artifacts/{plan-name}/phases/{phase-id}/implementer/status.json`:

| `result` | Action |
|---|---|
| `implemented` | Dispatch builder-reviewer |
| `partial` | Dispatch builder-reviewer (partial may still pass) |
| `failed` | Mark phase as `failed` in state.md, continue to next phase |

#### 5. Dispatch builder-reviewer

Pass to the reviewer:
```
Plan directory: {plan-path}
Phase file: {plan-path}/{phase-filename}
Phase ID: {phase-id}
Artifact root: .builder/artifacts/{plan-name}
Phase artifact directory: .builder/artifacts/{plan-name}/phases/{phase-id}
Iteration: 1
Target repo: {repo-path or "this repo"}
```

#### 6. Read reviewer result

Read `.builder/artifacts/{plan-name}/phases/{phase-id}/reviewer/status.json`:

| `result` | Iteration | Action |
|---|---|---|
| `approved` | any | Mark phase complete, continue to next phase |
| `needs-revision` | 1 | Re-dispatch implementer (iteration 2) |
| `needs-revision` | 2 | Accept as-is, mark phase complete with `warnings: true` |

#### 7. Re-dispatch implementer (if needed, iteration 2)

Pass the same parameters as step 3 but with:
```
Iteration: 2
Review feedback at: .builder/artifacts/{plan-name}/phases/{phase-id}/reviewer/output-v1.md
```

Then re-dispatch reviewer (step 5) with `Iteration: 2`.

If the reviewer still says `needs-revision` at iteration 2, accept the implementation and move on.

#### 8. Update state.md

After each phase, update the phases table in `state.md`:
- Set phase status: `completed`, `completed (warnings)`, `skipped`, or `failed`
- Record iteration count
- Add any relevant notes

### After all phases

Update `state.md`:
- Set "Current phase" to `verify`

## Key rules

- **Maximum 2 iterations per phase** — never re-dispatch the implementer more than twice
- **Never skip the reviewer** — even for `partial` implementation results, the reviewer should verify
- **Always update state.md** — after every phase transition
- **Cross-repo phases**: pass the repo path so the implementer works in the right directory
- **Failed dependencies cascade** — if phase A fails and phase B depends on A, skip B

## Before moving to the next phase

Verify:
- [ ] All phases in the execution order have been processed
- [ ] `state.md` reflects the current status of every phase
- [ ] No phase was skipped without recording the reason

Update `state.md`: set "Current phase" to `verify`.
