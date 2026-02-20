#!/bin/bash
# Setup script for the Ralph autonomous agent sandbox
# Runs as postCreateCommand after the workspace is cloned

set -e

echo "🚀 Setting up Ralph development environment..."

WORKSPACE="/workspace"
cd "$WORKSPACE"

# ── Ruby dependencies ──────────────────────────────────────
echo "📦 Installing Ruby gems..."
if [ -f "Gemfile" ]; then
    bundle install
else
    echo "⚠️ No Gemfile found, skipping bundle install"
fi

# ── Node.js dependencies ──────────────────────────────────
echo "📦 Installing Node.js packages..."
# Update npm to latest first
npm install -g npm@latest 2>/dev/null || true
if [ -f "package-lock.json" ]; then
    npm ci
else
    echo "⚠️ No package-lock.json found, skipping npm install"
fi

# ── AI CLIs ────────────────────────────────────────────────
# Installed at runtime (not in Dockerfile) to always get the latest version.
# npm global prefix is set to ~/.npm-global in the Dockerfile (user-writable, no sudo needed).
echo "📦 Installing GitHub Copilot CLI..."
npm install -g @github/copilot
echo "📦 Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code

# ── Development config ────────────────────────────────────
echo "⚙️  Setting up development configuration..."
if [ -f "src/_configs/_config_development.yml.sample" ] && [ ! -f "src/_configs/_config_development.yml" ]; then
    cp src/_configs/_config_development.yml.sample src/_configs/_config_development.yml
    echo "✅ Created _config_development.yml from sample"
elif [ -f "src/_configs/_config_development.yml" ]; then
    echo "ℹ️  _config_development.yml already exists, skipping"
else
    echo "⚠️  _config_development.yml.sample not found, skipping"
fi

# ── Git configuration ─────────────────────────────────────
echo "🔧 Configuring git..."
git config --global --add safe.directory "$WORKSPACE"
git config --global credential.useHttpPath true
git config --global push.autoSetupRemote true

# ── Xperience repository ─────────────────────────────────
if [ ! "$TF_BUILD" ]; then
    echo "📥 Checking Xperience repository..."
    XPERIENCE_REPO_PATH="resources/repositories/xperience"
    if [ ! -d "$XPERIENCE_REPO_PATH" ]; then
        if [ -n "$ADO_PAT_XPERIENCE" ]; then
            XPERIENCE_CLONE_URL="https://pat:${ADO_PAT_XPERIENCE}@dev.azure.com/kenticoxperience/CMS/_git/xperience"
            echo "📦 Cloning Xperience repository (shallow)..."
            mkdir -p resources/repositories
            git clone --branch master --single-branch "$XPERIENCE_CLONE_URL" "$XPERIENCE_REPO_PATH"
            echo "✅ Xperience repository cloned (shallow)"
        else
            echo "⚠️  ADO_PAT_XPERIENCE not set, skipping Xperience clone (non-critical)"
        fi
    else
        echo "ℹ️ Xperience repository already exists, skipping clone"
    fi
fi

# ── Summary ───────────────────────────────────────────────
echo ""
echo "✅ Ralph development environment ready!"
echo "   Ruby:    $(ruby --version 2>/dev/null || echo 'not found')"
echo "   Node:    $(node --version 2>/dev/null || echo 'not found')"
echo "   Python:  $(python3 --version 2>/dev/null || echo 'not found')"
echo "   .NET:    $(dotnet --version 2>/dev/null || echo 'not found')"
echo "   Bundler: $(bundle --version 2>/dev/null || echo 'not found')"
echo "   Pandoc:  $(pandoc --version 2>/dev/null | head -1 || echo 'not found')"
echo ""

git config --global user.email "Wiggum@kentico.com"