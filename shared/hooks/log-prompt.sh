#!/bin/bash
# Ralph audit hook: prompt submitted (Copilot userPromptSubmitted, Claude Code UserPromptSubmit).
# Usage: log-prompt.sh [--cli copilot|claude] < payload
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init prompt "$@"
ralph_log_event
