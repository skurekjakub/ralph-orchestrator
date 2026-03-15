#!/usr/bin/env bash
set -euo pipefail

# --- OpenTelemetry Configuration ---
export COPILOT_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export COPILOT_OTEL_EXPORTER_TYPE="otlp-http"
export OTEL_SERVICE_NAME="github-copilot"
export OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true
export OTEL_LOG_LEVEL="DEBUG"

# --- Launch Copilot ---
copilot \
  --yolo \
  --agent "fractal-factory" \
  --log-level "debug" \
  --log-dir "./logs/" \
  --share "./logs/share.md" \
  --experimental \
  -p "begin"
