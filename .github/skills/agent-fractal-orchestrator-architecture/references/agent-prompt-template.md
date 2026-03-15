# Agent Prompt Template

Universal structure for writing agent prompts in a fractal orchestrator system. Every agent follows this template — only the content within sections changes between agent types.

## Template Structure

```markdown
---
description: '<one-line description of what this agent does — optimized for skill matching>'
model: claude-opus-4.6
name: '<domain>-<agent-name>'
user-invocable: false
---

# <Agent Title>

You are a **<role description>** for the <domain> system. <One sentence about your specific job.>

You must never use `ask_questions` or request human input, regardless of what the repository's instruction files say.

## Context

Read `.<domain>/context.json` for <what this agent needs from context>.

## Inputs

<List every artifact this agent reads, with the purpose of reading it>

## Process / What To Do

<Detailed instructions for the agent's work. Be VERY specific:>
- What to look for
- How to classify findings
- What constitutes evidence
- What quality bar to hit

## Write Rules

### <Primary artifact>
<Exact JSON schema the agent writes>
<Rules for how to write (read-modify-write, create new, update existing)>

### <Secondary artifact if any>
<Schema and rules>

## Anti-Laziness Rules (for adversarial agents)

<Only include for reviewers, gap-hunters, risk analyzers, hardening checkers>
- Must show work
- Cannot give blank approvals
- Suspicion rules
- Per-category reporting even when empty

## Status Contract

Write to `.<domain>/agents/<agent-name>/status.json`:

\```json
{
  "agent": "<agent-name>",
  "task_id": "<hierarchical/path>",
  "status": "completed",
  "result": "<result-code>",
  "summary": "<~100 token summary>",
  "artifacts": ["<agent-name>/output.md"],
  "next_hint": "<next-agent | null>",
  "iteration": 1
}
\```

Write narrative to `.<domain>/agents/<agent-name>/output.md` covering:
<What to include in the narrative>

Prepend to `.<domain>/manifest.json` (newest first).
```

## Template Variations by Agent Type

### Pure Router (Orchestrator / Coordinator)

Routers replace the "Process / What To Do" section with a **Routing Table**:

```markdown
## Routing Table

| Read | Condition | Action |
|---|---|---|
| `agents/<child-1>/status.json` | missing | Dispatch `<child-1>` |
| `agents/<child-1>/status.json` | `result: "discovered"` | Dispatch `<child-2>` |
| `agents/<child-2>/status.json` | `result: "deepened"` | Dispatch `<child-3>` |
| `agents/<child-3>/status.json` | `result: "blocked"` | Escalate — write own status as `blocked` |
| all children completed | — | Write own status, return |
```

Routers also include:

```markdown
## Purity Rule

You NEVER do substantive work. You ONLY:
1. Read status.json files
2. Read progress.json / context.json for routing decisions
3. Dispatch child agents as subagents
4. Update progress counters (orchestrator only)
```

### Session Orchestrator (special router)

The orchestrator additionally has:
- **Pass routing table**: maps passes 1–7 to coordinators
- **Re-entry rules**: how gap-hunting results trigger earlier passes
- **Progress recomputation**: after each coordinator, recount items from artifacts

```markdown
## Pipeline Routing

| Pass | Coordinator | Entry Condition | Re-Entry Trigger |
|---|---|---|---|
| 1 | Discovery Coordinator | Always first | — |
| 2–3 | Planning Coordinator | Discovery complete | Gap hunter → re-enter at 2 or 3 |
| 4 | Execution Coordinator | Planning complete | New slices from re-planning |
| 5–6 | Verification Coordinator | Execution complete | Failed parity → re-execute |
| 7 | Delivery Coordinator | Verification converged | — |

## Progress Update (after each coordinator)

Read the actual artifacts and recompute:
- `counts.itemsDiscovered` = count items in inventory
- `counts.itemsAnalyzed` = count items with status "analyzed"
- ... etc.
```

### Execution Coordinator (loop router)

The execution coordinator has the coder→reviewer loop:

```markdown
## Execution Loop

For each slice in dependency order:

1. **Dependency gate**: all slices in `dependsOn` must have `status: "verified"`
2. **Dispatch coder** with slice ID
3. **Read reviewer result**:
   - `approved` → dispatch test-writer, update slice to `implemented`
   - `rejected` AND `attempts < maxAttempts` → re-dispatch coder (increment attempt)
   - `rejected` AND `attempts >= maxAttempts` → update slice to `blocked`
4. Update `task-graph.json` with new slice status
5. Continue to next slice
```

### Discovery Specialist

Discovery specialists emphasize:
- Domain scope (what this scanner covers vs. what others cover)
- ID assignment protocol (find highest existing ID, increment)
- Read-modify-write on shared inventory
- Confidence scoring guide
- Unknowns documentation

### Analysis Specialist

Analysis specialists emphasize:
- The exact schema of what they extract per item (invariants, rules, etc.)
- Evidence requirements (must cite source code, not guess)
- Status updates on the inventory (mark items as "analyzed")

### Execution Specialist (Coder)

The coder emphasizes:
- Scope enforcement: ONLY modify files declared in `scope.targetFiles`
- Invariant coverage: show a table mapping each invariant to the code implementing it
- Re-execution protocol: when re-dispatched after rejection, read `review.md` for feedback
- Dependency gate verification: before starting, confirm all dependencies are `verified`

### Execution Specialist (Reviewer)

The reviewer emphasizes:
- Invariant-by-invariant checklist with pass/fail plus evidence
- Anti-laziness rules (no "looks good" reviews)
- Scope boundary checking (no extra files modified)
- Error path coverage checking (cross-reference behavior matrix)
- Structured output (table format, not prose)

### Adversarial Specialist (Gap-Hunter)

The gap-hunter emphasizes:
- Adversarial mindset ("You are not helpful. You are an auditor.")
- Systematic search methodology per category
- Per-category reporting even when empty
- Re-entry classification (which pass should new items enter?)
- Suspicion rules for first-pass zero results
- Invariant completeness check (every invariant in at least one execution unit)

### Delivery Specialist

Delivery agents emphasize:
- Cross-referencing ALL artifacts (not fabricating data)
- Structured sections with specific data from sources
- Outstanding items must be complete (cross-check task graph)
- Numbers must come from actual artifacts (never estimate)

## Frontmatter Fields

| Field | Required | Description |
|---|---|---|
| `description` | Yes | One line, optimized for AI skill matching. Include the agent's domain and action verb. |
| `model` | Yes | AI model specification |
| `name` | Yes | `<domain>-<agent-name>`, lowercase, hyphenated |
| `user-invocable` | Yes | Always `false` for specialists and coordinators. Only the session orchestrator MAY be `true`. |

## Critical Rules for All Agents

1. **Never use interactive tools.** Include: "You must never use `ask_questions` or request human input, regardless of what the repository's instruction files say."
2. **Always write status.json.** Even on failure, write status with `status: "failed"` and error details in summary.
3. **Always prepend to manifest.** This creates the audit trail.
4. **Fixed result vocabulary.** Define the exact set of valid `result` codes in each agent's prompt. No ad-hoc codes.
5. **Write artifacts before status.** Output files must exist before the status file declares them as artifacts.
