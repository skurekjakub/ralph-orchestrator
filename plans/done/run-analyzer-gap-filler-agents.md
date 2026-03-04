# Run Analyzer & Gap Filler Agents — Design Proposal

Two local-mode agents that run as follow-up stages after the primary container agent completes its work. Both use `mode: "local"` to run directly on the host with full filesystem access to the orchestrator's output directory.

## 1. Run Analyzer (`ralph.run-analyzer`)

**Purpose**: Reviews a completed agent execution's artifacts and produces a structured quality analysis — tool usage patterns, errors, efficiency, workflow compliance, and improvement suggestions.

**Why local?** Needs access to `output/logs/` on the host filesystem. The container agent's output is collected _after_ container teardown, so analyzing it requires host access.

### What it analyzes

| Artifact | Location | What to extract |
|---|---|---|
| Streaming log | `<key>-<ts>.log` | Total duration, error patterns, retry loops |
| Transcript | `<key>-<ts>-transcript.md` | Tool call sequence, reasoning quality, dead ends |
| Tool output | `<key>-<ts>-tool-output.log` | Failed tool calls, excessive retries, wasted tokens |
| Proxy log | `<key>-<ts>-proxy.log` | Blocked domains, unexpected egress attempts |
| Sidecar log | `<key>-<ts>-sidecar.log` | MCP server errors, tool timeout patterns |
| Summary | `<key>-<ts>-summary.json` | Exit code, duration, status, stage results |
| Operation ledger | `history/<key>.json` | Retry history, state transitions |

### Output

A structured Markdown report saved to `output/logs/<key>-<ts>/<key>-<ts>-analysis.md`:

```markdown
# Run Analysis: DOC-3139

## Summary
- **Status**: completed | Duration: 14m 32s | Exit code: 0
- **Tool calls**: 47 (12 file reads, 8 edits, 6 searches, 5 terminal, 16 other)
- **Efficiency score**: 7/10

## Tool Usage Patterns
- 3 redundant file reads (same file, same range)
- search_subagent used effectively for initial discovery
- Terminal commands well-structured

## Error Recovery
- 1 failed edit (line mismatch) → recovered on retry ✓
- No unrecovered errors

## Workflow Compliance
- ✓ Branch created before edits
- ✓ PR created at end
- ✗ Missing source references in 2 sections

## Proxy & MCP
- All egress within allowlist
- jira-kentico: 12 calls, 0 errors
- ado: 8 calls, 1 timeout (recovered)

## Improvement Suggestions
1. Combine redundant file reads into single range reads
2. Add source references to "Configuration" and "Limitations" sections
3. Consider using grep_search before semantic_search for known patterns
```

### Profile configuration

```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "primary", "mode": "container" },
    { "agent": "ralph.run-analyzer", "role": "analyzer", "mode": "local", "model": "claude-sonnet-4-20250514" }
  ]
}
```

Uses a cheaper/faster model since analysis doesn't require the same creative capability as the primary agent. The analyzer reads the primary stage's output directory path from the `RalphResult` or derives it from the task context.

### Template sketch

```liquid
{% section "agent-identity" %}
# Run Analyzer
You analyze completed Ralph agent executions to identify quality issues, inefficiencies, and improvement opportunities.
{% endsection %}

## Task
Analyze the most recent execution for **{{ taskId }}: {{ taskTitle }}**.

Output directory: `output/logs/`
Look for the most recent directory matching `{{ taskId }}-*`.

{% section "analysis-checklist" %}
1. Read the summary JSON for status, duration, exit code
2. Read the transcript for tool call patterns and reasoning quality
3. Read the proxy log for blocked/unexpected domains
4. Read the sidecar log for MCP errors
5. Produce a structured analysis report
{% endsection %}

{% section "output-format" %}
Save your analysis to `<task-dir>/<key>-<ts>-analysis.md` using the structured format.
{% endsection %}
```

---

## 2. Gap Filler (`ralph.gap-filler`)

**Purpose**: Reviews the container agent's documentation output (the actual PR/commit) and fills gaps — missing sections, incomplete code samples, broken links, missing metadata, formatting inconsistencies.

**Why local?** Runs on the host against the target repo's working copy (the same checkout the container agent pushed to). Needs to read the diff, identify gaps, and make targeted fixes without spinning up the full Docker environment.

### What it checks

| Check | Method |
|---|---|
| Missing sections | Compare against template/spec requirements from the JIRA description |
| Incomplete code samples | Look for placeholder comments, TODO markers, empty code blocks |
| Broken internal links | Resolve relative links against the repo filesystem |
| Missing metadata | Check frontmatter fields (date, author, description, etc.) |
| Formatting issues | Heading hierarchy, list consistency, trailing whitespace |
| Source references | Verify claims have supporting links/citations |

### Output

The gap filler _directly edits_ the working copy and amends the PR branch. It pushes a follow-up commit with the fixes, then produces a gap report summarizing what it fixed and what it couldn't fix automatically.

Report saved to `output/logs/<key>-<ts>/<key>-<ts>-gaps.md`:

```markdown
# Gap Fill Report: DOC-3139

## Fixed (3)
- Added missing `ms.date` frontmatter to configuration.md
- Completed empty code block in "Authentication" section
- Fixed broken link to ../api/overview.md (was ../api/index.md)

## Flagged for human review (1)
- "Performance" section references benchmarks but no data provided in JIRA ticket
```

### Profile configuration

```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "primary", "mode": "container" },
    { "agent": "ralph.gap-filler", "role": "gap-filler", "mode": "local" }
  ]
}
```

Uses the default model (opus) since it needs to understand documentation quality and make substantive edits.

### Template sketch

```liquid
{% section "agent-identity" %}
# Gap Filler
You review and improve documentation that was just written by another agent. Your job is to find and fix gaps without changing the overall structure or approach.
{% endsection %}

## Task
Review the documentation changes for **{{ taskId }}: {{ taskTitle }}** in project **{{ taskProject }}**.

The primary agent has already pushed a branch. Check the current working tree for:
1. Missing or incomplete sections
2. Broken links (resolve against the repo)
3. Empty code blocks or placeholder content
4. Missing metadata (frontmatter fields)
5. Formatting inconsistencies

{% section "rules" %}
- Make targeted fixes only — don't rewrite sections that are already good
- Commit fixes as a separate commit with message: `fix: fill documentation gaps for {{ taskId }}`
- If a gap requires information not available in the repo, flag it in the report instead of guessing
- Never remove content the primary agent added unless it's clearly wrong
{% endsection %}

{% section "output" %}
Save a gap report to the orchestrator's output directory summarizing fixes and flagged items.
{% endsection %}
```

---

## 3. Combined Pipeline (Three-Stage)

For maximum quality, both agents can run in sequence:

```json
{
  "stages": [
    { "agent": "ralph.ralph", "role": "primary", "mode": "container" },
    { "agent": "ralph.gap-filler", "role": "gap-filler", "mode": "local" },
    { "agent": "ralph.run-analyzer", "role": "analyzer", "mode": "local", "model": "claude-sonnet-4-20250514" }
  ]
}
```

**Execution flow**:
1. **Primary** (container) — writes documentation, creates PR
2. **Gap Filler** (local) — reviews output, fixes gaps, pushes follow-up commit
3. **Run Analyzer** (local) — analyzes the full execution (all stages), produces quality report

The analyzer runs last so it can observe the gap filler's behavior too.

---

## Implementation Steps

### Phase 1: Agent Templates
1. Create `profiles/ralph-docs/agents/ralph.run-analyzer.agent.md`
2. Create `profiles/ralph-docs/agents/ralph.gap-filler.agent.md`
3. Add shared includes if needed (e.g. `shared/agent-includes/analysis-format.md`)

### Phase 2: Profile Variant
1. Add a new variant to `ralph-docs/profile.json` with a dedicated trigger (e.g. `@RalphAnalyzed`) that uses the three-stage pipeline
2. Keep the existing `@RalphDf` variant as single-stage for backward compatibility

### Phase 3: Output Integration
1. Extend `TaskResultWriter` to recognize `-analysis.md` and `-gaps.md` artifacts
2. Optionally attach analysis/gap reports to the JIRA issue alongside the transcript
3. Add analysis summary to the execution summary JSON

### Phase 4: Dashboard
1. Show per-stage results in the local dashboard's history panel
2. Display analysis scores/flags in the task detail view

---

## Open Questions

1. **Gap filler git access**: In local mode, the executor runs on the host. Does the host have the same git credentials/remote configured as the container? If not, the gap filler can't push. Mitigation: use `repoPat` env var directly.

2. **Analyzer feedback loop**: Should analyzer findings feed back into future primary agent runs (e.g. appending common mistakes to the agent template)? This could create an improvement flywheel but adds complexity.

3. **Abort behavior**: If the gap filler fails, should the analyzer still run? Current abort-on-fail behavior would skip it. Consider adding a `continueOnFailure` option to stage config.

4. **Cost**: Three-stage runs triple the LLM cost. The analyzer using sonnet mitigates this, but the gap filler using opus is expensive. Consider whether sonnet is sufficient for gap filling.
