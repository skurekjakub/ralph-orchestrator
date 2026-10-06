#!/bin/bash
# Ralph audit hook: the CLI hit an error (Copilot errorOccurred, Claude Code StopFailure).
# Usage: log-error.sh [--cli copilot|claude] < payload
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init error "$@"
ralph_log_event
