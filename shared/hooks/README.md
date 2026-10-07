# shared/hooks

Audit hooks for the agent CLIs. The security overlay mounts this directory read-only at `/workspace/.ralph/hooks` (`${SHARED_HOOKS_PATH}`).

| Path                               | Role                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `log-*.sh`                         | Hook entry points, one per event. `--cli copilot\|claude` picks the payload adapter (default `copilot`)                                                                  |
| `claude/hooks.json`                | Claude Code `hooks` object for Ralph's session settings                                                                                                                  |
| `ralph-audit.json`                 | Copilot CLI hook config, mounted at `/workspace/.github/hooks/ralph-audit.json`                                                                                          |
| `lib/common.sh`                    | Argument parsing, failure policy and the single audit writer                                                                                                             |
| `lib/adapters/{claude,copilot}.jq` | Raw payload → v2 audit record, `ralph.log` line and tool-output block, before redaction                                                                                  |
| `lib/record.jq`                    | Helpers shared by the adapters: record layout, MCP name split, the envelope lines                                                                                        |
| `lib/redact.pl`                    | Scrubs credentials from every string of the envelope, cuts long audit text, prints the shell assignments; with `--text` or `--json-lines`, scrubs the host's transcripts |

## Contract for the Claude Code settings writer

- `claude/hooks.json` is the value of the `hooks` key in Ralph's session settings, mounted read-only at `/etc/ralph/claude-settings.json` and passed with `--settings`. Embed it unchanged.
- Every command is an absolute container path under `/workspace/.ralph/hooks/`, so the `shared/hooks` mount must stay in place.
- `RALPH_LOG_DIR` (default `/workspace/.ralph/logs`) must be writable by the CLI user. Scripts create it when missing.
- Image requirements: bash (5.x reads the clock without a `date` fork), jq ≥ 1.6 (tested on 1.6 and 1.7.1), perl 5 with no extra modules (`perl-base`, present on every Debian and Ubuntu image), coreutils. `flock` (util-linux) serialises appends from concurrent hooks; without it appends are unlocked.
- Host-side runs (`--settings <file>`, written per session by `src/cli/claude/claude-host-settings.ts`): every `/workspace/.ralph/hooks/` prefix is replaced with the shell-quoted absolute host path of `shared/hooks/`, and `RALPH_LOG_DIR` is the stage's `logs/` directory.
- Copilot CLI reads `ralph-audit.json`, mounted only into agent containers whose stages run it. Its commands pass no flag, so the scripts default to the Copilot adapter. Copilot CLI host-side stages run without Ralph's hooks.

## Behaviour

- **Exit status is always 0.** Claude Code reads exit 2 as "block", and jq exits 2 on malformed input. A hook that fails reports the failure on stderr, in `ralph.log` and as a `hook_error` audit record, then exits 0.
- **Stdout stays empty.** Claude Code adds `SessionStart` and `UserPromptSubmit` stdout to the model context.
- **Arguments are strict.** An unknown flag, a stray word or an event the CLI never emits becomes a `hook_error`, so a misspelt command is visible in the audit trail.
- **Claude Code payloads name their event.** The record event, `resultType` (`PostToolUseFailure` → `failure`) and the subagent start or stop come from `hook_event_name`. A payload without one, or one meant for another script (a `PostToolUse` payload sent to `log-pre-tool.sh`), becomes a `hook_error`, so a miswired `claude/hooks.json` entry shows up in the audit trail.
- **Redaction.** `lib/redact.pl` scrubs every string of the record, the `ralph.log` line and the tool-output block of: the literal values, at least 8 characters long, of credential variables in the hook environment (names containing `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `API_KEY` or `APIKEY`, `PRIVATE_KEY`, `CREDENTIAL`, or a `PAT` segment), `sk-ant-…`, `gh[pousr]_…` and `github_pat_…` tokens, `Authorization: Bearer|Basic|token …` values, URL passwords, `*TOKEN=…`-style assignments and `"…token": "…"`-style JSON fields. Literal values are replaced longest first, so one that contains another goes whole. Each pattern is a single scan, so the cost grows with the text length and not with the number of matches. `resultText` and `lastMessage` are cut after scrubbing, so a secret across the cut leaves no prefix behind.
- **Host-side transcript redaction.** The orchestrator runs the same script on the host (`HookRulesRedactor`, `src/logs/text-redactor.ts`) with its own environment, which holds every secret from `.env`, when `RunArtifactsDeriver` redacts a task's transcripts before one is attached to the work item. `--text` scrubs all of stdin as one UTF-8 text and prints it whole and uncut, for a transcript a CLI wrote itself. `--json-lines` reads one JSON string per line and prints each scrubbed on its own, one per line, for the texts of a transcript the orchestrator renders from Claude Code's session logs; the orchestrator cuts the quoted prompts and tool input and output only after scrubbing, so a secret across the cut leaves no prefix behind there either. What the host redacts, and what it leaves unredacted, is in [SECURITY.md](../../SECURITY.md#transcripts-logs-and-redaction).

Files written to `RALPH_LOG_DIR`:

| File                  | Content                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `audit.jsonl`         | One v2 record per event                                                                                |
| `pre-tool.log`        | The `pre_tool` record with `ts` in place of `timestamp` (streamed live to the host)                    |
| `tool-output.log`     | Full tool output: `── HH:MM:SS <tool> (<resultType>) ──` (UTC), `args: <args>`, the text, a blank line |
| `ralph.log`           | Human-readable session, error, tool-failure, subagent and compaction lines                             |
| `.current-session-id` | Copilot only: `ralph-YYYYMMDD-HHMMSS` minted at session start                                          |

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

| `event`                            | Claude Code hook                | Copilot hook        | Extra keys                                                                                          |
| ---------------------------------- | ------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `session_start`                    | SessionStart                    | sessionStart        | `source`, `initialPrompt` (`""` on Claude Code), `cwd`                                              |
| `prompt`                           | UserPromptSubmit                | userPromptSubmitted | `prompt`                                                                                            |
| `pre_tool`                         | PreToolUse                      | preToolUse          | `tool`, `toolUseId`, `toolKind`, `mcpServer`, `mcpTool`, `subagent`, `skill`, `args` (JSON text)    |
| `post_tool`                        | PostToolUse, PostToolUseFailure | postToolUse         | the `pre_tool` keys plus `resultType`, `resultText` (≤ 2000 chars + `...[truncated]`), `durationMs` |
| `error`                            | StopFailure                     | errorOccurred       | `errorName`, `errorMsg`, `errorStack`                                                               |
| `session_end`                      | SessionEnd                      | sessionEnd          | `reason`, `cwd`                                                                                     |
| `subagent_start` / `subagent_stop` | SubagentStart / SubagentStop    | —                   | `subagent`; stop adds `lastMessage` (truncated)                                                     |
| `compact`                          | PreCompact                      | —                   | `trigger`                                                                                           |
| `hook_error`                       | any                             | any                 | `hook`, `error`                                                                                     |

- `toolKind` is `subagent`, `skill`, `shell`, `file`, `mcp` or `other`. Claude Code: `Agent`/`Task` → subagent, `Skill` → skill, `Bash` → shell, `Read`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit`/`Glob`/`Grep` → file, `mcp__<server>__<tool>` → mcp. Copilot: `task` → subagent, `skill` → skill, `bash` and the `*_bash` session tools → shell, `view`/`edit`/`create`/`glob`/`grep` → file, everything else (MCP tools included) → other.
- `subagent` comes from `tool_input.subagent_type` (Claude Code) or `args.agent_type` (Copilot), `skill` from `.skill`. `toolUseId` and `durationMs` are `null` for Copilot.
- Claude Code `resultType` is `success` for PostToolUse and `failure` for PostToolUseFailure, whose `error` becomes `resultText`. `resultText` is taken from Bash `stdout`/`stderr`, the text blocks of Agent and MCP results, or Read `file.content`; other structured results are serialised without `originalFile`.
- Values of an unexpected type are serialised to a string, so every key keeps its type.
