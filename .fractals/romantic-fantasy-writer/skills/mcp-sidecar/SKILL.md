# MCP Sidecar — Romantic Fantasy Writer

## Purpose

Defines the Model Context Protocol (MCP) server configuration for the romantic-fantasy-writer system. MCP servers provide tool capabilities to agents — primarily filesystem operations for reading/writing artifacts, and optional utilities for word counting, readability analysis, and style metrics.

## MCP Server Configuration

### Required MCP Server: Filesystem Tools

Every agent needs filesystem access to read inputs and write outputs. The filesystem MCP server provides:

| Tool | Purpose | Used By |
|------|---------|---------|
| `read_file` | Read artifact JSON/Markdown | All agents |
| `write_file` | Write output artifacts | Specialists, orchestrator |
| `list_directory` | Enumerate chapter directories, agent statuses | Coordinators, orchestrator |
| `file_exists` | Check if artifact exists before writing (create-once protocol) | All writers |
| `delete_file` | Delete status.json files on retry (resetOnRetry) | Coordinators only |

### Security Configuration
```json
{
  "filesystem": {
    "allowedPaths": [
      ".romantic-fantasy-writer/stories/{story-id}/"
    ],
    "denyPaths": [
      ".romantic-fantasy-writer/stories/{story-id}/agents/*/status.json"
    ],
    "readOnly": false
  }
}
```

**Important**: The `denyPaths` exception for status.json applies only to *other agents'* status files. Each agent can write its own status but cannot modify another agent's.

### Optional MCP Server: Writing Analytics

For agents that need quantitative prose analysis:

| Tool | Purpose | Used By |
|------|---------|---------|
| `word_count` | Count words in a chapter draft | chapter-drafter, polisher |
| `sentence_stats` | Average sentence length, variance | style-analyzer, line-editor |
| `vocabulary_register` | Vocabulary complexity scoring | style-analyzer, pov-voice-maintainer |
| `dialogue_ratio` | Percentage of text that is dialogue | style-analyzer, craft-beta-reader |
| `readability_score` | Flesch-Kincaid or similar metric | copy-editor, craft-beta-reader |

These tools help agents make data-driven decisions about prose quality rather than relying purely on subjective assessment.

### Optional MCP Server: Search Tools

For agents that need to search across artifacts:

| Tool | Purpose | Used By |
|------|---------|---------|
| `grep_artifacts` | Search for a term across all story artifacts | continuity-tracker, worldbuilding-auditor |
| `find_references` | Find all mentions of a character/place name | continuity-tracker, copy-editor |

## Sidecar Architecture

```
┌─────────────────────┐
│ Agent Container      │
│  ┌───────────────┐   │
│  │ Agent Process  │   │
│  └──────┬────────┘   │
│         │ MCP        │
│  ┌──────┴────────┐   │
│  │ MCP Sidecar   │   │
│  │  - filesystem  │   │
│  │  - analytics   │   │
│  │  - search      │   │
│  └───────────────┘   │
└─────────────────────┘
```

The MCP sidecar runs alongside the agent process in the same container. It starts before the agent and provides tools via the MCP protocol over stdio or HTTP.

## Configuration File

Each container includes an `mcp-config.json`:
```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "mcp-filesystem",
      "args": ["--root", "/artifacts/stories/{story-id}"],
      "required": true
    },
    {
      "name": "writing-analytics",
      "command": "mcp-writing-analytics",
      "args": [],
      "required": false
    }
  ]
}
```

The `required: true` flag means the agent cannot start if the MCP server fails. `required: false` means the agent can operate in degraded mode without analytics tools.

## When to Use MCP vs. Direct File Operations

- **Use MCP**: When the agent framework provides MCP as the primary tool interface (standard in multi-agent deployments)
- **Use direct file ops**: When running agents in a simpler deployment without MCP infrastructure
- The agent prompts are written to work with either approach — they reference artifacts by path, and the tool layer handles the actual I/O
