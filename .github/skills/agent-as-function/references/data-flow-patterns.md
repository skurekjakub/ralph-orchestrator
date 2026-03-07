# Data Flow Patterns

How data moves between agents in the subagent-as-function pattern. The central principle: **subagents read each other's artifacts directly — the orchestrator never relays data.**

## Who Reads What

| Consumer | Reads | Why |
|---|---|---|
| coder (iter 1) | `analyst/output.md` | Implementation plan |
| coder (iter 2+) | `analyst/output.md` + `reviewer/output-v{N-1}.md` | Original plan + reviewer feedback |
| reviewer | `coder/output-v{N}.md` + actual changed files | Change summary + real code |
| scribe | Multiple `*/jira-findings.json` or `*/output.md` | Aggregation for handoff |
| agent-improver | `run-analyzer/output.md` | Post-task self-improvement |

The orchestrator doesn't appear in this table — it dispatches agents and reads `status.json`, nothing more.

## Routing Tables

The orchestrator routes based on `(agent, result)` pairs. Define the full table before implementing.

### Example: Multi-Model Review Panel (malph)

```markdown
| Agent completed | result | Action |
|---|---|---|
| scout | scouted | dispatch reviewer-opus, reviewer-gpt, reviewer-gemini (parallel) |
| scout | build-broken | write BUILD findings to JIRA, skip review panel |
| reviewer-* | approved | check if all reviewers done, then aggregate |
| reviewer-* | needs-revision | check if all reviewers done, then aggregate |
| scribe | delivered | archive and exit |
```

### Example: Linear Pipeline (ralph-docs)

```markdown
| Agent completed | result | Action |
|---|---|---|
| analyst | analyzed | dispatch coder |
| coder | implemented | dispatch reviewer |
| reviewer | approved | dispatch commit-and-handoff |
| reviewer | needs-revision | dispatch coder (iteration++) |
| commit-and-handoff | delivered | exit |
```

### Example: Conditional Branching

```markdown
| Agent completed | result | Action |
|---|---|---|
| triage | simple-fix | dispatch auto-fixer |
| triage | complex-change | dispatch analyst → full pipeline |
| triage | not-actionable | comment on JIRA, exit |
| auto-fixer | fixed | dispatch reviewer |
| auto-fixer | failed | escalate to full pipeline |
```

## Revision Handling

For **revisions** (fixing a previously-reviewed PR), the data flow changes at the entry point:

1. The orchestrator dispatches the analyst with just the task-id and a `isRevision: true` flag
2. The analyst reads PR feedback and prior handoff from filesystem/MCP tools **itself** — not relayed by the orchestrator
3. The analyst produces a fresh `output.md` scoped to "what needs fixing" — not a full analysis
4. Downstream agents (coder, reviewer) follow the same pattern as new work

This works because subagents are self-sufficient — they gather their own input from the filesystem rather than depending on the orchestrator to provide context.

## Parallel Dispatch

When multiple subagents can run concurrently (e.g., a multi-model review panel):

1. Orchestrator dispatches all agents with the same `task-id`
2. Each writes to its own subdirectory (`reviewer-opus/`, `reviewer-gpt/`, `reviewer-gemini/`)
3. Orchestrator polls or awaits all `status.json` files
4. Once all are complete, orchestrator reads each `status.json` (still no artifact content) to determine next action
5. A downstream aggregator subagent (e.g., scribe) reads all reviewer output files directly

## Post-Hook Agents

Post-hook agents (e.g., agent-improver, run-analyzer) follow the same contract:

- Read artifacts from the main pipeline via the shared artifact directory
- Write their own output to `{agent-name}/output.md`
- Write `status.json` and append to `manifest.json`
- The orchestrator (or a hook runner) reads only `status.json`

Post-hooks typically run after the main pipeline completes. Their artifact root is `{hook.outputDir}/artifacts/` rather than `.ralph/tasks/{task-id}/artifacts/`.

## Anti-Patterns

**Orchestrator as relay:**
```
❌  orchestrator reads analyst/output.md → passes content to coder dispatch prompt
✅  orchestrator dispatches coder with task-id → coder reads analyst/output.md itself
```

**Orchestrator as aggregator:**
```
❌  orchestrator reads all reviewer outputs → summarizes → passes to scribe
✅  orchestrator dispatches scribe → scribe reads all reviewer outputs itself
```

**Orchestrator reading artifacts for routing:**
```
❌  orchestrator reads reviewer/output.md to check if changes are needed
✅  orchestrator reads reviewer/status.json where result is "needs-revision" or "approved"
```
