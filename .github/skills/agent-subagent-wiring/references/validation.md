# Validation

Run this checklist before considering the new subagent integrated.

## Reachability

- The orchestrator frontmatter includes the new agent name.
- The orchestrator roster mentions the new agent and its role.
- There is a route into the new agent from at least one predecessor state.
- There is a route out of each meaningful result code the new agent can produce.

## Ownership

- The orchestrator no longer describes itself as owning the extracted work.
- No sibling prompt still claims responsibility for work now delegated to the new subagent.
- If the new subagent writes an artifact, all intended consumers reference the same path.

## Loop Safety

- Review or revision loops still terminate at a clear max iteration count.
- Adding the new subagent did not create a cycle with no exit condition.
- Failure paths are explicit.

## Prompt Consistency

- Result code names are consistent between the subagent prompt and the orchestrator routing rules.
- The same agent name spelling is used in frontmatter, tables, and route logic.
- Artifact paths match between producer and consumer prompts.

## Workflow Consistency

- If the change affects phase order, the workflow table and phase skills were updated too.
- If the change does not affect phase order, no unnecessary workflow renumbering was introduced.

## Practical Verification

Prefer at least these checks:

- search for the new agent name across the affected profile prompt files
- search for stale ownership language from the previous owner
- verify each declared result code appears in routing logic where relevant
- run any prompt/template validation tests available for the profile

For this repo, if the change affects agent templates or skill rendering, run the relevant template integration tests when available.

## Failure Smells

Stop and fix the integration if any of these are true:

- the new subagent exists but nothing dispatches it
- the orchestrator can dispatch it but has no route for one of its results
- another prompt still instructs an old agent to do the same substantive work
- the orchestrator now needs to read `output.md` content to decide what to do next
- the new subagent has vague result codes like `done` with no routing meaning