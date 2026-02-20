# Navigating the Copilot CLI — Help & Source

The Copilot CLI (`/usr/lib/node_modules/@github/copilot/`) ships a single **heavily minified** `index.js`. These techniques extract specific information without flooding context.

## CLI Help Subcommands

Start with built-in help before touching source:

```bash
copilot help              # flags, slash commands
copilot help config       # config.json keys (allowed_urls, model, log_level, etc.)
copilot help environment  # env vars (COPILOT_MODEL, XDG_CONFIG_HOME, etc.)
copilot help logging      # log levels (none/error/warning/info/debug/all)
copilot help permissions  # tool permission system
```

## Source Extraction Rules

The minified source uses 2-4 character variable names. Always use `grep -oP` with a **bounded context window** to avoid dumping kilobytes of minified code.

### Pattern: bounded context extraction

```bash
# Good — captures exactly what's needed (60-120 chars each side)
grep -oP '.{0,80}functionName.{0,80}' index.js | head -5

# Bad — unbounded match dumps entire minified lines
grep 'functionName' index.js
```

### Pattern: enum/constant discovery

```bash
# Find enum-like objects
grep -oP '[a-zA-Z]{2,4}=\{[A-Z][a-zA-Z]+:"[a-z_]+".{0,120}\}' index.js

# Find string constants assigned to short variables
grep -oP '[a-zA-Z$_]{2,4}="specific-string-value"' index.js
```

### Pattern: tracing a call chain

1. Find the function definition: `grep -oP 'function targetFn.{0,200}' index.js`
2. Find callers: `grep -oP '.{0,60}targetFn\(.{0,60}' index.js | head -10`
3. Widen context on a specific match: increase the `{0,N}` window

### Pattern: CLI flag to internal variable

```bash
# Find where a flag is parsed (flags use quotes in yargs/commander)
grep -oP '.{0,80}"--flag-name".{0,80}' index.js

# Trace the variable it's assigned to
grep -oP '.{0,60}flagVariable.{0,60}' index.js | head -10
```

## Key Internals (v0.0.411)

These are verified findings — use them as starting points, not as stable API:

| Concept | Details |
|---|---|
| Config dir resolver | `ad(settings, type)` — uses `settings?.configDir` when set, else XDG/homedir |
| MCP config loading | `LL.load()` in `kj()` — does NOT pass settings, so `--config-dir` is ignored for MCP. Use `--additional-mcp-config @<path>` instead |
| MCP tool ID format | `${clientName}-${toolName}` via `getToolIdFromClientAndToolName` |
| MCP tool filtering | `loadToolsFromProvider`: `if(!e.tools.includes("*")&&!e.tools.includes(s.name))` — per-server `tools` array in mcp-config.json |
| Per-server tools | `mcp-config.json` entries support a `tools: string[]` field (defaults to `["*"]`). Uses raw tool names (not prefixed) |
| `--available-tools` | Global filter across ALL tools (built-in + MCP). Requires listing built-in tools too. Prefer per-server `tools` in mcp-config.json |
| Log file naming | `process-${Date.now()}-${process.pid}.log` in the log directory |

## Undocumented Environment Variables

Found in source but not in `copilot help environment`:

| Variable | Purpose |
|---|---|
| `CPD_SAVE_TRAJECTORY_OUTPUT` | Save full model trajectory to file |
| `COPILOT_EVENTS_LOG_DIRECTORY` | Directory for structured event logs |
| `COPILOT_AGENT_ONLINE_EVALUATION_DISABLED` | Disable online eval |
| `COPILOT_SNIPPY_BLOCKING_MODE` | Internal blocking mode flag |

## Debugging with `--log-level debug`

```bash
copilot --log-level debug --log-dir ./logs -p "test prompt"
```

Debug output includes:
- Full model request/response JSON
- MCP server connect/disconnect events
- `Adding tool: <name>` for each registered tool
- `Skipping tool <name>` for tools filtered by the allowlist
- Token counts and context compaction stats
