#!/bin/bash
# Ralph audit hook: tool call about to run (Copilot preToolUse, Claude Code PreToolUse).
# Usage: log-pre-tool.sh [--cli copilot|claude] < payload
# Writes audit.jsonl and pre-tool.log (streamed live to the host). Never blocks a call.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init pre_tool "$@"
ralph_log_event
