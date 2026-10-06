# shared/hooks

Audit hooks for the agent CLIs and the Claude Code result gate. The security overlay mounts this directory read-only at `/workspace/.ralph/hooks` (`${SHARED_HOOKS_PATH}`).

| Path                               | Role                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `log-*.sh`                         | Hook entry points, one per event. `--cli copilot\|claude` picks the payload adapter (default `copilot`)             |
| `claude/hooks.json`                | Claude Code `hooks` object for managed settings                                                                     |
| `claude/result-gate.sh`            | Claude Code `Stop` hook that enforces the result block                                                              |
| `ralph-audit.json`                 | Copilot CLI hook config, mounted at `/workspace/.github/hooks/ralph-audit.json`                                     |
| `lib/common.sh`                    | Argument parsing, failure policy and the single audit writer                                                        |
| `lib/adapters/{claude,copilot}.jq` | Raw payload → v2 audit record                                                                                       |
| `lib/record.jq`                    | Helpers shared by the adapters: redaction, truncation, MCP name split, result-block detection                       |
| `lib/normalize.sh`                 | `normalize.sh <cli> <event> [--failure] < payload` prints the v2 record without writing logs (replay and debugging) |

## Contract for the Claude Code settings writer

- `claude/hooks.json` is the value of the `hooks` key in `/etc/claude-code/managed-settings.json`. Embed it unchanged.
- Every command is an absolute container path under `/workspace/.ralph/hooks/`, so the `shared/hooks` mount must stay in place.
- Per-exec environment read by the result gate: `RALPH_REQUIRE_RESULT_BLOCK` (`1` turns the gate on; unset or anything else allows every stop) and `RALPH_RESULT_GATE_MAX` (blocks allowed per session, default `2`, `0` never blocks).
- `RALPH_LOG_DIR` (default `/workspace/.ralph/logs`) must be writable by the CLI user. Scripts create it when missing.
- Image requirements: bash (5.x reads the clock without a `date` fork), jq ≥ 1.6 (tested on 1.6 and 1.7.1), coreutils. `flock` (util-linux) serialises appends from concurrent hooks; without it appends are unlocked.
- Host-side runs (`--settings <file>`): replace the `/workspace/.ralph/hooks/` prefix with the absolute host path of `shared/hooks/`, set `RALPH_LOG_DIR` in the CLI environment, and leave `RALPH_REQUIRE_RESULT_BLOCK` unset unless the stage must print a result block.
- Copilot keeps using `ralph-audit.json`. Its commands pass no flag, so the scripts default to the Copilot adapter.

## Behaviour

- **Exit status is always 0.** Claude Code reads exit 2 as "block", and jq exits 2 on malformed input. A hook that fails reports the failure on stderr, in `ralph.log` and as a `hook_error` audit record, then exits 0.
- **Stdout stays empty.** Claude Code adds `SessionStart` and `UserPromptSubmit` stdout to the model context. Only the result gate prints, and only its block decision.
- **Arguments are strict.** An unknown flag, a stray word, `--failure` outside `log-post-tool.sh` or an event the CLI never emits becomes a `hook_error`, so a misspelt command is visible in the audit trail.
- **Redaction.** Free text (`args`, `prompt`, `initialPrompt`, `resultText`, `errorMsg`, `errorStack`, `lastMessage`, tool-output blocks) is scrubbed of: the literal values of credential variables in the hook environment (names containing `TOKEN`, `SECRET`, `PASSWORD`, `API_KEY`, `PRIVATE_KEY`, `CREDENTIAL`, or a `PAT` segment), `sk-ant-…`, `gh[pousr]_…` and `github_pat_…` tokens, `Authorization: Bearer|Basic|token …` values, URL passwords, `*TOKEN=…`-style assignments and `"…token": "…"`-style JSON fields.

Files written to `RALPH_LOG_DIR`:

| File                        | Content                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `audit.jsonl`               | One v2 record per event                                                                                |
| `pre-tool.log`              | The `pre_tool` record with `ts` in place of `timestamp` (streamed live to the host)                    |
| `tool-output.log`           | Full tool output: `── HH:MM:SS <tool> (<resultType>) ──` (UTC), `args: <args>`, the text, a blank line |
| `ralph.log`                 | Human-readable session, error, tool-failure, subagent, compaction and result-gate lines                |
| `.current-session-id`       | Copilot only: `ralph-YYYYMMDD-HHMMSS` minted at session start                                          |
| `.result-gate-<session_id>` | Number of result-gate blocks issued in that session                                                    |

## Audit record v2

Every record starts with the same keys:

| Key             | Type             | Claude Code                                        | Copilot CLI                           |
| --------------- | ---------------- | -------------------------------------------------- | ------------------------------------- |
| `schemaVersion` | `2`              |                                                    |                                       |
| `event`         | string           | see below                                          | see below                             |
| `timestamp`     | number, epoch ms | hook clock (payloads carry no time)                | payload `timestamp`, else hook clock  |
| `session`       | string           | `session_id`                                       | `.current-session-id`, else `unknown` |
| `cli`           | string           | `claude`                                           | `copilot`                             |
| `agent`         | string \| null   | `agent_type`, the running agent's frontmatter name | `null`                                |
| `agentId`       | string \| null   | `agent_id`, set inside subagents                   | `null`                                |

Per event:

| `event`                                       | Claude Code hook                | Copilot hook        | Extra keys                                                                                          |
| --------------------------------------------- | ------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `session_start`                               | SessionStart                    | sessionStart        | `source`, `initialPrompt` (`""` on Claude Code), `cwd`                                              |
| `prompt`                                      | UserPromptSubmit                | userPromptSubmitted | `prompt`                                                                                            |
| `pre_tool`                                    | PreToolUse                      | preToolUse          | `tool`, `toolUseId`, `toolKind`, `mcpServer`, `mcpTool`, `subagent`, `skill`, `args` (JSON text)    |
| `post_tool`                                   | PostToolUse, PostToolUseFailure | postToolUse         | the `pre_tool` keys plus `resultType`, `resultText` (≤ 2000 chars + `...[truncated]`), `durationMs` |
| `error`                                       | StopFailure                     | errorOccurred       | `errorName`, `errorMsg`, `errorStack`                                                               |
| `session_end`                                 | SessionEnd                      | sessionEnd          | `reason`, `cwd`                                                                                     |
| `subagent_start` / `subagent_stop`            | SubagentStart / SubagentStop    | —                   | `subagent`; stop adds `lastMessage` (truncated)                                                     |
| `compact`                                     | PreCompact                      | —                   | `trigger`                                                                                           |
| `result_gate_block` / `result_gate_exhausted` | Stop (result gate)              | —                   | `blocks`, `max`                                                                                     |
| `hook_error`                                  | any                             | any                 | `hook`, `error`                                                                                     |

- `toolKind` is `subagent`, `skill`, `shell`, `file`, `mcp` or `other`. Claude Code: `Agent`/`Task` → subagent, `Skill` → skill, `Bash` → shell, `Read`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit`/`Glob`/`Grep` → file, `mcp__<server>__<tool>` → mcp. Copilot: `task` → subagent, `skill` → skill, `bash` and the `*_bash` session tools → shell, `view`/`edit`/`create`/`glob`/`grep` → file, everything else (MCP tools included) → other.
- `subagent` comes from `tool_input.subagent_type` (Claude Code) or `args.agent_type` (Copilot), `skill` from `.skill`. `toolUseId` and `durationMs` are `null` for Copilot.
- Claude Code `resultType` is `success` for PostToolUse and `failure` for PostToolUseFailure, whose `error` becomes `resultText`. `resultText` is taken from Bash `stdout`/`stderr`, the text blocks of Agent and MCP results, or Read `file.content`; other structured results are serialised without `originalFile`.
- Values of an unexpected type are serialised to a string, so every key keeps its type.

## Result gate

`claude/result-gate.sh` allows the stop when the gate is off, when a background task is still running, or when `last_assistant_message` or a main-thread assistant text block in `transcript_path` holds `===RALPH_RESULT_START===` followed by `===RALPH_RESULT_END===`. User prompts, queue entries, sidechain (subagent) messages and tool inputs do not count. Otherwise it records `result_gate_block` and prints `{"decision":"block","reason":…}` until the session has used `RALPH_RESULT_GATE_MAX` blocks, after which it records `result_gate_exhausted` and allows the stop; the orchestrator's result contract decides from there. The count is never reset, so a `--resume` continuation shares the budget. Any failure allows the stop, and a `stop_hook_active` stop with no stored count is allowed because the gate cannot show it is under the limit.

## Payload provenance

The fixtures in `tests/hooks/fixtures/claude/` are captured from Claude Code 2.1.292 for PreToolUse, SessionStart, UserPromptSubmit, StopFailure and SessionEnd. The PostToolUse, PostToolUseFailure, SubagentStart, SubagentStop, PreCompact and Stop payloads follow the documented hook input shapes with values from captured stream-json and have not been captured from a live run yet.
