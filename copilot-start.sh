#!/usr/bin/env bash
set -euo pipefail

# --- OpenTelemetry Configuration ---
# export COPILOT_OTEL_ENABLED=true
# export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
# export COPILOT_OTEL_EXPORTER_TYPE="otlp-http"
# export OTEL_SERVICE_NAME="github-copilot"
# export OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true
# export OTEL_LOG_LEVEL="DEBUG"
export COPILOT_TASK_WAIT_TIMEOUT_SECONDS=360000
export CONFIGURE_COPILOT_AGENT=false
export COPILOT_SWE_AGENT_BACKGROUND_AGENTS=false
export COPILOT_SWE_AGENT_PARALLEL_TASK_EXECUTION=false
export COPILOT_LARGE_OUTPUT_MAX_BYTES=104857600
export COPILOT_BUFFER_EXHAUSTION_THRESHOLD=0.99
export COPILOT_LARGE_OUTPUT_THRESHOLD_BYTES=204800

marker="===FACTORY DONE==="
attempt=1

mkdir -p "./logs"

has_marker() {
  local needle="$1"
  local file_path="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -Fq "$needle" "$file_path"
    return $?
  fi

  grep -Fq "$needle" "$file_path"
}

while true; do
  attempt_log="./logs/factory-attempt-${attempt}.log"
  attempt_share="./logs/share-attempt-${attempt}.md"

  echo "[copilot-start] attempt ${attempt}: launching fractal-factory"

  set +e
  copilot \
    --yolo \
    --agent "f+ractal-factory" \
    --log-level "debug" \
    --log-dir "./logs/" \
    --share "${attempt_share}" \
    --experimental \
    -p "begin" \
    2>&1 | tee "${attempt_log}"
  copilot_exit=${PIPESTATUS[0]}
  set -e

  if has_marker "${marker}" "${attempt_log}"; then
    cp "${attempt_share}" "./logs/share.md"
    echo "[copilot-start] completion marker detected on attempt ${attempt}"
    exit 0
  fi

  echo "[copilot-start] attempt ${attempt} exited with code ${copilot_exit} without ${marker}; restarting"
  attempt=$((attempt + 1))
  sleep 1
done
