# Decision Guide

Use this guide before creating a new subagent. The main failure mode is creating a subagent for work that should remain inside an existing owner, or failing to create one when the orchestrator is still doing real work itself.

## Promote Work Into a Subagent When

- the orchestrator is performing substantive analysis, writing, review, or formatting itself
- the responsibility has a clear artifact boundary
- the work can return a small fixed set of result codes
- the work is reusable across iterations or workflow variants
- the work would otherwise bloat orchestrator context

## Keep Work Inside the Existing Agent When

- it is a tiny administrative step with no meaningful artifact
- it is inseparable from the current subagent's core responsibility
- splitting it would create an artificial one-line helper with no routing value

## Classify the New Subagent

### Phase owner

Use when the subagent owns a real pipeline step.

Examples:

- researcher
- writer/coder
- reviewer
- scribe

This usually requires orchestrator roster updates, routing rows, ordering-constraint updates, and possibly workflow-table changes.

### Helper subagent

Use when the subagent is invoked by another subagent rather than directly by the orchestrator.

Examples:

- validator
- test writer used by another agent
- focused classifier used inside research

This usually requires updating the parent subagent's `agents:` list or prompt guidance, but not the orchestrator routing table.

### Reviewer

Use when the subagent returns approval-style verdicts and may participate in loops.

This always requires explicit review-gate logic and result handling in the orchestrator.

### Scout or analyst

Use when the role gathers context for a downstream phase owner.

This often changes artifact consumers and may require the writer/reviewer to read the new artifact.

### Scribe or formatter

Use when the role composes handoff output from upstream artifacts.

This requires explicit boundaries so the orchestrator does not resume composing handoff content itself.

## Questions to Answer First

- Who is the primary caller: orchestrator or another subagent?
- What artifact does the new subagent read?
- What artifact does it write?
- What fixed result codes will it return?
- Which existing prompt sections become stale after this change?
- Does this change create a new retry loop or alter an existing one?

If you cannot answer those questions, do not start editing prompts yet.