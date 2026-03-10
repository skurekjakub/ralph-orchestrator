# Report Format

Present the audit as a code-review style findings list.

## Default Structure

1. Findings
2. Open questions or assumptions
3. Brief residual-risk note only if needed

## Findings Style

Each finding should include:

- severity
- what is inconsistent
- why it matters architecturally
- exact file references

Aim for this shape:

```md
- Critical: The revision flow bypasses the delegated scribe and restores inline handoff delivery. The orchestrator prompt forbids this in [...], but the revision handoff reference requires it in [...]. That breaks the agent-as-function ownership model and makes revision behavior diverge from the standard workflow.
```

## Ordering

Order findings by severity first, then by how foundational they are:

1. ownership contradictions
2. artifact/result-block contract drift
3. revision/standard mismatch
4. skill-mount and cross-family leakage
5. cleanup issues

## What Not To Do

- Do not lead with a summary paragraph.
- Do not bury the file references.
- Do not mix definite findings with speculative open questions.
- Do not propose fixes unless the user asked for remediation.

## Exit Condition

Stop when you have either:

- proven the workflow is consistent on the audited surfaces, or
- captured the concrete contradictions and residual risks with enough precision that another agent could fix them directly
