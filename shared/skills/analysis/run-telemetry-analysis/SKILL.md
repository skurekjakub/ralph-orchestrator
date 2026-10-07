---
name: run-telemetry-analysis
description: "Analyze a finished Ralph run from its run telemetry file (`*-claude-run-telemetry.json`): the main thread and every subagent span with its tool calls, failed calls, model calls, API errors, context compactions and durations, plus the audit log for tool arguments and results. Includes the cli-debug.log recipes for Copilot CLI runs, which have no telemetry. Use it to map a run's subagents, drill into one subagent's tool sequence or errors, or check context pressure and API failures."
---

# Run Telemetry Analysis

Every finished task leaves its logs in one task log directory, `<key>-<startTs>/`. Find the data source first:

```bash
ls <task-log-dir>/*-run-telemetry.json <task-log-dir>/*-audit.jsonl <task-log-dir>/*-cli-debug.log
```

| File                         | Present for          | Holds                                                                                          |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `*-claude-run-telemetry.json` | Claude Code runs     | **Primary source.** One span per main thread and subagent: tool calls, errors, compactions     |
| `*-audit.jsonl`              | every run            | One record per hook event: tool arguments, results, subagent start and stop                    |
| `*-summary.json`             | every run            | Status, failure reason, duration, exit code, session ids                                       |
| `*-cli-debug.log`            | Copilot CLI runs     | Copilot's debug stream; see [references/copilot-debug-log.md](references/copilot-debug-log.md) |
| `*-claude-cli-debug.log`     | Claude Code runs     | Claude Code's own debug log: startup, settings, hook and API diagnostics, not spans            |

When there is no telemetry file and no Copilot debug log, the CLI never started a session: analyse the summary, the proxy log (`*-proxy.log`) and the sidecar log (`*-sidecar.log`) instead.

Read these files with `jq`, `grep`, `ls`, `wc`, `head` and `tail`. Pass each file's path to the command directly; never read a whole log into your context.

## Telemetry layout

The file is one JSON object, `schemaVersion` 1. Timestamps are epoch milliseconds (UTC); a field the logs did not carry is left out. It holds no free text: tool arguments and results are in the audit log.

| Field        | Meaning                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `cli`        | `claude`                                                                                                    |
| `sessionIds` | Session ids in start order: one per stage, plus one per continuation that started a session                 |
| `totals`     | `sessions`, `subagents`, `toolCalls`, `failedToolCalls`, `modelCalls`, `apiErrors`, `compactions`, `hookFeedback`, `malformedLines`, `durationMs` |
| `spans[]`    | One per agent thread                                                                                        |

Each span:

| Field                  | Meaning                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `spanId`               | The session id for a main thread, `<session id>/<agent id>` for a subagent                |
| `parentSpanId`         | The span whose tool call spawned this subagent; absent for a main thread                 |
| `agent`                | The agent that ran: the stage root's name, or the subagent's frontmatter name             |
| `depth`                | 0 for a main thread, the spawn depth for a subagent                                       |
| `toolUseId`            | The tool call that spawned the subagent                                                   |
| `models`               | Models that answered, in order of first use                                               |
| `startTs`, `endTs`, `durationMs` | When the span ran                                                               |
| `modelCalls`           | Distinct model responses                                                                  |
| `toolCalls[]`          | `toolUseId`, `tool`, `ts`, `durationMs`, `isError` (a denied call counts as an error), `spawnedSpanId` |
| `apiErrors[]`          | `ts`, `kind` (for example `authentication_failed`, `rate_limit`)                         |
| `compactions[]`        | `ts`, `trigger` (`auto` or `manual`)                                                     |
| `hookFeedback[]`       | `ts`, `hook`: feedback a blocking hook gave the model, by hook event                      |

## Recipes

Replace `<telemetry>` and `<audit>` with the file paths `ls` printed.

### 1. Run overview

```bash
jq '.totals' <telemetry>
```

### 2. Map every span

```bash
jq -r '.spans[] | [.spanId, (.parentSpanId // "-"), .agent, .depth, .modelCalls, (.toolCalls | length), (.durationMs // "?")] | @tsv' <telemetry>
```

Each subagent span's `parentSpanId` and `toolUseId` tie it to the tool call that spawned it, so the rows form the dispatch tree.

### 3. One agent's spans

```bash
jq '[.spans[] | select(.agent == "<agent-name>") | del(.toolCalls)]' <telemetry>
```

An agent dispatched several times has several spans; analyse each.

### 4. Tool sequence of one agent

```bash
jq -r '.spans[] | select(.agent == "<agent-name>") | .toolCalls[] | [.ts, .tool, (.durationMs // ""), (if .isError then "ERROR" else "" end)] | @tsv' <telemetry>
```

### 5. Tool call counts per agent

```bash
jq -r '.spans[] | .agent as $agent | .toolCalls | group_by(.tool)[] | [$agent, .[0].tool, length] | @tsv' <telemetry>
```

### 6. Failed and denied tool calls

```bash
jq -r '.spans[] | .agent as $agent | .toolCalls[] | select(.isError == true) | [$agent, .tool, .toolUseId] | @tsv' <telemetry>
```

The audit log holds the error text of each one (recipe 9).

### 7. API errors, compactions and hook feedback

```bash
jq '[.spans[] | select((.apiErrors | length) > 0 or (.compactions | length) > 0 or (.hookFeedback | length) > 0) | {agent, apiErrors, compactions, hookFeedback}]' <telemetry>
```

A compaction means the agent's context filled up; correlate its `ts` with the tool sequence to see what work it interrupted. Ralph's own hooks never block, so hook feedback comes from the target repository's hooks, which load only when the profile sets `claude.loadRepoInstructions`; feedback on `Stop` means such a hook sent the agent back to work.

### 8. Slowest tool calls

```bash
jq -r '[.spans[] | .agent as $agent | .toolCalls[] | select(.durationMs != null) | [$agent, .tool, .durationMs]] | sort_by(.[2]) | reverse | .[:15][] | @tsv' <telemetry>
```

### 9. Tool arguments and results from the audit log

Audit records carry `event`, `agent`, `agentId`, `tool`, `toolUseId`, `args` (JSON text), `resultType` and `resultText` (cut at 2000 characters). A `toolUseId` from the telemetry finds its records:

```bash
grep -c '' <audit>
jq -c 'select(.toolUseId == "<tool-use-id>") | {event, tool, args, resultType, resultText}' <audit>
jq -c 'select(.event == "pre_tool" and .agent == "<agent-name>") | {tool, args}' <audit>
jq -c 'select(.event == "post_tool" and .resultType == "failure") | {agent, tool, resultText}' <audit>
jq -c 'select(.event == "subagent_start" or .event == "subagent_stop") | {event, agent, subagent, timestamp}' <audit>
jq -c 'select(.event == "error" or .event == "hook_error")' <audit>
```

## Analysis patterns

### Per-subagent quality

From an agent's tool sequence (recipe 4) and its audit records (recipe 9):

| Dimension                | What to look for                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Tool selection           | Right tool for the role? (researchers: search/read, writers: create/edit, reviewers: diff/read) |
| Efficiency               | Redundant reads, excessive retries, unnecessary searches                                        |
| Error recovery           | Did it detect and recover from failed and denied calls?                                         |
| Duration proportionality | Tool calls × complexity should be proportional to the role                                      |
| MCP utilization          | Available MCP tools (`mcp__<server>__<tool>`) used vs. ignored                                  |
| Skill utilization        | `Skill` calls for the skills the agent should load                                              |

### Context pressure

- Count compactions per span (recipe 7); more than one in a span means the agent kept running out of context.
- Note any compaction in the middle of a write or review step.

### Cross-subagent analysis

- Compare tool call counts across subagents (recipe 5): are they proportional to role complexity?
- Look for duplicated work: the same search or file reads in different spans.
- Check that the dispatch order in the span tree (recipe 2) matches the expected workflow phases.
