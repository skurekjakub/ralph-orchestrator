#!/bin/bash
# Claude Code Stop hook that keeps a stage from ending its turn before it has
# printed the Ralph result block. Decision order, block budget and failure
# policy: shared/hooks/README.md § Result gate.
#
# Usage: claude/result-gate.sh < Stop payload
# Environment (per exec):
#   RALPH_REQUIRE_RESULT_BLOCK  "1" turns the gate on; anything else allows every stop
#   RALPH_RESULT_GATE_MAX       blocks allowed per session (default 2, 0 = never block)
#   RALPH_LOG_DIR               audit/log directory (default /workspace/.ralph/logs)
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" || exit 0
ralph_hook_init result_gate --cli claude

[[ ${RALPH_REQUIRE_RESULT_BLOCK:-0} == 1 ]] || exit 0

max=${RALPH_RESULT_GATE_MAX:-2}
[[ $max =~ ^[0-9]+$ ]] || max=2

session="" stop_active="" running="" found="" transcript=""
fields=$(jq -r -L "$RALPH_HOOKS_LIB" 'include "record"; include "adapters/claude";
  if type != "object" then error("payload is not a JSON object") else . end
  | claude_record_event("result_gate"; "result_gate") as $checked
  | @sh "session=\(.session_id | str_or("unknown"))",
    @sh "stop_active=\(.stop_hook_active == true)",
    @sh "running=\([.background_tasks[]? | objects | select(.status == "running")] | length)",
    @sh "found=\(.last_assistant_message | has_result_block)",
    @sh "transcript=\(.transcript_path | str_or(""))"' <<<"$RALPH_INPUT") ||
  ralph_fail "unreadable Stop payload (jq exit $?)"
eval "$fields"

if [[ $running != 0 || $found == true ]]; then
  exit 0
fi

if [[ -n $transcript && -r $transcript ]]; then
  found=$(jq -R -n -r -L "$RALPH_HOOKS_LIB" 'include "record";
    [ inputs
      | fromjson?
      | objects
      | select(.type == "assistant" and .isSidechain != true)
      | .message.content?
      | if type == "array" then (.[] | objects | select(.type == "text") | .text | strings)
        elif type == "string" then .
        else empty
        end ]
    | join("\n")
    | has_result_block' "$transcript") || ralph_fail "unreadable transcript $transcript (jq exit $?)"
  if [[ $found == true ]]; then
    exit 0
  fi
fi

counter="$RALPH_LOG_DIR/.result-gate-${session//[^A-Za-z0-9_-]/_}"
if [[ $stop_active == true && ! -e $counter ]]; then
  exit 0
fi

exec {counter_fd}>>"$counter"
if [[ -n $RALPH__HAVE_FLOCK ]]; then
  flock -w 2 "$counter_fd" || true
fi
blocks=""
IFS= read -r blocks <"$counter" || true
if [[ -z $blocks ]]; then
  blocks=0
elif ! [[ $blocks =~ ^[0-9]+$ ]]; then
  blocks=$max
fi

if ((blocks >= max)); then
  ralph_normalize result_gate_exhausted "{\"blocks\":$blocks,\"max\":$max}"
  ralph_write
  exit 0
fi

blocks=$((blocks + 1))
printf '%s\n' "$blocks" >"$counter"
ralph_normalize result_gate_block "{\"blocks\":$blocks,\"max\":$max}"
ralph_write
printf '%s\n' '{"decision":"block","reason":"You stopped before printing the Ralph result block. Check state.md, finish the remaining work, then print the result block exactly as your instructions specify, with a STATUS of completed, partial or blocked."}'
