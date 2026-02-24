#!/usr/bin/env bash
# Git Operations Guard — PreToolUse hook
# Blocks mutating git commands; allows read-only ones.
set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // empty')

# Only inspect terminal/shell tool invocations
case "$TOOL_NAME" in
  run_in_terminal|terminal|shell|execute_command) ;;
  *) exit 0 ;;
esac

COMMAND=$(echo "$INPUT" | jq -r '
  .input.command // .input.cmd // .toolInput.command // .toolInput.cmd // empty
')

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Mutating git subcommands to block
MUTATING_PATTERN='\bgit\s+(add|commit|push|reset|rebase|merge|cherry-pick|stash|tag|rm|mv|clean|checkout\s+-b|switch\s+-c|branch\s+-[dDmM]|am|format-patch|send-email)\b'

if echo "$COMMAND" | grep -qPi "$MUTATING_PATTERN"; then
  # Extract the specific subcommand for the reason message
  SUBCMD=$(echo "$COMMAND" | grep -oPi '\bgit\s+\K(add|commit|push|reset|rebase|merge|cherry-pick|stash|tag|rm|mv|clean|checkout\s+-b|switch\s+-c|branch\s+-[dDmM]|am|format-patch|send-email)\b' | head -1)
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: 'git ${SUBCMD}' is a mutating git operation. This project prohibits agents from managing git lifecycle. The user manages their own git workflow. Read-only commands (git status, diff, log, show, branch) are allowed."
  }
}
EOF
  exit 0
fi

# Also block --force variants on any git command
if echo "$COMMAND" | grep -qPi '\bgit\b.*--force\b'; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: git --force operations are never allowed. The user manages their own git workflow."
  }
}
EOF
  exit 0
fi

exit 0
