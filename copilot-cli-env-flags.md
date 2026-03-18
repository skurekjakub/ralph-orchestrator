# Copilot CLI Environment Flags — Reference

> Reverse-engineered from `~/.copilot/pkg/universal/1.0.6/app.js` (CLI v1.0.6, March 2026).
> Verified against v0.0.421 — behavior identical unless noted.

---

## How flags work

There are two distinct override mechanisms:

### 1. Named feature flags (as env vars)

Every entry in the internal feature flag table can be overridden by setting an env var with **the same name**:

```js
for (let key of Object.keys(featureFlagTable)) {
  let val = process.env[key];
  if (val?.toLowerCase() === "true")  flags[key] = true;
  if (val?.toLowerCase() === "false") flags[key] = false;
}
```

Default availability tiers: `"on"` | `"off"` | `"experimental"` | `"staff"` | `"staff-or-experimental"` | `"team"`.

### 2. Bulk feature flag enable

```bash
export COPILOT_CLI_ENABLED_FEATURE_FLAGS="FLAG_ONE,FLAG_TWO"
```

Comma-separated list of flag names to force-enable in addition to per-name vars.

---

## Feature flags (env var = flag name)

| Flag (set as env var) | Default tier | What it gates |
|---|---|---|
| `COPILOT_SWE_AGENT_BACKGROUND_AGENTS` | `on` | Adds `mode: "background"` to the `task` tool schema; registers `list_background_agents` and `get_background_agent_result` tools. When `false`, all sub-agent calls are sync-only — no parallel background agents possible. |
| `COPILOT_SWE_AGENT_PARALLEL_TASK_EXECUTION` | `on` | When `false`, enables a per-file-path FIFO serial queue (`AP` class) inside the task tool's file write operations. Does **not** affect whether multiple agents run in parallel — it serializes concurrent writes to the same path within a single agent. |
| `MULTI_TURN_AGENTS` | `on` | Controls whether background mode messaging tells the LLM to use background agents for multi-turn refinement workflows. |
| `CONFIGURE_COPILOT_AGENT` | `experimental` | Enables the `configure-copilot` sub-agent: *"Agent for managing Copilot CLI MCP server configuration — add/remove/modify MCP servers, edit config files, reload servers automatically."* Setting `CONFIGURE_COPILOT_AGENT=true` forces it on without needing `--experimental`. |
| `FLEET_COMMAND` | `on` | Enables the `/fleet` slash command (parallel sub-agent dispatch via a system prompt injection). |
| `PLAN_COMMAND` | `on` | Enables the `/plan` slash command. |
| `PLUGIN_COMMAND` | `on` | Enables the `/plugin` slash command. |
| `AUTOPILOT_MODE` | `on` | Enables `--yolo` / autopilot (non-interactive) execution. |
| `CUSTOM_AGENTS` | `on` | Custom agent definitions from `.github/agents/` etc. |
| `CCA_DELEGATE` | `on` | CCA (Copilot Coding Agent) delegation. |
| `CONTINUITY` | `on` | Session continuity (`--continue` flag). |
| `LSP_TOOLS` | `on` | Language server protocol tools (go-to-definition, hover, etc.). |
| `PERSISTED_PERMISSIONS` | `staff-or-experimental` | Persists approved tool permissions across sessions per workspace location. |
| `SUBAGENT_COMPACTION` | `staff-or-experimental` | Uses context compaction instead of truncation when sub-agent context fills up. |
| `SESSION_STORE` | `staff-or-experimental` | SQLite-backed cross-session history store with FTS5 search. |
| `SESSION_CLEANUP` | `staff-or-experimental` | Adds `/session cleanup` and `/session prune` commands. |
| `TOOL_SEARCH` | `staff` | Tool search capability. |
| `CONTENT_EXCLUSION` | `staff` | Copilot content exclusion / `.copilotignore` rules. |
| `CHILD_CUSTOM_INSTRUCTIONS` | `staff` | Sub-agents inherit custom instructions from parent. |
| `CONTINUITY_REMOTE_CONTROL` | `staff` | Remote session control for continuity. |
| `QUEUED_COMMANDS` | `staff` | Command queueing. |
| `STATUS_LINE` | `experimental` | User-defined script executed to produce a status line. |
| `SHOW_FILE` | `experimental` | Tool that shows code snippets inline in the timeline. |
| `ASK_USER_ELICITATION` | `experimental` | Replaces standard `ask_user` tool with a structured form-based variant. |
| `EXTENSIONS` | `team` | Extensions support. |
| `DISABLE_WEB_TOOLS` | `off` | |
| `DYNAMIC_INSTRUCTIONS_RETRIEVAL` | `off` | |
| `CODEX_FOR_SUBAGENTS` | `off` | |

---

## Behavioral env vars (not feature flags)

These are read directly by `process.env` — they are not part of the flag table and cannot be toggled via `COPILOT_CLI_ENABLED_FEATURE_FLAGS`.

### Timeouts & resource limits

| Env var | Default | What it does |
|---|---|---|
| `COPILOT_TASK_WAIT_TIMEOUT_SECONDS` | `600` (10 min) | How long the session waits for in-flight background agents to finish before force-quitting. The log message says *"Set COPILOT_TASK_WAIT_TIMEOUT_SECONDS to increase."* `copilot-start.sh` sets this to `360000` (≈100 hours) to avoid premature termination. |
| `COPILOT_BACKGROUND_COMPACTION_THRESHOLD` | `0.8` | Float 0–1. Context fill fraction that triggers background compaction. Lower = compaction starts earlier. Relevant for long-running sessions like fractal-factory. |
| `COPILOT_BUFFER_EXHAUSTION_THRESHOLD` | `0.95` | Float 0–1. Context fill fraction treated as exhausted (forces truncation or session end). |
| `COPILOT_LARGE_OUTPUT_THRESHOLD_BYTES` | `20480` (20 KB) | Tool output above this size is truncated/summarized before being returned to the LLM. |
| `COPILOT_LARGE_OUTPUT_MAX_BYTES` | (per-session default) | Hard cap on tool output size in bytes. Example values: `10485760` = 10 MB, `104857600` = 100 MB. |

### Model selection

| Env var | Default | What it does |
|---|---|---|
| `COPILOT_MODEL` | (from auth/config) | Override the main agent model (e.g. `claude-opus-4`). |
| `COPILOT_MODEL_FAMILY` | — | Override model family selection. |
| `COPILOT_AGENT_MODEL` | — | Override the model specifically for sub-agent invocations. |

### Paths & directories

| Env var | Default | What it does |
|---|---|---|
| `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` | — | Comma-separated additional directories to scan for `copilot-instructions.md` and `AGENTS.md` files. These are merged with the default `.github/` scan. |
| `COPILOT_HOME` | `~/.copilot` | Home directory for CLI state and config. |
| `COPILOT_CACHE_HOME` | — | Override cache directory. |
| `COPILOT_EVENTS_LOG_DIRECTORY` | — | Directory for structured events log output. |

### Debugging & development

| Env var | Default | What it does |
|---|---|---|
| `COPILOT_KEEP_TEMP_FILES` | `false` | Set to `"true"` to skip cleanup of temp files after a run — useful for inspecting intermediate artifacts. |
| `COPILOT_DEBUG_BROWSER` | — | Enables browser debug mode. |
| `COPILOT_DEBUG_CONTENT_EXCLUSION_API_URL` | — | Override the content exclusion API endpoint for testing. |
| `COPILOT_SNIPPY_BLOCKING_MODE` | — | Controls whether content exclusion (snippy) runs synchronously in blocking mode. |
| `CPD_SAVE_TRAJECTORY_OUTPUT` | — | Path to write the full agent trajectory (tool calls + responses) as a JSON file. |

### Update & terminal

| Env var | Default | What it does |
|---|---|---|
| `COPILOT_AUTO_UPDATE` | `true` | Set to `"false"` to disable automatic CLI self-update on startup. Equivalent to passing `--no-auto-update`. Disabled automatically in CI environments. |
| `COPILOT_SETUP_TERMINAL` | — | Set to `"false"` to suppress the one-time terminal-integration setup prompt (shell integration, iTerm2, etc.). |

### Sessions & continuity

| Env var | Default | What it does |
|---|---|---|
| `COPILOT_USE_SESSIONS` | — | Opt into the session history store (see `SESSION_STORE` feature flag). |
| `COPILOT_USE_ASYNC_SESSIONS` | — | Use the async variant of the session store. |

### Telemetry & observability

| Env var | Default | What it does |
|---|---|---|
| `COPILOT_OTEL_ENABLED` | `false` | Enable OpenTelemetry export. |
| `COPILOT_OTEL_EXPORTER_TYPE` | — | `"otlp-http"` or other exporter type. |
| `COPILOT_OTEL_FILE_EXPORTER_PATH` | — | Write OTEL spans to a file instead. |
| `COPILOT_OTEL_SOURCE_NAME` | — | Override the OTEL service name attribute. |
| `COPILOT_TRACE_PARENT` | — | W3C traceparent header for distributed tracing continuity. |

---

## `copilot-start.sh` — rationale for current flags

```bash
export COPILOT_TASK_WAIT_TIMEOUT_SECONDS=360000   # prevent premature exit while factory loop runs
export CONFIGURE_COPILOT_AGENT=true               # force-enable MCP config sub-agent (normally experimental-only)
export COPILOT_SWE_AGENT_BACKGROUND_AGENTS=false  # disable background/parallel sub-agents — fractal-factory must run sequentially
export COPILOT_SWE_AGENT_PARALLEL_TASK_EXECUTION=false  # serialize concurrent file writes within the agent
```

`--experimental` on the `copilot` invocation enables the `experimental` tier flags (e.g. `STATUS_LINE`, `SHOW_FILE`, `ASK_USER_ELICITATION`) but `CONFIGURE_COPILOT_AGENT=true` is set redundantly as an env var so it remains enabled even if `--experimental` is dropped.

---

## Flags worth tuning for long-running sessions

If fractal-factory sessions are being truncated or compacted too aggressively:

```bash
# Start compaction later (default 0.8 = 80% full)
export COPILOT_BACKGROUND_COMPACTION_THRESHOLD=0.9

# Treat context as exhausted later (default 0.95)
export COPILOT_BUFFER_EXHAUSTION_THRESHOLD=0.98

# Enable subagent compaction (uses compaction instead of truncation for sub-agents)
export SUBAGENT_COMPACTION=true
```

---

*Sources: `~/.copilot/pkg/universal/1.0.6/app.js`, `~/.copilot/pkg/universal/0.0.421/index.js`, `~/.copilot/pkg/linux-x64/0.0.411/index.js`. Last verified 2026-03-18.*
