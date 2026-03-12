# Templates

Use these snippets as starting points when wiring a new subagent.

## Orchestrator Frontmatter

```yaml
---
name: 'orchestrator-name'
user-invocable: false
agents: ['existing-agent', 'new-agent']
---
```

## Orchestrator Subagent Table Row

```markdown
| `new-agent` | Reviewer | Verifies <narrow responsibility> and returns approval-style verdicts |
```

## Orchestrator Routing Rows

```markdown
| `new-agent` | `approved` | Record approval, check other reviewers |
| `new-agent` | `needs-revision` | Re-dispatch `writer-agent` if iteration < 2 |
| `new-agent` | `failed` | Log failure, continue with partial status |
```

Adapt the route actions to the role. Not every subagent is approval-style.

## New Subagent Result Codes Section

```markdown
### Your result codes

| `result` | Meaning |
|---|---|
| `approved` | All findings resolved or none found |
| `needs-revision` | Specific issues found that require another iteration |
```
```

Keep the result-code set small and stable.

## New Subagent Input Section

```markdown
## Input

Your input artifacts are under `{{ artifactDir }}/`:

| Artifact | What it contains |
|---|---|
| `upstream-agent/output.md` | ... |
| `writer-agent/output-v{N}.md` | ... |
```

List only the inputs the subagent truly needs.

## New Subagent Output Section

```markdown
## Output

Write your report to `{{ artifactDir }}/new-agent/output.md`.

Then write `status.json` and append to `manifest.json` per the artifact contract.
```

## Ownership Boundary Snippet

Use explicit language in the orchestrator when responsibility moves:

```markdown
- Never perform <responsibility> yourself — dispatch `new-agent`
```

## Downstream Consumer Snippet

When another subagent should read the new artifact:

```markdown
If `{{ artifactDir }}/new-agent/output.md` exists, read it before starting <task>.
```

## Reviewer Gate Snippet

```markdown
### Review Gate

All listed reviewers must run. If any reviewer returns `needs-revision`, re-dispatch `writer-agent`, then re-run only the reviewers that rejected. Maximum 2 write/review iterations.
```

Use this only when the new agent truly participates in the gate.