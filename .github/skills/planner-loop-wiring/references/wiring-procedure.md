# Wiring Procedure

Step-by-step edits required to wire the planner into the existing orchestrator family. Perform these in order — each step depends on the previous ones for consistency.

Notation: `{{TOGGLE}}` = the toggle parameter from design question 4 (default: `skip_planner`). `{{MAX_ROUNDS}}` = max coder→reviewer rounds from design question 3 (default: 3). `{{MAX_PASSES}}` = max planner passes (always 2 unless explicitly overridden).

---

## Step 1: Create the planner agent file

Create `profiles/<profile>/agents/<orchestrator-prefix>.ralph-planner.agent.md` using the template from `references/planner-prompt-template.md`.

Verify:
- `name:` in frontmatter matches the filename convention
- `user-invocable: false`
- All four result codes are present: `planned`, `verified`, `gaps_found`, `blocked`
- Artifact contract include is present

## Step 2: Update orchestrator frontmatter

In the orchestrator `.agent.md`:

```yaml
agents: ["ralph-analyst", "ralph-planner", "ralph-coder", "ralph-reviewer", "ralph-scribe"]
```

Add `ralph-planner` after `ralph-analyst` and before `ralph-coder`.

## Step 3: Update orchestrator subagent table

In the `### Subagents` table, add the planner row wrapped in the toggle conditional:

```markdown
| `ralph-analyst` | Researcher | Reads codebase, produces implementation plan |
{%- unless triggerParams.{{TOGGLE}} %}
| `ralph-planner` | Planner | Breaks analyst's plan into ordered task files; after execution, verifies completeness against the spec |
{%- endunless %}
| `ralph-coder` | Implementer | Implements changes per analyst's plan{%- unless triggerParams.{{TOGGLE}} %} (one planned task at a time){%- endunless %}, runs build/lint/test |
```

## Step 4: Update orchestrator routing table

Replace or extend the routing table with two conditional branches.

**With planner (toggle off):**

| Agent | Result | Action |
|---|---|---|
| `ralph-analyst` | `analyzed` | Dispatch `ralph-planner` |
| `ralph-planner` | `planned` | Dispatch `ralph-coder` for first pending task |
| `ralph-planner` | `gaps_found` | Dispatch `ralph-coder` for first new task (verification round) |
| `ralph-planner` | `verified` | Proceed to Package |
| `ralph-planner` | `blocked` | Set status to `blocked`, exit |
| `ralph-coder` | `implemented` | Dispatch `ralph-reviewer` for current task |
| `ralph-coder` | `partial` | Skip review, advance to next task (or planner verification if last) |
| `ralph-reviewer` | `pass` | Advance to next task, or dispatch planner verification if all done |
| `ralph-reviewer` | `fail` (iteration < {{MAX_ROUNDS}}) | Re-dispatch `ralph-coder` for same task |
| `ralph-reviewer` | `fail` (iteration = {{MAX_ROUNDS}}) | Accept task, advance to next (or verification) |

**Without planner (toggle on):**

Preserve the original routing exactly — analyst → coder → reviewer (max 2 rounds) → Package. This is the regression-safe fallback.

Wrap each branch in `{%- if triggerParams.{{TOGGLE}} %}` / `{%- else %}` / `{%- endif %}`.

## Step 5: Update orchestrator iteration tracking

Replace the simple iteration counter with three-level tracking:

```markdown
### Iteration tracking
{%- if triggerParams.{{TOGGLE}} %}

Track the coder→reviewer loop iteration count. **Maximum 2 iterations.**
{%- else %}

Track three levels of iteration:

1. **Planner pass** — max {{MAX_PASSES}} passes
2. **Task progression** — iterate through tasks from `tasks.json` in order
3. **Per-task coder→reviewer loop** — max {{MAX_ROUNDS}} rounds per task

For each planner pass:
1. Dispatch `ralph-planner` (pass 1: initial; pass 2: verification)
2. Route on planner result
3. For each task: coder→reviewer loop
4. After all tasks: dispatch planner verification (if pass 1) or proceed to Package (if pass 2)
{%- endif %}
```

## Step 6: Update orchestrator error handling

Add planner error handling inside the toggle conditional:

```markdown
{%- unless triggerParams.{{TOGGLE}} %}
- **Planner blocked:** If `ralph-planner` returns `status: blocked` or `status: failed`, stop and set overall status to `blocked`
{%- endunless %}
```

Update coder partial handling to mention task advancement when planner is active.

## Step 7: Update orchestrator constraints

Add to the "What you NEVER do" section:

```markdown
{%- unless triggerParams.{{TOGGLE}} %}
- Never break analysis into execution tasks yourself — dispatch `ralph-planner`
{%- endunless %}
```

## Step 8: Update workflow phase table(s)

In the workflow skill (e.g., `shared/skills/workflow/.../SKILL.md`), update the phase table to mention the planner:

- Phase containing analysis: add "(+ planner dispatch)" or similar
- Phase containing implementation: update description to mention per-task loop and verification

Update both standard and revision workflow tables if they exist.

## Step 9: Update analyze reference

In the analyze workflow reference (e.g., `references/2-analyze.md`), add a planner dispatch section after the analyst:

```markdown
{%- unless triggerParams.{{TOGGLE}} %}
### Dispatch the planner

After the analyst completes with `analyzed`, dispatch `ralph-planner`:

| Planner result | Action |
|---|---|
| `planned` | Proceed to implementation phase (per-task loop) |
| `blocked` | Stop — set overall status to `blocked` |
{%- endunless %}
```

## Step 10: Update implement-loop reference

In the implement-loop workflow reference (e.g., `references/3-implement-loop.md`), add:

1. **Per-task execution** — loop through `tasks.json` rather than running coder once on the full plan
2. **Per-task review** — reviewer scopes to current task
3. **Task advancement** — after reviewer pass (or max rounds), advance to next task
4. **Planner verification dispatch** — after all tasks complete, dispatch planner in verification mode
5. **Verification result routing** — `verified` → Package, `gaps_found` → execute new tasks, enforce max passes

Wrap the entire section in the toggle conditional, preserving the original non-planner path.

## Step 11: Update coder agent

In the coder `.agent.md`, add a conditional input section:

```markdown
{%- unless triggerParams.{{TOGGLE}} %}
### Current task (planner-driven)

Read the current task file from `{{ artifactDir }}/ralph-planner/` as identified by the orchestrator's dispatch context. This task file contains:
- Objective, scope, constraints
- Execution steps
- Acceptance criteria

Implement only what the current task specifies. Do not work on other tasks.
{%- endunless %}
```

## Step 12: Update reviewer agent

In the reviewer `.agent.md`, add a conditional scope section:

```markdown
{%- unless triggerParams.{{TOGGLE}} %}
### Task-scoped review

When the planner is active, scope your review to the **current task** only. Read the task file from `{{ artifactDir }}/ralph-planner/` to understand what was requested, then verify the coder's changes satisfy that task's acceptance criteria.
{%- endunless %}
```

## Step 13: Update scribe agent (if present)

In the scribe `.agent.md`, add planner artifacts to the artifact list:

```markdown
- `ralph-planner/tasks.json` — task breakdown index
- `ralph-planner/task-*.md` — individual task specifications
- `ralph-planner/output.md` — planner summary
```

## Step 14: Validate

Run through the validation checklist in the main SKILL.md to verify all cross-references are consistent.
