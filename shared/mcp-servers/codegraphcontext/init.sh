#!/bin/bash
# CodeGraphContext pre-init: index target repo into the graph DB before gateway starts.
# Requires CGC_INDEX_PATH env var (set via sidecarEnv in profile.json).

# Pre-install CodeGraphContext (Python-based code graph intelligence MCP server)
# Uses FalkorDB Lite (embedded, zero-config) as default graph backend.
pip install --break-system-packages --no-cache-dir codegraphcontext

if [ -z "${CGC_INDEX_PATH:-}" ]; then
  echo "$(date -Iseconds) [codegraphcontext] CGC_INDEX_PATH not set, skipping indexing"
  exit 0
fi

if [ ! -d "$CGC_INDEX_PATH" ]; then
  echo "$(date -Iseconds) [codegraphcontext] CGC_INDEX_PATH=$CGC_INDEX_PATH not found, skipping indexing"
  exit 0
fi

echo "$(date -Iseconds) [codegraphcontext] Indexing $CGC_INDEX_PATH..."
if cgc index "$CGC_INDEX_PATH" 2>&1 | tail -5; then
  echo "$(date -Iseconds) [codegraphcontext] Indexing complete"
else
  echo "$(date -Iseconds) [codegraphcontext] Indexing failed (non-fatal)"
fi
