# Wiring Checklist

Use this checklist when introducing a new subagent into an existing orchestrator family.

## 1. Create the New Subagent Prompt

Create `profiles/<profile>/agents/<name>.agent.md` with:

- frontmatter: `name`, `description`, model, `user-invocable: false`
- artifact contract include
- fixed `result` codes table
- clear input artifact list
- narrow mission and scope boundaries
- output artifact paths
- rules stating what the subagent does not do

## 2. Update the Orchestrator Frontmatter

In the orchestrator `.agent.md` frontmatter:

- add the new agent name to `agents: [...]`

If this step is missed, the orchestrator cannot dispatch the new subagent.

## 3. Update the Orchestrator Subagent Roster

In the orchestrator's `### Subagents` table:

- add a row for the new agent
- describe the role in one sentence
- update any adjacent rows whose ownership changed

Do not leave stale rows that imply the old owner still performs the extracted work.

## 4. Update Routing Rules

In the orchestrator's routing table:

- add rows for each new result code the orchestrator must handle
- update predecessor routes so the new subagent is dispatched at the right time
- update successor routes if downstream steps now wait on the new subagent

Every result code that matters at runtime must have a route.

## 5. Update Ordering Constraints

If the new subagent must run before or after another step, add or adjust the hard ordering rules.

Examples:

- researcher must run before writer
- all reviewers must run before commit
- scout must run before verdict aggregation

## 6. Update Review Gates or Retry Loops

If the new subagent is a reviewer or another loop participant:

- update the gate section that defines who must run
- update the retry/re-dispatch logic
- update the iteration cap text if the loop semantics changed

## 7. Update Error Handling

If the new subagent can block or partially fail the workflow:

- add explicit error-handling rules for its failure modes
- decide whether failures block, downgrade to partial, or are logged and skipped

## 8. Update Ownership Statements

Search for broad statements such as:

- "Never do X yourself"
- "Dispatch Y for all Z"
- "The orchestrator never ..."

These often become stale when a new subagent is introduced.

## 9. Update Sibling Subagents

Audit other prompts that need to know about the new artifact or new ownership.

Typical examples:

- writer now reads scout output
- reviewer now reads analyst output
- scribe now summarizes the new subagent's findings
- existing agents should stop doing work now delegated to the new subagent

## 10. Update Workflow Assets If Needed

If the new subagent changes the workflow phase sequence or phase ownership:

- update the workflow table
- update phase skills
- update `profile.json` skills arrays

Use `agent-workflow-phase-editor` for this part.

## 11. Validate Names and Reachability

Before finishing, confirm:

- the orchestrator can dispatch the new agent by name
- the new agent's result codes appear in the route logic
- no stale references remain to the previous owner
- all artifact paths are consistent across producers and consumers