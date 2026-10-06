# Discord HITL MCP Server — Configuration

Discord-based human-in-the-loop — blocking questions, approvals, and notifications via Discord threads. Posts a question to a Discord channel, creates a thread, and blocks until a human replies or the timeout is reached.

**Sidecar port:** 9102

## Environment Variables

### Required (orchestrator `.env`)

| Variable             | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `DISCORD_BOT_TOKEN`  | Discord bot token with message and thread permissions |
| `DISCORD_CHANNEL_ID` | Discord channel ID where threads are created          |

### Optional (orchestrator `.env`)

| Variable               | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `DISCORD_TASK_CONTEXT` | Optional context string included in thread names for task identification |

All variables are set in the orchestrator's `.env` file and injected into the sidecar at startup via `requiredEnv` / `optionalEnv` in the manifest.

## Profile Wiring

Add to the `mcpServers` array in `profile.json`:

```json
{ "name": "discord-hitl" }
```

No per-task `env` block is needed — all configuration comes from orchestrator-level environment variables.

## Tools

### `discord_ask`

Post a question to Discord and wait for a human response. **Blocks** until a reply is received or timeout is reached. Use this when you need human input, clarification, or answers to proceed.

| Parameter         | Type   | Required | Description                                                    |
| ----------------- | ------ | -------- | -------------------------------------------------------------- |
| `question`        | string | yes      | The question to ask (supports markdown)                        |
| `context`         | string | no       | Optional context header (e.g. "Phase 2 Questions")             |
| `timeout_minutes` | number | no       | How long to wait for a response (default: 60, max: 1440 / 24h) |
