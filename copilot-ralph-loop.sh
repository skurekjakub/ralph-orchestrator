#!/usr/bin/env bash
# Ralph Loop driver for Copilot CLI
# External orchestrator starts a session then calls this script to drive it.
#
# Usage:
#   copilot --prompt "your task here"   # start the session manually first
#   ./copilot-ralph-loop.sh "your task here"
#
# Or as a one-liner — this script starts the first turn too:
#   ./copilot-ralph-loop.sh "refactor the auth module"

set -euo pipefail

TASK_PROMPT="${1:?usage: $0 <task-prompt>}"
STATE_FILE="${PWD}/.sisyphus/ralph-loop.json"
MAX_ITERATIONS="${RALPH_MAX_ITERATIONS:-100}"
COMPLETION_PROMISE="${RALPH_COMPLETION_PROMISE:-<promise>DONE</promise>}"

mkdir -p "$(dirname "$STATE_FILE")"

cat > "$STATE_FILE" <<EOF
{
  "active": true,
  "iteration": 0,
  "max_iterations": $MAX_ITERATIONS,
  "prompt": $(echo "$TASK_PROMPT" | jq -Rs .),
  "completion_promise": $(echo "$COMPLETION_PROMISE" | jq -Rs .)
}
EOF

echo "[ralph-loop] starting — max $MAX_ITERATIONS iterations"

iteration=0

while true; do
  iteration=$((iteration + 1))
  jq ".iteration = $iteration" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

  if [[ "$iteration" -eq 1 ]]; then
    # First turn — start fresh
    output=$(copilot --prompt "$TASK_PROMPT" 2>&1)
  else
    # Subsequent turns — --continue resumes the most recent session
    continuation="[RALPH LOOP $iteration/$MAX_ITERATIONS]

Your previous attempt did not output the completion promise.
Continue working on the task. When fully complete, output: $COMPLETION_PROMISE

Original task:
$TASK_PROMPT"
    output=$(copilot --continue --prompt "$continuation" 2>&1)
  fi

  echo "$output"

  if echo "$output" | grep -qF "$COMPLETION_PROMISE"; then
    echo "[ralph-loop] complete after $iteration iteration(s)" >&2
    jq '.active = false' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    exit 0
  fi

  if [[ "$iteration" -ge "$MAX_ITERATIONS" ]]; then
    echo "[ralph-loop] max iterations ($MAX_ITERATIONS) reached without completion" >&2
    jq '.active = false' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    exit 1
  fi

  echo "[ralph-loop] iteration $iteration/$MAX_ITERATIONS — no completion signal, continuing" >&2
done
