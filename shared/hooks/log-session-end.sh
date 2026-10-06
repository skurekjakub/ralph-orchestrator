#!/bin/bash
# Ralph audit hook: session end (Copilot sessionEnd, Claude Code SessionEnd).
# Usage: log-session-end.sh [--cli copilot|claude] < payload
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init session_end "$@"
ralph_log_event
