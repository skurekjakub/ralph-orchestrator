# Improvement Summary: All Subagents (DOC-3181)

## Changes Made

### 1. Add changed file list to reviewer dispatch prompts
- **File:** `shared/skills/workflow/vscode/vscode-workflow/references/3-implement-loop.md`
- **Finding:** Gap Identification > Dispatch Prompt Gaps > #1 ("Reviewer file list — Reviewer prompts should include the list of files changed by the coder so the reviewer can jump directly to reviewing them rather than discovering changes from the coder output")
- **Root cause:** Rule gap — the implement-loop skill reference told the orchestrator to dispatch the reviewer but did not instruct it to include changed file paths in the dispatch prompt
- **Change:** Added `git diff --name-only` pre-dispatch step to **both** reviewer dispatch sections (skip_planner Step 3 and planner-mode Step 3). The orchestrator now runs this command before dispatching and includes the file list in the reviewer's prompt. This is orchestrator-safe (git operations are in the "What you do yourself" scope) and maintains purity (no output.md reading).

### 2. Add `node -e` preference and `git diff` guidance to orchestrator template
- **File:** `profiles/ralph-vscode/agents/ralph.ralph.agent.md`
- **Finding:** Orchestrator Analysis > Error Recovery (#3) and Improvement Suggestion #3 ("Detect python3 availability / wasted 1 tool call on python3 -c before falling back to node -e")
- **Root cause:** Agent behavior gap — the orchestrator had no explicit guidance on which runtime to use for JSON manipulation. It tried `python3` first (not available in the container), wasting one tool call before falling back to `node -e`.
- **Change:** Added "Administrative utilities" subsection under "What you do yourself" with two explicit directives: (1) always use `node -e` for JSON manipulation, never `python3`; (2) run `git diff --name-only` before reviewer dispatch. This codifies the lesson learned from this run so future sessions never waste a tool call on python3.

### 3. Add time-budget awareness to orchestrator
- **File:** `profiles/ralph-vscode/agents/ralph.ralph.agent.md`
- **Finding:** Improvement Suggestion #4 ("Add time-budget awareness to orchestrator so it can batch remaining tasks or skip review for the last task if time is critical") and D10 Stopping Point score (3/5 — involuntary stop at 2h timeout with 2 tasks remaining)
- **Root cause:** Rule gap — the orchestrator had no guidance about session time limits or how to manage time pressure. With 5 tasks × ~26 min average cycle, the 2-hour budget was always going to be tight.
- **Change:** Added "Time-budget awareness" subsection under "Task Approach" with concrete guidance: (1) note the start time, (2) estimate whether all planner tasks can complete, (3) consider skipping planner verification pass if time is tight, (4) warn in state.md if final task may not get reviewed. Advisory framing — prioritize quality (tasks with review) over quantity (more tasks without review).

### 4. Add resume-from-partial guidance to implement-loop skill
- **File:** `shared/skills/workflow/vscode/vscode-workflow/references/3-implement-loop.md`
- **Finding:** Improvement Suggestion #5 ("Add explicit 'resume from partial' guidance to the implement-loop skill reference") and Process Gaps #1 ("tasks.json shows TASK-04 as in_progress even though the coder completed — a resume would need to re-read the coder status")
- **Root cause:** Rule gap — the implement-loop skill assumed fresh starts and had no guidance for detecting/recovering from interrupted sessions. When SIGINT hit after TASK-04 coder completed but before reviewer dispatch, tasks.json was left in an inconsistent state.
- **Change:** Added "Resuming from a partial state" subsection at the start of the planner-mode per-task loop. It instructs the orchestrator to: (1) check for stale `in_progress` tasks in tasks.json, (2) cross-reference with ralph-coder/status.json, (3) dispatch reviewer instead of re-dispatching coder if the coder already completed, (4) re-dispatch coder from scratch if status is missing. This prevents wasted re-implementation on resumed sessions.

## Proposed (Not Implemented)

### Infrastructure Issues

#### 1. Graceful SIGINT handler for partial state persistence
- **Finding:** Process Gaps #1 ("No graceful shutdown — When SIGINT arrives, the orchestrator should attempt to write a partial state update")
- **What's needed:** A SIGINT trap in the CLI pipeline (`src/` TypeScript code) that detects an in-progress orchestrator turn and writes a `partial-shutdown.json` marker with the last known state (current task, coder status read but reviewer not yet dispatched). This is outside agent template scope — it requires changes to the CLI's process signal handling.
- **Workaround:** The resume-from-partial guidance added in Change #4 serves as a template-level mitigation. The orchestrator can now detect stale state on next launch even without a graceful shutdown handler.

#### 2. Container tooling pre-flight check
- **Finding:** Orchestrator Analysis > Error Recovery ("tried python3 -c but python3 was not available in the container")
- **What's needed:** A pre-flight script in the container setup (`profiles/ralph-vscode/setup.sh` or `Dockerfile`) that validates expected tools are available and sets environment flags. Alternatively, a shared include that documents container tool availability for all orchestrators.
- **Workaround:** The `node -e` preference added in Change #2 directly addresses this for the ralph profile. A broader solution would benefit all profiles.

### New Skills / MCP Servers

None needed. The analysis found no tool/MCP gaps or recurring skill patterns. All subagents used appropriate tools for their roles.

### Alternative Flow Proposals

#### Time-aware task batching
For tasks with many planned subtasks (5+ tasks like this run), the orchestrator could adopt a **time-bucketed execution strategy**:
1. After the planner produces tasks, estimate total execution time based on task complexity
2. If estimated time exceeds the budget, group the last N tasks into a single "combined" coder dispatch
3. This trades per-task review granularity for completion coverage

This would have allowed DOC-3181 to potentially complete TASK-04 and TASK-05 in a single combined dispatch, freeing time for at least one review cycle covering both. However, this changes the review granularity guarantee and needs human evaluation before implementation.

### SOTA Suggestions

None for this run — the execution quality was strong (4.6/5) with correct workflow mechanics. The improvements above are tactical refinements, not structural changes.

## No Action Needed

### Analyst (5/5)
No changes needed. Thorough analysis with effective Ralphchives search, comprehensive test file identification, and correct identification of registry contamination patterns that benefited downstream coder work.

### Planner (4/5)
No changes needed despite being slightly slow (12.9 min). The task decomposition was correct (5 tasks for 25 test files), dependency graph was accurate (TASK-03–05 depend on TASK-01 helpers), and each task spec included specific file lists and acceptance criteria. The planner's thoroughness justified the extra time.

### Coder (4/5)
No changes needed. All 5 dispatches produced correct implementations. The TASK-03 conditional no-op issue was a subtle interaction between test setup and registry state — the reviewer correctly caught it and the coder cleanly addressed all 5 findings in the fix round.

### Reviewer (5/5)
No changes needed. Excellent review quality with accurate severity coding, concrete fix suggestions, and efficient re-reviews. The TASK-03 rejection was particularly valuable — caught a silent no-assertion path that would have been a false-passing test.

### Orchestrator purity (5/5)
No changes needed. Zero purity violations — all routing based on status.json, all content relay via filesystem paths.
