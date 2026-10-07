#!/bin/bash
# Claude Code Stop hook: keeps a main-pipeline stage from ending its turn before it
# has printed the ===RALPH_RESULT_START=== ... ===RALPH_RESULT_END=== block.
#
# Usage: claude/result-gate.sh < Stop payload
# Environment (per exec, set by the orchestrator):
#   RALPH_REQUIRE_RESULT_BLOCK  "1" turns the gate on; anything else allows every stop
#   RALPH_RESULT_GATE_MAX       blocks allowed per session (default 2, 0 = never block)
#   RALPH_LOG_DIR               audit/log directory (default /workspace/.ralph/logs)
#
# Decision order: gate off → allow; background task still running (the session
# resumes) → allow; result block in last_assistant_message or in main-thread
# assistant text of transcript_path → allow; MAX blocks already spent → allow and
# record result_gate_exhausted; otherwise persist the new count, record
# result_gate_block and print {"decision":"block"}.
#
# The block count lives in $RALPH_LOG_DIR/.result-gate-<session_id> and is never
# reset (a --resume keeps the session id), so a stage gets at most MAX blocks in
# total. Every failure path allows the stop: with stop_hook_active set and no
# count on disk the gate cannot prove it is still under MAX, so it lets go too.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh" || exit 0
ralph_hook_init result_gate --cli claude

[[ ${RALPH_REQUIRE_RESULT_BLOCK:-0} == 1 ]] || exit 0

max=${RALPH_RESULT_GATE_MAX:-2}
[[ $max =~ ^[0-9]+$ ]] || max=2

session="" stop_active="" running="" found="" transcript=""
fields=$(jq -r -L "$RALPH_HOOKS_LIB" 'include "record";
  if type != "object" then error("payload is not a JSON object") else . end
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

exec 9>>"$counter"
if [[ -n $RALPH__HAVE_FLOCK ]]; then
  flock -w 2 9 || true
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
