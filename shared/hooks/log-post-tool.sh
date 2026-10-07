#!/bin/bash
# Ralph audit hook: tool call finished (Copilot postToolUse; Claude Code PostToolUse and
# PostToolUseFailure).
# Usage: log-post-tool.sh [--cli copilot|claude] < payload
# Writes audit.jsonl (result text truncated), tool-output.log (full text) and, for a
# failed call, ralph.log.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init post_tool "$@"
ralph_log_event
