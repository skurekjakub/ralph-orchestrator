# Discord Connector — Throwaway Task Creation

## What This Is

A Discord bot or integration that lets team members create JIRA issues (and trigger Ralph) directly from Discord messages. For quick, throwaway documentation tasks that don't warrant manual JIRA issue creation.

## Core Concept

Instead of opening JIRA, filling out fields, creating an issue, then commenting `@Ralph` — a team member types something like `/ralph Document the new PageBuilder widget API` in a Discord channel. The connector creates the JIRA issue with appropriate fields and triggers Ralph automatically.

This dramatically lowers the friction for requesting documentation work, especially for developers who notice docs gaps while coding.

## Expected Shape

### Discord Bot

A lightweight bot that:

1. Listens for slash commands or mentions in designated channels
2. Parses the request into JIRA issue fields (summary, description, project, labels)
3. Creates the JIRA issue via REST API
4. Posts the trigger comment (`@Ralph`, `@RalphDf`, etc.) on the new issue
5. Reports back to Discord with the issue link

### Command Syntax

```
/ralph <summary>                          — Create DOC issue, trigger @Ralph
/ralph-df <summary>                       — Create DF issue, trigger @RalphDf
/ralph <summary> --scope=<path>           — Create with scope param
/ralph <summary> --codesamples            — Create with codesamples param
/ralph-q <question about issue DOC-3143>  — Trigger PlebRalph on existing issue
```

### MCP Server vs Standalone

Two implementation approaches:

- **MCP server**: Lives in `shared/mcp-servers/discord/`, exposed to agents. Agents could post to Discord channels during work (progress updates, questions). But this is agent→Discord, not Discord→JIRA.
- **Standalone bot**: Separate process/deployment (could be a simple Node.js app). Watches Discord, creates JIRA issues, triggers the existing orchestrator flow. This is the primary use case.

The standalone bot is more natural since the flow is Discord→JIRA→Orchestrator, not involving the agent containers at all.

## What Changes in the Codebase

### Minimal Orchestrator Changes

The orchestrator itself doesn't change — it already polls JIRA and discovers trigger comments. The Discord bot creates issues and comments externally. From the orchestrator's perspective, these are normal JIRA issues with normal trigger comments.

### JIRA Account Whitelist (Prerequisite)

If a JIRA account whitelist is implemented (see `jql-access-control.md`), the Discord bot's JIRA account needs to be whitelisted as an authorized trigger source. Without whitelisting, anyone who can mention the bot in Discord could trigger agent runs.

### New Repository/Package

The Discord bot is likely its own deployment:

- Could live in this repo under `discord-bot/` or as a separate repo
- Needs Discord bot token, JIRA credentials, channel→project mapping config
- Minimal dependencies: discord.js, node-fetch for JIRA API

### Security Considerations

- The bot must validate that requests come from authorized Discord users/roles
- Rate limiting to prevent abuse
- The bot's JIRA account should have minimal permissions (create issues, add comments)
- Channel restrictions: only specific channels should trigger issue creation

## Open Questions

- **Hosting**: Where does the bot run? Same machine as the orchestrator? Separate deployment?
- **Feedback loop**: Should the bot post updates when Ralph completes the task? (Orchestrator would need a Discord notification hook)
- **Human-in-the-loop**: Should the bot create issues in a "draft" state for human approval before Ralph picks them up?
- **Existing issues**: Should the bot support triggering on existing issues by key? E.g., `/ralph DOC-3143 codesamples`
