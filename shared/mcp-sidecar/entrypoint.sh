#!/bin/bash
set -e

# MCP Sidecar entrypoint — runs MCP server init scripts (if any) before
# launching the gateway process manager.

# Run generated pre-init script if mounted by the compose overlay.
# The script is auto-generated from MCP server initScript declarations.
PRE_INIT="/opt/mcp/pre-init.sh"
if [ -f "$PRE_INIT" ]; then
  echo "$(date -Iseconds) [entrypoint] Running pre-init scripts..."
  bash "$PRE_INIT" || echo "$(date -Iseconds) [entrypoint] pre-init had failures (non-fatal, continuing)"
fi

# Hand off to the gateway
exec node /opt/mcp/gateway/dist/gateway.js /opt/mcp/config/gateway.json
