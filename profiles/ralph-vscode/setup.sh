#!/bin/bash
# Setup script for the Ralph autonomous agent sandbox (VS Code extension)
# Runs as postCreateCommand after the workspace is cloned

set -e

echo "🚀 Setting up Ralph development environment (VS Code extension)..."

WORKSPACE="/workspace"
cd "$WORKSPACE"

# ── Node.js dependencies ──────────────────────────────────
echo "📦 Installing Node.js packages..."
npm install -g npm@latest 2>/dev/null || true
if [ -f "package-lock.json" ]; then
    npm ci
elif [ -f "package.json" ]; then
    npm install
else
    echo "⚠️ No package.json found, skipping npm install"
fi

# ── AI CLIs ────────────────────────────────────────────────
# Installed at runtime (not in Dockerfile) to always get the latest version.
# npm global prefix is set to ~/.npm-global in the Dockerfile (user-writable, no sudo needed).
echo "📦 Installing GitHub Copilot CLI..."
npm install -g @github/copilot
echo "📦 Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

# Pre-seed Copilot CLI config for headless/autonomous use
COPILOT_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.copilot}"
mkdir -p "$COPILOT_CONFIG_DIR"

# Trust the workspace directory so the interactive prompt is skipped
if [ ! -f "$COPILOT_CONFIG_DIR/config.json" ]; then
    cat > "$COPILOT_CONFIG_DIR/config.json" << 'COPILOT_CFG'
{
  "trusted_folders": ["/workspace"]
}
COPILOT_CFG
    echo "✅ Copilot CLI config seeded (trusted /workspace)"
fi

# Register MCP servers for Copilot CLI
if [ ! -f "$COPILOT_CONFIG_DIR/mcp-config.json" ]; then
    cat > "$COPILOT_CONFIG_DIR/mcp-config.json" << 'MCP_CFG'
{
  "mcpServers": {}
}
MCP_CFG
    echo "✅ MCP config seeded (empty — REST API preferred)"
fi

# ── Git configuration ─────────────────────────────────────
echo "🔧 Configuring git..."
git config --global --add safe.directory "$WORKSPACE"
git config --global credential.useHttpPath true
git config --global push.autoSetupRemote true

# ── Summary ───────────────────────────────────────────────
echo ""
echo "✅ Ralph development environment ready!"
echo "   Node:   $(node --version 2>/dev/null || echo 'not found')"
echo "   NPM:    $(npm --version 2>/dev/null || echo 'not found')"
echo ""

git config --global user.email "Wiggum@kentico.com"