#!/usr/bin/env bash
set -euo pipefail

# --- Launch Copilot ---
copilot \
  --yolo \
  --agent "fractal-factory" \
  --log-level "debug" \
  --log-dir "./logs/" \
  --share "./logs/share.md" \
  --experimental \
  -p "begin"
