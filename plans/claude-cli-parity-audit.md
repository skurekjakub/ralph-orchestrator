# Claude CLI Support Audit — Ralph Orchestrator

**Date:** 2026-02-28
**Branch:** `internal/extra-cleaup`

---

## Executive Summary

Claude Code CLI support is **architecturally present but intentionally disabled**. The executor implementation exists and is functionally correct, but two hard blocks at validation and factory layers prevent any profile from using it. Beyond those blocks, there are four secondary gaps that would need to be addressed to reach feature parity with the Copilot executor.

---

## Blocking Issues (Prevent Any Use)

### 1. Profile Validation Rejects Claude (`src/validate/profiles.ts:72–76`)

```typescript
if (p.cli === "claude") {
  errors.push(
    `${prefix}: cli "claude" is not supported — Claude Code CLI currently lacks sufficient security hardening. Use "copilot" (default).`
  );
}
```

Any profile with `"cli": "claude"` fails startup validation with an explicit error. This is the earliest kill switch.

### 2. Executor Factory Has No Claude Path (`src/container/cli-executor-factory.ts:45–54`)

```typescript
create(...): ICliExecutor {
  if (this.secrets.ghToken) {
    return new CopilotExecutor(compose, profile, cliLogger);
  }
  throw new Error("GH_TOKEN is required — Copilot CLI is the only supported CLI.");
}
```

`ClaudeCodeExecutor` is imported nowhere in the factory. Even if validation were bypassed, no execution path instantiates it. The constructor comment on `ICliExecutorFactory` documents the intent: *"Only Copilot CLI is currently supported — Claude Code CLI lacks the URL restriction and pre-tool hook infrastructure required for secure operation."*

---

## Secondary Gaps (Feature Parity vs. Copilot)

### 3. Agent File Not Wired Up

Copilot loads its system prompt via `--agent ralph.ralph`, which reads `/workspace/.github/agents/ralph.ralph.agent.md` from the container.

Claude CLI's equivalent is `--system-prompt-file <path>`. The rendered agent file is **already mounted at the correct path** (`/workspace/.github/agents/<name>.agent.md`) — `ClaudeCodeExecutor.exec()` simply needs to pass the flag:

```typescript
"--system-prompt-file", `/workspace/.github/agents/${this.profile.agentName}.agent.md`,
```

Note: Claude CLI also has an `--agent <name>` flag, but it targets Claude's own subagent system at `.claude/agents/` — not `.github/agents/`. `--system-prompt-file` is the correct mapping.

### 4. No Transcript Collection (`src/container/cli-executors/claude-code-executor.ts:24–33`)

Copilot writes a transcript via `--share /workspace/.ralph/logs/session-transcript.md`. Claude has no equivalent flag. The `paths.transcriptPath` field is defined in `ClaudeCodeExecutor` (same path), but nothing is ever written there during execution — the file will be empty or absent, and transcript attachment in JIRA will silently fail.

**Potential mitigations:**
- Use `--output-format json` to capture structured output from stdout and write a synthetic transcript post-execution
- Accept no transcript for Claude profiles (silent degradation)

| | Copilot | Claude |
|---|---|---|
| Executor flag | `--share <path>` | *(none)* |
| `paths.transcriptPath` defined | ✅ | ✅ (but unused) |
| Transcript attached to JIRA | ✅ | ❌ |

### 5. URL Restrictions Not Enforced (`src/container/setup/url-restrictions.ts`)

Copilot CLI reads `--config-dir /workspace/.ralph` and enforces the `allowed_urls` list from `copilot-config.json`, which is derived from the profile's Squid allowlist. Claude CLI has no equivalent application-layer URL enforcement — it would rely solely on the Squid proxy for network isolation.

The overlay always mounts `copilot-config.json` at `/workspace/.ralph/config.json` (`compose-overlay.ts:70`). This file is irrelevant to Claude.

This is the explicitly cited reason for the block in the factory doc comment.

| | Copilot | Claude |
|---|---|---|
| `copilot-config.json` generated | ✅ | ✅ (always generated, unused) |
| Application-layer URL enforcement | ✅ | ❌ (Squid proxy only) |

### 6. `agentName` Field Is Semantically Copilot-Only (`src/config/types.ts:63`)

The `IAgentProfile.agentName` field (e.g. `ralph.ralph`) is passed to Copilot as `--agent <name>`. For Claude, `agentName` is still needed to construct the `--system-prompt-file` path and to derive `displayName` for JIRA comments/logs — but its semantic meaning differs across CLIs.

### 7. `githubMcpTools` Field Is Copilot-Only (`src/config/types.ts:88–92`)

The `githubMcpTools: false | readonly string[]` field controls Copilot's built-in GitHub MCP server via `--disable-builtin-mcps` or `--add-github-mcp-tool`. Claude Code has no built-in MCP servers to control. The field is schema-valid on Claude profiles but produces no effect.

### 8. No `ANTHROPIC_API_KEY` Presence Validation

`ISecretsConfig.anthropicApiKey` is defined and injected into containers via `BASE_CONTAINER_ENV`. However, there is no startup validation that the key is actually set when a profile declares `cli: "claude"` — unlike the implicit check that `GH_TOKEN` must be present. For Claude, a missing key would only surface at runtime when the CLI rejects the invocation.

### 9. `DEFAULT_MODEL` Used as Copilot Fallback

```typescript
// src/config/constants.ts
export const DEFAULT_MODEL = "claude-opus-4.6";
```

This is consumed by `CopilotExecutor` as `this.profile.model ?? DEFAULT_MODEL`. For Claude Code, the executor only passes `--model` when `profile.model` is explicitly set — so this constant is not used for Claude at all. The naming is misleading but functionally harmless.

---

## What Is Already Correctly Implemented for Claude

| Component | Status | Notes |
|---|---|---|
| `ClaudeCodeExecutor` class | ✅ Complete | Correct flags: `-p`, `--continue -p`, `--dangerously-skip-permissions`, `--mcp-config`, `--strict-mcp-config` |
| `continueSession()` implementation | ✅ Correct | Uses `--continue -p <prompt>` (vs. Copilot's `--continue --prompt <prompt>`) |
| MCP config generation | ✅ Shared | Same `mcp-config.json` HTTP URL format works for Claude |
| `ANTHROPIC_API_KEY` env injection | ✅ Present | Injected into all containers via `BASE_CONTAINER_ENV` |
| `CLAUDE_CODE_DISABLE_AUTOUPDATER` | ✅ Present | Prevents self-update noise in containers |
| `CLAUDE_CODE_DISABLE_COST_WARNINGS` | ✅ Present | Suppresses cost output |
| CLI installation in `setup.sh` | ✅ Both profiles | `npm install -g @anthropic-ai/claude-code` runs in setup for both profiles |
| Schema accepts `"cli": "claude"` | ✅ Valid | `z.enum(["copilot", "claude"])` in `profileFileSchema` |
| `CliType.Claude` enum value | ✅ Defined | In `src/container/types.ts` |
| `ISecretsConfig.anthropicApiKey` | ✅ Typed | Documented as optional, only needed for Claude profiles |
| Continuation loop | ✅ CLI-agnostic | `ContainerManager` calls `executor.continueSession()` — works for any `ICliExecutor` |
| Result block detection | ✅ CLI-agnostic | Same `===RALPH_RESULT_START===` format expected from both CLIs |
| Prompt injection auditor | ✅ CLI-agnostic | Runs on prompt before any executor is called |
| `CliPaths` structure | ✅ Defined | Same paths as Copilot — no path conflicts |
| Agent file mount path | ✅ Correct | Already at `/workspace/.github/agents/<name>.agent.md` — usable with `--system-prompt-file` |

---

## Work Required to Enable Claude Support

Listed in dependency order:

**1. Decide on URL restriction policy**
The cited blocker is that Claude CLI has no application-layer URL restriction equivalent to Copilot's `allowed_urls`. Determine whether Squid-only isolation is acceptable, or implement a pre-tool hook / Claude hooks mechanism. This is the architectural decision that gates everything else.

**2. Remove the validation block** (`src/validate/profiles.ts:72–76`)
Replace the hard error with acceptance. Add a warning if `ANTHROPIC_API_KEY` is unset for a Claude profile.

**3. Wire the factory** (`src/container/cli-executor-factory.ts:45–54`)
Add a branch: when `profile.cli === CliType.Claude && secrets.anthropicApiKey`, instantiate and return `ClaudeCodeExecutor`. Add a clear error if the API key is missing.

**4. Add `--system-prompt-file` to `ClaudeCodeExecutor`** (`src/container/cli-executors/claude-code-executor.ts:73–81`)
```typescript
const args = [
  "--user", "vscode",
  "app",
  "claude",
  ...promptArgs,
  "--dangerously-skip-permissions",
  "--mcp-config", "/workspace/.ralph/mcp-config.json",
  "--strict-mcp-config",
  "--system-prompt-file", `/workspace/.github/agents/${this.profile.agentName}.agent.md`,
];
```
No changes to mount paths or template renderer needed — the file is already there.

**5. Resolve transcript collection**
Either capture stdout as a synthetic transcript post-execution, use `--output-format json`, or accept no JIRA transcript attachment for Claude profiles.

**6. Validate `ANTHROPIC_API_KEY` at startup**
In `src/validate/profiles.ts`, add a check: if any profile has `cli: "claude"`, verify `process.env.ANTHROPIC_API_KEY` is set.

**7. (Optional cleanup)** Emit a warning in validation if a Claude profile sets `githubMcpTools`. Harmless but confusing.

---

## Agent System Prompt: Replace vs. Append

`--system-prompt-file` **replaces the entire default system prompt**, including all of Claude's built-in agentic behaviors (tool-use patterns, response formatting, safety behaviors). The internal default prompt is not published.

The docs recommend `--append-system-prompt-file` for most cases, which adds to the defaults rather than replacing them.

However, this is also exactly how **subagent files** work — the docs state:

> *Subagents receive only this system prompt (plus basic environment details like working directory), not the full Claude Code system prompt.*

So full replacement is the intended pattern for self-contained agents. Since Ralph's agent templates are comprehensive and need to stand alone (like Copilot's `--agent` model), **`--system-prompt-file` is the correct mapping** — a deliberate choice to own the full system prompt rather than layer on top of Claude's defaults.

`--append-system-prompt-file` is an alternative worth considering if Claude's built-in tool-use instructions turn out to be useful in practice.

---

## Subagents Inside the Running Agent

Subagents are Markdown files with YAML frontmatter stored at `.claude/agents/<name>.md` inside the workspace. Since `/workspace` is already mounted in Ralph's containers, the top-level ralph agent can spawn subagents defined at `/workspace/.claude/agents/`.

### File format

```markdown
---
name: code-reviewer
description: Reviews code for quality. Use proactively after code changes.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior code reviewer...
```

### Discovery and invocation

| Location | Scope | Priority |
|---|---|---|
| `--agents` JSON flag | Session-only | 1 (highest) |
| `.claude/agents/<name>.md` | Project-level | 2 |
| `~/.claude/agents/<name>.md` | User-level | 3 |
| Plugin `agents/` dir | Plugin scope | 4 |

Claude automatically delegates to a subagent when a task matches its `description` field (via the `Task` tool). The agent can also be told explicitly in the system prompt body when to use which subagent.

### Controlling which subagents can be spawned

Two mechanisms available from the agent template itself:

**1. Instruction in the system prompt body:**
```
When reviewing code, use the code-reviewer subagent.
```

**2. `tools` field allowlist with `Task(name)` syntax (frontmatter):**
```yaml
---
name: ralph
tools: Task(code-reviewer, test-runner), Bash, Read, Edit
---
```
This restricts spawnable subagents to only the listed names. Attempts to spawn anything else fail, and only the allowed types are visible in the agent's context.

To block specific subagents while allowing all others, use `permissions.deny` with `Task(subagent-name)` in settings — but that is a settings-level concern, not controllable from the agent template.

### Note on `--agent` CLI flag

`--agent <name>` at the CLI level is **not** a delegation mechanism — it runs a specific subagent as the top-level agent for the entire session (i.e. selecting a persona at startup). Distinct from the `Task` tool delegation used within a running session.

### Relevance for Ralph

- Subagent files could be defined in `profiles/<id>/resources/` and mounted into `/workspace/.claude/agents/` via the resource mount system — no new infrastructure needed
- Enables skill decomposition: a top-level ralph agent could delegate to a `code-reviewer`, `test-runner`, or `pr-creator` subagent rather than doing everything in one context
- The `Task(...)` allowlist in the agent frontmatter keeps subagent invocation explicit and auditable

---

## Useful Claude CLI Flags (from docs)

| Flag | Description | Relevance |
|---|---|---|
| `--system-prompt-file <path>` | Replace entire system prompt with file contents (print mode only) | **Agent file solution** |
| `--append-system-prompt-file <path>` | Append file contents to default system prompt (print mode only) | Alternative if keeping Claude's defaults |
| `--output-format json` | Structured JSON output from stdout | Potential transcript solution |
| `--max-turns <n>` | Limit agentic turns (print mode only) | Complement to `timeoutMs` |
| `--no-session-persistence` | Don't save session to disk | Cleaner isolated task runs |
| `--disallowedTools` | Deny specific tools | Alternative URL restriction mechanism |
| `--strict-mcp-config` | Only use `--mcp-config` servers | Already in executor ✅ |

---

## Key File Reference

| File | Relevance |
|---|---|
| `src/container/cli-executors/claude-code-executor.ts` | Claude executor — complete but missing `--system-prompt-file` and agent file wiring |
| `src/container/cli-executors/copilot-executor.ts` | Reference implementation |
| `src/container/cli-executor-factory.ts` | **Blocking**: only creates Copilot executor |
| `src/validate/profiles.ts:72–76` | **Blocking**: hard rejects `cli: "claude"` |
| `src/container/setup/url-restrictions.ts` | Copilot URL enforcement — no Claude equivalent |
| `src/container/setup/artifact-mounts.ts:22` | Agent files mounted at `/workspace/.github/agents/<name>.agent.md:ro` |
| `src/container/setup/compose-overlay.ts:9–11` | Claude env vars already injected |
| `src/config/types.ts:116` | `anthropicApiKey` defined in secrets |
| `src/config/schemas.ts:107` | Schema accepts both CLI types |
| `src/config/constants.ts:2` | `DEFAULT_MODEL` — Copilot default, misleadingly named |
