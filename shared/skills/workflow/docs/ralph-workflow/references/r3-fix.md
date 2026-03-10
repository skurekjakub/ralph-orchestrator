{%- if isRevision %}
# Revision Phase 3: Implement Fixes

## Before you begin

1. **Read `state.md`** at `.ralph/tasks/{{ taskId }}/state.md`
2. **Verify the current phase** — this skill is for Revision Phase 3. If `state.md` shows a different current phase, update it now.
3. **Review the "Feedback Items" section** — these are the specific issues to address.

## Phase 3: Implement Fixes

Dispatch **ralph-planner** first to break revision feedback into headless fix tasks, then dispatch **ralph-writer** to execute the current fix task — do NOT restart from scratch.

Invoke the planner with a lean directive only. Do **not** paste reviewer comments, handoff text, or PR thread content into the dispatch prompt. The planner must read revision context from `.ralph/tasks/{{ taskId }}/state.md` and any reviewer artifacts already present in the artifact directory.

After the planner returns, read its `status.json`.

1. If `result: blocked`, record the planner `summary` in `state.md` and stop.
2. If `result: planned`, dispatch **ralph-writer** with a lean directive only. The writer must read revision context, planner tasks, and reviewer artifacts directly from the filesystem.
3. Preserve previous decisions unless explicitly contradicted by feedback.
4. `_guides` remains out of scope during revision work as well. If feedback asks for `_guides` changes, the writer should record that gap as follow-up work rather than implementing it in this workflow.
5. Require a passing build before the writer returns `task-implemented` or `all-tasks-implemented`.
6. If the task involves code samples (`.cs` files were modified), ensure the writer runs `npm run codesamples:build` and uses the **ralph-codesamples-verification** skill to verify changes before returning. If `triggerParams.xpversion` was set, the coder subagent already bootstrapped the project — do not re-run `npm run codesamples:setversion`.

{%- if triggerParams.skip_review %}

## Before moving to the next phase

Review was skipped for this task (`skip_review` parameter).

Update `state.md`:
- Add Revision Phase 3 to "Completed Phases" with the planner and writer summaries
- If `result: task-implemented`, append the current task to "Completed Tasks", clear "Current Task", and set "Current Phase" back to `Revision Phase 3: Implement Fixes`
- If `result: all-tasks-implemented`, append the current task to "Completed Tasks", clear "Current Task", and set "Current Phase" to `Revision Phase 5: Commit & Respond`
- If `result: partial`, set "Current Phase" to `Revision Phase 5: Commit & Respond`
- Check off addressed feedback items

{%- else %}

## Before moving to Revision Phase 4

Update `state.md`:
- Set "Current Phase" to `Revision Phase 4: Review`
- Add Revision Phase 3 to "Completed Phases" with the planner and writer summaries
- Update "Task Plan" with the planner summary and task index path
- Set "Current Task" to the task reported by the writer
- Check off addressed feedback items and record any still-open items explicitly

{%- endif %}
{%- else %}
<!-- This file is for the revision workflow. You are running a standard workflow — this file is intentionally empty. -->
{%- endif %}
