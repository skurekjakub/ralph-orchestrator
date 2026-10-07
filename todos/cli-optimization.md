# CLI Optimization — Copilot Headless Mode & Claude Code Hardening

> **Superseded.** Claude Code is the default runtime CLI and Copilot CLI the secondary one; this plan describes an earlier state of the code. For the runtime as built, read `AGENTS.md` § Subsystems, `ARCHITECTURE.md` and `docs/user-guide/`.

## What This Is

Two parallel efforts to improve the AI CLI layer:

1. **Copilot CLI headless review**: Audit the [CLI command reference](https://docs.github.com/en/copilot/reference/cli-command-reference) for flags or modes that could improve results when running without a TTY
2. **Claude Code CLI hardening**: Address the security and reliability gaps that led to Claude Code being disabled, then re-enable it as a supported CLI option

## Copilot CLI — Headless Optimization

### Current Invocation

```
copilot \
  --config-dir /workspace/.ralph \
  --additional-mcp-config @/workspace/.ralph/mcp-config.json \
  --agent ralph.ralph \
  --model claude-opus-4.6 \
  --disable-builtin-mcps \          # or --add-github-mcp-tool
  --log-level debug \
  --log-dir /workspace/.ralph/logs/cli-debug \
  --experimental \
  --allow-all-tools \
  --allow-all-paths \
  --share /workspace/.ralph/logs/session-transcript.md \
  -p "<prompt>"
```

### Questions to Investigate

The Copilot CLI docs may reveal flags or configuration options relevant to headless execution:

- **Context window management**: Is there a flag to control max context size, conversation history, or token budget? In headless mode, the agent can't ask for clarification — it needs to work within constraints.
- **Tool approval modes**: `--allow-all-tools` and `--allow-all-paths` are blanket approvals. Are there more granular flags (allow specific tool categories, allow tools matching a pattern)?
- **Output format**: Is there a structured output mode (JSON) instead of the default markdown transcript? Structured output would simplify result parsing.
- **Retry/resilience**: Does the CLI have built-in retry for transient API failures, or does the orchestrator need to handle that externally?
- **Model fallback**: Can a fallback model be specified if the primary model is unavailable?
- **Session management**: Any flags for session persistence, resume, or checkpointing? Useful for long-running tasks that might be interrupted.
- **Cost tracking**: Any flags that emit token usage or cost information?
- **Tool timeout**: Can per-tool timeouts be set via config? Prevents a single MCP tool call from hanging the session.

### Codebase Impact

Findings would primarily affect:

- `CopilotExecutor.run()` — additional flags in the command array
- `profile-setup.ts` — new config file generation if config-based settings are needed
- `config.ts` — new profile-level options if settings vary per profile
- Possibly `StreamCapture` if output format changes affect parsing

## Claude Code CLI — Hardening & Re-enable

### Why It Was Disabled

The `CliExecutorFactory` currently blocks Claude Code:

```typescript
// src/container/cli-executor-factory.ts
"GH_TOKEN is required — Copilot CLI is the only supported CLI. Set GH_TOKEN in .env";
```

The Claude Code executor exists (`claude-code-executor.ts`) and structurally works, but was disabled because:

1. **No URL restrictions**: Copilot CLI has `--config-dir` with `allowed_urls` in `config.json` and `--additional-mcp-config` for controlled MCP loading. Claude Code has no equivalent URL restriction mechanism — the only network control is the Squid proxy.
2. **`--dangerously-skip-permissions`**: Required for headless execution but gives the CLI full filesystem and shell access. Combined with no URL restrictions, this is a wider attack surface.
3. **No audit hooks**: Copilot CLI supports pre/post tool-use hooks (`shared/hooks/`) that log every tool invocation to the audit JSONL. Claude Code has no hook system — tool usage is only visible in the session output.
4. **No transcript export**: Copilot has `--share <path>` for session transcripts. Claude Code outputs to stdout, which is captured but not as cleanly structured.
5. **MCP config differences**: Both share `mcp-config.json` format, but validation behavior differs. Claude's `--strict-mcp-config` helps but isn't the same as Copilot's fine-grained control.

### What Hardening Means

**Network layer** (already in place):

- Squid proxy blocks all non-allowlisted domains
- Internal-only Docker network prevents direct egress
- This is the same for both CLIs — Claude Code benefits equally

**Filesystem layer** (needs work):

- Read-only mounts for agent templates and configs (already done via compose)
- `cleanPaths` wipe between runs (already done)
- Consider: mount the target repo as a separate volume with restricted write paths

**Audit layer** (needs work):

- Parse Claude Code's stdout output for tool-use patterns (function calls, file writes, shell commands)
- Build an equivalent audit trail from parsed output since hooks aren't available
- The `StreamCapture` already captures all output — add a parsing layer on top

**MCP layer** (already in place):

- `--mcp-config` + `--strict-mcp-config` controls which MCP servers are available
- Same `mcp-config.json` generation pipeline as Copilot
- Gateway runs in the sidecar — credentials isolated from agent container

### Re-enable Path

1. Enable the Claude Code path in `CliExecutorFactory` gated on `ANTHROPIC_API_KEY` presence
2. Add stdout-based audit parsing in `ClaudeCodeExecutor` or a companion parser
3. Document the security gap (no URL restriction beyond Squid) and accept it or mitigate:
   - Option A: Accept Squid-only filtering as sufficient (domain-level, not path-level)
   - Option B: Build a Claude Code config plugin that provides URL restriction (if the CLI supports any config format for this)
   - Option C: Accept the gap for internal use but don't offer it for production profiles

### Codebase Impact

- `src/container/cli-executor-factory.ts` — Remove the hard block, add Claude Code instantiation path
- `src/container/cli-executors/claude-code-executor.ts` — Add audit log parsing from captured output
- `src/validate/env.ts` — Validate `ANTHROPIC_API_KEY` when any profile uses `cli: "claude"`
- Profile config — Claude Code profiles can be created in `profiles/` with `"cli": "claude"`
- Documentation — Security caveats for Claude Code vs Copilot

## Open Questions

- Are there Copilot CLI flags not in the public docs that the GitHub team could advise on for headless use?
- Does Claude Code support any form of output structuring (JSON mode, structured tool-use logging)?
- Should Claude Code operate on a stricter Squid allowlist than Copilot to compensate for lack of URL restrictions?
- Is there a way to run Claude Code with restricted filesystem access (a custom permission set instead of `--dangerously-skip-permissions`)?
