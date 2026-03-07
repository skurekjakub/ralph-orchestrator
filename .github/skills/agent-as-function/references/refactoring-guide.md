# Refactoring Guide

How to convert existing agents to the subagent-as-function pattern, and implementation checklists for building new orchestrators and subagents.

## Converting Existing Agents (5 Steps)

### Step 1: Identify conversational output

Look at the subagent's final turn — the message flowing back into the orchestrator's context. This is the content that will move to the filesystem.

Signs of conversational output:
- Long messages returned from subagent dispatch calls
- Orchestrator prompts that include "here is the analyst's report: ..."
- Context window growing significantly after each subagent completes

### Step 2: Redirect to filesystem

Write the same content to `{artifact-root}/{task-id}/{agent-name}/output.md`.

**Change where it goes, not what it says.** The subagent's reasoning, tool use, and output quality remain identical — only the final destination changes.

### Step 3: Replace return with status.json

After writing `output.md`:
1. Write `status.json` with structured status fields
2. Append to `manifest.json`
3. Return one line to the orchestrator: `"Done. Status: completed, result: analyzed."`

The orchestrator's dispatch call now receives a one-liner instead of a full report.

### Step 4: Update downstream consumers

Any subagent that previously received this agent's output through the orchestrator must now read it from the filesystem.

Before:
```
orchestrator → dispatch analyst → receives report → dispatch coder("implement this: {report}")
```

After:
```
orchestrator → dispatch analyst → receives "Done. result: analyzed."
orchestrator → dispatch coder("task-id: DOC-3167") → coder reads analyst/output.md itself
```

### Step 5: Don't change internals

How the subagent reasons, what tools it uses, what skills it loads — leave all of that alone. Only the I/O boundary changes. This minimizes risk and makes the refactoring easy to verify.

## Orchestrator Implementation Checklist

When building or modifying an orchestrator agent template:

1. **Define the `agents:` list** in the agent frontmatter — one entry per subagent with name, description, and model
2. **Define result codes** for each subagent — what `result` values does each one produce, and what does the orchestrator do for each?
3. **Write routing rules** — a clear dispatch table mapping `(subagent, result)` → next action. See [data-flow-patterns.md](data-flow-patterns.md) for examples.
4. **Set iteration limits** — max rounds for any iterative loop (e.g., max 3 coder-reviewer cycles)
5. **List administrative duties** — what does the orchestrator do itself vs delegate? (commit, push, PR creation, JIRA transitions are typical orchestrator duties)
6. **Never read artifacts** — only `status.json`. If you find yourself writing "read the reviewer's output", stop and redesign. The information you need should be in `result` or `summary`.

### Orchestrator agent template structure

```markdown
# {Agent Name} — Orchestrator

## Agents
| Name | Model | Role |
|---|---|---|
| analyst | claude-opus-4.6 | Analyze task, produce implementation plan |
| coder | claude-opus-4.6 | Implement changes |
| reviewer | claude-opus-4.6 | Review implementation |
| scribe | claude-sonnet-4.5 | Write JIRA handoff |

## Routing Table
| Agent completed | result | Action |
|---|---|---|
| analyst | analyzed | dispatch coder |
| coder | implemented | dispatch reviewer |
| reviewer | approved | dispatch scribe |
| reviewer | needs-revision | dispatch coder (iteration++) |

## Artifact Root
`.ralph/tasks/{task-id}/artifacts/`

## Administrative Duties (orchestrator does these itself)
- Create/switch git branch
- Commit and push after coder completes
- Create PR after final review approval
- Transition JIRA issue status
- Write the ===RALPH_RESULT_START=== exit block

## Rules
- Read ONLY status.json from each subagent
- Never relay artifact content between subagents
- Max 3 coder-reviewer iterations
```

## Subagent Implementation Checklist

When building a subagent template:

1. **Include the artifact contract partial** — `{% render 'agent-as-function-contract' %}` or equivalent shared include
2. **Declare input artifacts** — what upstream files does this subagent read?
   ```markdown
   ## Input
   - `analyst/output.md` — implementation plan
   - `reviewer/output-v{N-1}.md` — reviewer feedback (iteration 2+)
   ```
3. **Declare output artifacts** — what files does this subagent write?
   ```markdown
   ## Output
   - `ralph-coder/output-v{N}.md` — change summary
   - `ralph-coder/status.json` — structured status
   ```
4. **Define result codes** — what values can `result` take?
   ```markdown
   ## Result Codes
   - `implemented` — changes made successfully
   - `build-broken` — implementation caused build failure
   - `blocked` — cannot proceed without clarification
   ```
5. **Write status.json before exiting** — always, even on failure
6. **Append to manifest.json** — always, after writing artifacts
7. **Return one line** — `"Done. Status: completed, result: implemented."` — nothing more

### Subagent template structure

```markdown
# {Agent Name}

## Role
One-line description of what this agent does.

## Input
- `{upstream-agent}/output.md` — description

## Output
- `{this-agent}/output-v{N}.md` — description
- `{this-agent}/status.json`

## Result Codes
- `code-1` — meaning
- `code-2` — meaning

## Instructions
1. Read input artifacts
2. Do the work
3. Write output artifact
4. Write status.json
5. Append to manifest.json
6. Return: "Done. Status: {status}, result: {result}."

## Artifact Contract
{% render 'agent-as-function-contract' %}
```

## Verification After Refactoring

After converting agents, verify each of these:

| Check | How to verify |
|---|---|
| Orchestrator context is clean | Review the orchestrator's conversation — no artifact content, only status one-liners |
| Subagents read from filesystem | Subagent prompts reference artifact paths, not orchestrator-provided content |
| status.json always written | Test both success and failure paths — status.json must exist in both cases |
| manifest.json is accurate | Compare manifest entries to actual files on disk |
| Downstream output is equivalent | Compare end-to-end output before and after refactoring |
| Iteration limits work | Force a failure loop and verify it terminates at the configured max |
