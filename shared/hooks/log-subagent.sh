#!/bin/bash
# Ralph audit hook: subagent lifecycle (Claude Code SubagentStart / SubagentStop).
# Usage: log-subagent.sh --cli claude start|stop < payload
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init subagent "$@"
case $RALPH_POSITIONAL in
  start | stop) RALPH_HOOK_EVENT=subagent_$RALPH_POSITIONAL ;;
  *) ralph_fail "expected start or stop, got '$RALPH_POSITIONAL'" ;;
esac
ralph_log_event
