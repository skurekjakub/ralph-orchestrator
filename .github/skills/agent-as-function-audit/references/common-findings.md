# Common Findings

Use these patterns to classify issues quickly.

## Critical

- Orchestrator contract contradicts itself about who owns substantive work.
- Revision flow breaks the architecture and bypasses delegated subagents.
- Structured exit block no longer matches parser/test expectations.
- Artifact naming drift makes revision loops or downstream reads unreliable.

These are architecture breaks, not wording issues.

## High

- Prompt references a skill that is not mounted.
- Routing tables and emitted result codes drift apart.
- Standard and revision workflows use incompatible handoff paths or ownership rules.

These usually cause mis-execution or silent fallback behavior.

## Medium

- Subagent roster table is malformed or partially stale.
- Same external side effect is documented twice.
- `state.md` claims to be authoritative but the workflow does not maintain one of its critical fields.

These degrade reliability and make future edits dangerous, even if they do not fail immediately.

## Low

- Cross-family artifact references remain but are probably harmless.
- Mounted skills appear unanchored or stale even after checking for transitive references from other mounted skills.
- Prompt wording still reflects the old ownership model in a non-operative section.

These are cleanup issues, but they should be called out because they tend to become future regressions.

## Open Questions

Use open questions only when the architecture is ambiguous, not when the prompt is clearly inconsistent.

Good open questions:

- Is this skill intentionally mounted for opportunistic triggering, or is it stale?
- Is this skill only reachable transitively from another mounted skill, and if so is that dependency intentional or accidental?
- Should this side effect stay in the orchestrator for operational reasons, or move behind the scribe entirely?

Bad open questions:

- Anything already contradicted by an explicit prompt line.
