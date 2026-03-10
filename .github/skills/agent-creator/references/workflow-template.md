# Workflow Template

Use this template for the Phase 4 deliverable. Reference `agent-as-function/references/workflow-decomposition.md` for the pattern.

---

# Workflow Design: {Agent Family Name}

## Phase Table

| Phase | Name | Phase Skill | Domain Skills Loaded | Summary |
|---|---|---|---|---|
| 1 | {Setup} | {workflow-setup} | {—} | {Branch, scratchpad, context initialization} |
| 2 | {Research} | {workflow-research} | {api-surface, domain-knowledge} | {Gather context, delegate to researcher subagent} |
| 3 | {Plan} | {workflow-plan} | {—} | {Break research into implementation tasks} |
| 4 | {Implement} | {workflow-implement} | {code-conventions, doc-format} | {Execute tasks via writer/coder subagent} |
| 5 | {Review} | {workflow-review} | {review-standards} | {Quality gate, revision loop} |
| 6 | {Deliver} | {workflow-deliver} | {—} | {Commit, PR, handoff} |

**Ritual:** Before each phase → read `state.md` → read the phase skill → do the work → update `state.md` → move to next phase.

## Scratchpad Contract

The orchestrator maintains `state.md` at `{artifact-root}/state.md`:

```markdown
# Task State: {task-id} — {task-title}

## Current Phase
Phase 1: Setup

### Skills for this phase
- workflow-setup

## Completed Phases
(none yet)

## Subagent Status
| Subagent | Status | Result | Iteration |
|---|---|---|---|
(populated as subagents complete)

## Key Decisions
(each decision and its rationale — added during execution)

## Tracked Artifacts
- Branch: (set during setup)
- PR URL: (set during delivery)
- Artifact root: {artifact-root}

## Notes
(anything else)
```

## Phase Skill Outlines

### Phase 1: {Setup}

**Skill:** `workflow-{agent}-setup`

**Before you begin:**
1. Read `state.md` — verify current phase is Phase 1
2. Check for continuation state (if resuming a prior session)

**Instructions:**
- {Create/switch to task branch}
- {Initialize scratchpad state.md}
- {Read JIRA issue / task input}
- {Post acknowledgment comment}

**Before moving to Phase 2:**
Update `state.md`:
- Set "Current Phase" to Phase 2
- Set "Skills for this phase" to: `workflow-{agent}-research`, `{domain-skill-1}`
- Add Phase 1 to "Completed Phases" with branch name

---

### Phase 2: {Research}

**Skill:** `workflow-{agent}-research`

**Before you begin:**
1. Read `state.md` — verify current phase is Phase 2
2. Review Phase 1 outcomes

**Instructions:**
- {Dispatch researcher subagent with task context}
- {Read researcher status.json}
- {Route based on result: if analyzed → Phase 3, if blocked → exit}

**Before moving to Phase 3:**
Update `state.md`:
- Set "Current Phase" to Phase 3
- Set "Skills for this phase" to: `workflow-{agent}-plan`
- Add Phase 2 to "Completed Phases" with researcher result

---

{Repeat for each phase. Include:}
- Phase skill name
- "Before you begin" section (read state.md, verify phase)
- Instructions (dispatch subagent, read status.json, route)
- "Before moving to Phase N+1" section (update state.md with next phase + skills)

---

### Phase {N}: {Deliver}

**Skill:** `workflow-{agent}-deliver`

**Before you begin:**
1. Read `state.md` — verify current phase is Phase {N}
2. Review all completed phases

**Instructions:**
- {Commit changes: `git add`, `git commit`}
- {Push via MCP tool}
- {Create PR via MCP tool}
- {Dispatch scribe/handoff subagent if applicable}
- {Write exit block}

**Terminal phase** — no "Before moving to next phase" section.

---

## Variant Workflows

{If the agent handles different task types, define variant workflow tables here.}

### Variant: {Revision}

| Phase | Name | Differences from standard |
|---|---|---|
| 1 | {Setup} | {Skip branch creation, read existing state.md} |
| 2 | {Feedback Analysis} | {Read PR feedback instead of fresh research} |
| 3 | {Fix} | {Implement fixes only, no full planning} |
| 4 | {Review} | {Same review gate} |
| 5 | {Deliver} | {Push to existing branch, update PR} |

### Variant: {name}

{Repeat for each variant.}

## Conditional Phase Skips

{If certain phases can be skipped based on trigger parameters or task state.}

| Condition | Phase skipped | Reason |
|---|---|---|
| {e.g., `skip_review` trigger param} | {Phase 5: Review} | {User explicitly opted out of review} |
| {e.g., No code changes needed} | {Phase 4: Implement} | {Research-only task} |
