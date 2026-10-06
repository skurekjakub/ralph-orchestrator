#!/bin/bash
# Ralph audit hook: session start (Copilot sessionStart, Claude Code SessionStart).
# Usage: log-session-start.sh [--cli copilot|claude] < payload
# For Copilot it also mints the session id that later Copilot records carry.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init session_start "$@"
if [[ $RALPH_CLI == copilot ]]; then
  ralph_copilot_new_session
fi
ralph_log_event
