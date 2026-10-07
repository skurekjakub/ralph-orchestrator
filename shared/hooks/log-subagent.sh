#!/bin/bash
# Ralph audit hook: subagent lifecycle (Claude Code SubagentStart / SubagentStop).
# Usage: log-subagent.sh --cli claude < payload
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init subagent "$@"
ralph_log_event
