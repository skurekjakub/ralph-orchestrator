#!/bin/bash
# Ralph audit logger — User Prompt Submitted
set -e
INPUT=$(cat)

LOG_DIR="/workspace/.ralph/logs"
SESSION_ID=$(cat "$LOG_DIR/.current-session-id" 2>/dev/null || echo "unknown")

TIMESTAMP=$(echo "$INPUT" | jq -r '.timestamp')
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')

jq -n -c \
  --arg event "prompt" \
  --arg ts "$TIMESTAMP" \
  --arg session "$SESSION_ID" \
  --arg prompt "$PROMPT" \
  '{event: $event, timestamp: ($ts | tonumber), session: $session, prompt: $prompt}' \
  >> "$LOG_DIR/audit.jsonl"
