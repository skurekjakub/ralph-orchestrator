#!/usr/bin/env bash
set -uo pipefail

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

# --- Ensure log directory exists ---
mkdir -p /workspace/logs

DONE_MARKER="===WRITER DONE==="
AGENT_NAME="docwriter"
AGENT_FILE="/workspace/.github/agents/${AGENT_NAME}.agent.md"

# --- Pre-flight: validate agent file and stop marker ---
if [[ ! -f "$AGENT_FILE" ]]; then
  echo "ERROR: Agent file not found: ${AGENT_FILE}" >&2
  exit 1
fi

if ! grep -qF "$DONE_MARKER" "$AGENT_FILE"; then
  echo "ERROR: Stop marker '${DONE_MARKER}' not found in ${AGENT_FILE}" >&2
  exit 1
fi

echo "[$(date)] Pre-flight OK: agent '${AGENT_NAME}' contains stop marker."

while true; do
  TIMESTAMP=$(date +%s)
  LOG_DIR="/workspace/logs"
  LOG_FILE="${LOG_DIR}/copilot_${TIMESTAMP}.log"
  SHARE_FILE="${LOG_DIR}/share_${TIMESTAMP}.md"

  echo "[$(date)] Starting copilot run (log: ${LOG_FILE})"

  # --- Launch Copilot, tee output to timestamped log ---
  copilot \
    --yolo \
    --agent "docwriter" \
    --log-level "debug" \
    --log-dir "${LOG_DIR}/" \
    --share "${SHARE_FILE}" \
    --experimental \
    -p "begin" 2>&1 | tee "${LOG_FILE}"

  EXIT_CODE=${PIPESTATUS[0]}

  # --- Check for done marker in output ---
  if grep -qF "${DONE_MARKER}" "${LOG_FILE}"; then
    echo "[$(date)] Found '${DONE_MARKER}' in output. Exiting."
    exit 0
  fi

  if [[ ${EXIT_CODE} -ne 0 ]]; then
    echo "[$(date)] Copilot exited with code ${EXIT_CODE}. Restarting in 5s..."
    sleep 5
  else
    echo "[$(date)] Copilot exited cleanly without done marker. Restarting in 2s..."
    sleep 2
  fi
done
