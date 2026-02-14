#!/bin/bash
# Ralph audit logger — Session Start
# Writes structured JSONL to /workspace/.ralph/logs/

set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
mkdir -p "$LOG_DIR"

SOURCE=$(echo "$INPUT" | jq -r '.source // "unknown"')
TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
INITIAL_PROMPT=$(echo "$INPUT" | jq -r '.initialPrompt // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Derive a session ID from the timestamp
SESSION_ID="ralph-$(date +%Y%m%d-%H%M%S)"
echo "$SESSION_ID" > "$LOG_DIR/.current-session-id"

jq -n -c \
  --arg event "session_start" \
  --arg ts "$TIMESTAMP" \
  --arg source "$SOURCE" \
  --arg prompt "$INITIAL_PROMPT" \
  --arg cwd "$CWD" \
  --arg session "$SESSION_ID" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, source: $source, initialPrompt: $prompt, cwd: $cwd}' \
  >> "$LOG_DIR/audit.jsonl"

echo "[RALPH] Session $SESSION_ID started (source=$SOURCE)" >> "$LOG_DIR/ralph.log"
