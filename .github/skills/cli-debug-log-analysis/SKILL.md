---
name: cli-debug-log-analysis
description: "Parse and analyze Ralph CLI debug logs (cli-debug.log) to extract subagent spans, tool call sequences, token consumption, context compaction events, and error patterns. Use this skill whenever you need to manually parse a cli-debug.log file — for example when the subagent-mapper's pre-extracted data is insufficient or missing, when debugging a specific subagent's behavior in detail, or when investigating infrastructure issues visible only in raw logs. Trigger on phrases like 'parse the debug log', 'extract subagent spans', 'analyze tool calls from the log', 'what happened in the cli-debug log', or 'dig into the raw log'."
---

# CLI Debug Log Analysis

Ralph's CLI (Copilot CLI or Claude Code) produces a debug log (`*-cli-debug.log`) for every execution. This log is the richest data source for understanding what happened during a run — it contains per-subagent lifecycle events, tool call telemetry, model resolution, token usage, and context window pressure.

Typical log size: **10K–40K lines**. Never read the entire file at once — use `grep`, `sed`, and `awk` to extract targeted data.

## When to Use

- **Primary**: When the subagent-mapper's pre-extracted data is unavailable or incomplete
- **Fallback**: When you need to drill deeper into a specific subagent's behavior than the mapper provided
- **Debugging**: When investigating infrastructure issues (model fallback, MCP errors, context compaction)

## Log Structure

The cli-debug.log is a timestamped debug stream. Key event types:

| Event pattern | What it marks |
|---|---|
| `subagent_started` | Beginning of a subagent invocation span |
| `subagent_completed` | End of a subagent invocation span |
| `getOrCreateAgent.*final model` | Model resolved for a subagent |
| `tool_call_executed` | A tool was invoked (within the active span) |
| `assistant_usage` | LLM turn completed — contains token counts |
| `CompactionProcessor` | Context window compaction — shows `used/max (pct%)` |
| `falling back to session model` | Model fallback occurred |
| `"function"` | Function/tool name in a tool call (extractable for sequencing) |

## Extraction Recipes

### 1. Map all subagent spans

```bash
grep -n "subagent_started\|subagent_completed\|getOrCreateAgent.*final model" <cli-debug-file>
```

This gives you spans: each `subagent_started` is paired with the next `subagent_completed`. The `getOrCreateAgent` line between them tells you the agent name and resolved model.

### 2. Extract tool calls within a span

```bash
sed -n '<start_line>,<end_line>p' <cli-debug-file> | grep '"function"'
```

### 3. Count tool calls in a span

```bash
sed -n '<start_line>,<end_line>p' <cli-debug-file> | grep -c "tool_call_executed"
```

### 4. Count LLM turns in a span

```bash
sed -n '<start_line>,<end_line>p' <cli-debug-file> | grep -c "assistant_usage"
```

### 5. Extract token consumption

```bash
sed -n '<start_line>,<end_line>p' <cli-debug-file> | grep "assistant_usage"
```

Each `assistant_usage` telemetry event contains `input_tokens` and `output_tokens`. Sum them for total span consumption.

### 6. Detect context compaction

```bash
grep "CompactionProcessor" <cli-debug-file>
```

Output format: `<timestamp> ... CompactionProcessor ... <used>/<max> (<pct>%)`

Correlate compaction events with subagent spans (by line number) to identify which subagent triggered compaction.

### 7. Detect model fallback

```bash
sed -n '<start_line>,<end_line>p' <cli-debug-file> | grep "falling back to session model"
```

If present, the subagent's configured model was unavailable and the session's default model was used instead.

### 8. Extract errors within a span

```bash
sed -n '<start_line>,<end_line>p' <cli-debug-file> | grep -i "error\|failed\|exception" | head -20
```

### 9. Full tool sequence for a span (detailed)

```bash
sed -n '<start_line>,<end_line>p' <cli-debug-file> | grep '"function"' | head -50
```

### 10. Orchestrator-level overview

For events outside subagent spans (the orchestrator's own tool calls):

```bash
# All tool calls with line numbers
grep -n "tool_call_executed" <cli-debug-file>
```

Cross-reference with span boundaries to identify which tool calls belong to the orchestrator vs. subagents.

## Analysis Patterns

### Per-subagent quality assessment

After extracting a subagent's tool sequence (recipe 2), evaluate:

| Dimension | What to look for |
|---|---|
| Tool selection | Right tool for the role? (researchers: search/read, writers: create/edit, reviewers: diff/read) |
| Efficiency | Redundant reads, excessive retries, unnecessary searches |
| Error recovery | Did it detect and recover from failures? |
| Duration proportionality | Tool calls × complexity should be proportional to role |
| MCP utilization | Available MCP tools used vs. ignored |

### Context pressure assessment

After extracting compaction events (recipe 6):
- Map each event to its active subagent span
- Flag subagents with >80% context utilization
- Note any compaction that interrupted mid-task work

### Cross-subagent analysis

After mapping all spans (recipe 1):
- Compare tool call counts across subagents — are they proportional to role complexity?
- Identify duplicated work (same search terms in different subagent spans)
- Check dispatch order matches the expected workflow phases
