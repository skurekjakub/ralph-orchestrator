#!/usr/bin/env bash
# Copilot CLI sessionEnd hook — place in ~/.copilot/hooks/session-end.sh
#
# sessionEnd payload: { timestamp, cwd, reason }
#   - use --continue to resume the session that just ended (no ID tracking needed)
#   - completion detection by scanning copilot's transcript file
#
# hooks.json:
#   { "sessionEnd": { "type": "command", "bash": "~/.copilot/hooks/session-end.sh" } }

set -euo pipefail

STATE_FILE="${PWD}/.sisyphus/ralph-loop.json"
# Adjust this path to wherever copilot CLI writes its transcript
TRANSCRIPT_FILE="${HOME}/.copilot/transcripts/current.jsonl"

# --- Read hook payload ---
input=$(cat)
reason=$(echo "$input" | jq -r '.reason // empty')

# User intentionally stopped — clear loop
if [[ "$reason" == "abort" ]] || [[ "$reason" == "user_exit" ]]; then
  if [[ -f "$STATE_FILE" ]]; then
    jq '.active = false' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    echo "[ralph-loop] cancelled (reason: $reason)" >&2
  fi
  exit 0
fi

# --- Check if ralph loop is active ---
if [[ ! -f "$STATE_FILE" ]]; then
  exit 0
fi

active=$(jq -r '.active' "$STATE_FILE")
if [[ "$active" != "true" ]]; then
  exit 0
fi

iteration=$(jq -r '.iteration' "$STATE_FILE")
max_iterations=$(jq -r '.max_iterations' "$STATE_FILE")
prompt=$(jq -r '.prompt' "$STATE_FILE")
completion_promise=$(jq -r '.completion_promise' "$STATE_FILE")

# --- Check for completion by scanning transcript ---
completed=false
if [[ -f "$TRANSCRIPT_FILE" ]]; then
  if jq -r 'select(.role == "assistant") | .content' "$TRANSCRIPT_FILE" 2>/dev/null \
      | grep -qF "$completion_promise"; then
    completed=true
  fi
fi

if [[ "$completed" == "true" ]]; then
  echo "[ralph-loop] complete after $iteration iteration(s)" >&2
  jq '.active = false' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  exit 0
fi

# --- Check iteration cap ---
if [[ "$iteration" -ge "$max_iterations" ]]; then
  echo "[ralph-loop] max iterations ($max_iterations) reached" >&2
  jq '.active = false' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  exit 0
fi

# --- Increment and continue ---
new_iteration=$((iteration + 1))
jq ".iteration = $new_iteration" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

continuation="[RALPH LOOP $new_iteration/$max_iterations]

Your previous attempt did not output the completion promise.
Continue working on the task. When fully complete, output: $completion_promise

Original task:
$prompt"

echo "[ralph-loop] iteration $new_iteration/$max_iterations" >&2

# --continue resumes the session that just ended — no ID tracking needed
nohup copilot --continue --prompt "$continuation" >/dev/null 2>&1 &
