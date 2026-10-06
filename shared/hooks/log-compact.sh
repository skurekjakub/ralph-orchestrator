#!/bin/bash
# Ralph audit hook: context compaction about to run (Claude Code PreCompact).
# Usage: log-compact.sh --cli claude < payload
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh" || exit 0
ralph_hook_init compact "$@"
ralph_log_event
