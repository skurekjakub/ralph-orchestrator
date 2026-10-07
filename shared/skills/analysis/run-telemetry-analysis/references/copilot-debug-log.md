# Copilot CLI debug log

A run on GitHub Copilot CLI leaves no run telemetry. Its debug log (`<key>-<startTs>-<ts>-cli-debug.log`) is the richest data source instead: per-subagent lifecycle events, tool call telemetry, model resolution, token usage and context window pressure.

Typical size: **10K–40K lines**. Never read the whole file: use `grep -n` to find line numbers, then read a range with `head` and `tail`. `head -n <end_line> <file> | tail -n +<start_line>` prints lines `<start_line>` to `<end_line>`.

## Log structure

| Event pattern                   | What it marks                                                  |
| ------------------------------- | -------------------------------------------------------------- |
| `subagent_started`              | Beginning of a subagent invocation span                        |
| `subagent_completed`            | End of a subagent invocation span                              |
| `getOrCreateAgent.*final model` | Model resolved for a subagent                                  |
| `tool_call_executed`            | A tool was invoked (within the active span)                    |
| `assistant_usage`               | LLM turn completed — contains token counts                     |
| `CompactionProcessor`           | Context window compaction — shows `used/max (pct%)`            |
| `falling back to session model` | Model fallback occurred                                        |
| `"function"`                    | Function/tool name in a tool call (extractable for sequencing) |

## Recipes

### 1. Map all subagent spans

```bash
grep -n "subagent_started\|subagent_completed\|getOrCreateAgent.*final model" <cli-debug-file>
```

Each `subagent_started` pairs with the next `subagent_completed`. The `getOrCreateAgent` line between them names the agent and its resolved model:

```
<line>: <ts> [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_started)
<line>: <ts> [DEBUG] Agent "<family>.<name>" getOrCreateAgent: final model="<model>"
  ... tool calls, LLM turns, tool results ...
<line>: <ts> [DEBUG] Sending telemetry event: copilot-cli/cli.telemetry (kind: subagent_completed)
```

### 2. Tool calls within a span

```bash
head -n <end_line> <cli-debug-file> | tail -n +<start_line> | grep '"function"'
```

### 3. Count tool calls in a span

```bash
head -n <end_line> <cli-debug-file> | tail -n +<start_line> | grep -c "tool_call_executed"
```

### 4. Count LLM turns in a span

```bash
head -n <end_line> <cli-debug-file> | tail -n +<start_line> | grep -c "assistant_usage"
```

### 5. Token consumption

```bash
head -n <end_line> <cli-debug-file> | tail -n +<start_line> | grep "assistant_usage"
```

Each `assistant_usage` event carries `input_tokens` and `output_tokens`; their sum over a span is an estimate of its consumption.

### 6. Context compaction

```bash
grep -n "CompactionProcessor" <cli-debug-file>
```

Each line shows `<used>/<max> (<pct>%)`. Correlate the line numbers with the span boundaries to find which subagent filled its context.

### 7. Model fallback

```bash
head -n <end_line> <cli-debug-file> | tail -n +<start_line> | grep "falling back to session model"
```

A hit means the subagent's configured model was unavailable and the session's model ran it instead.

### 8. Errors within a span

```bash
head -n <end_line> <cli-debug-file> | tail -n +<start_line> | grep -i "error\|failed\|exception" | head -20
```

### 9. Orchestrator-level tool calls

```bash
grep -n "tool_call_executed" <cli-debug-file>
```

Calls outside every span's line range belong to the orchestrator itself.
