#!/bin/bash
# Prints the v2 audit record for one raw hook payload without writing any log.
# Usage: normalize.sh <claude|copilot> <event> [--failure] < payload
#   event: session_start | prompt | pre_tool | post_tool | error | session_end |
#          subagent_start | subagent_stop | compact
# Copilot records take their session from $RALPH_LOG_DIR/.current-session-id, as
# the hooks do. Unlike the hook entry points this is a tool: a bad argument or a
# payload the adapter cannot read exits non-zero.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

if (($# < 2)) || [[ $1 != claude && $1 != copilot ]]; then
  echo "usage: normalize.sh <claude|copilot> <event> [--failure] < payload" >&2
  exit 64
fi
RALPH_CLI=$1
RALPH_HOOK_EVENT=$2
if [[ ${3:-} == --failure ]]; then
  RALPH_FAILURE=true
fi
RALPH_INPUT=$(cat)
ralph_now_ms
ralph_normalize "$RALPH_HOOK_EVENT"
printf '%s\n' "$RALPH_RECORD"
