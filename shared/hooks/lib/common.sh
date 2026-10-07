# shellcheck shell=bash
# Shared runtime of the Ralph audit hooks, sourced by every entry script.
#
# Flow of an entry script: ralph_hook_init <event family> "$@" → ralph_log_event.
# ralph_hook_init reads the raw payload from stdin and accepts one option,
#   --cli copilot|claude   adapter to use (default copilot)
# and fails on anything else, so a misspelt hook command shows up as hook_error.
# ralph_log_event normalises the payload through lib/adapters/<cli>.jq and
# lib/redact.pl and hands the v2 record to ralph_write, the single audit writer.
#
# Failure policy: an entry script always exits 0. Claude Code reads exit 2 as
# "block the tool / prompt / stop", and jq itself exits 2 on malformed input, so
# any internal failure is reported (stderr, ralph.log, a hook_error audit record)
# and swallowed by the EXIT trap instead of leaking a status to the CLI.
#
# Environment: RALPH_LOG_DIR (default /workspace/.ralph/logs).

RALPH_HOOKS_LIB=$(dirname "${BASH_SOURCE[0]}")
RALPH_LOG_DIR=${RALPH_LOG_DIR:-/workspace/.ralph/logs}
RALPH_CLI=copilot
RALPH_HOOK_EVENT=""
RALPH_INPUT=""
RALPH_NOW_MS=""
RALPH_SESSION=""
RALPH_RECORD=""
RALPH_LOG_LINE=""
RALPH_TOOL_OUTPUT=""
RALPH__FAIL_MSG=""
RALPH__FAIL_AT=""
RALPH__HAVE_FLOCK=""
if command -v flock >/dev/null 2>&1; then
  RALPH__HAVE_FLOCK=1
fi

# Sets RALPH_NOW_MS to the current epoch time in milliseconds.
ralph_now_ms() {
  local digits=${EPOCHREALTIME:-}
  digits=${digits//[!0-9]/}
  if ((${#digits} >= 13)); then
    RALPH_NOW_MS=${digits:0:13}
  else
    RALPH_NOW_MS="$(date +%s)000"
  fi
}

# Records why the hook is giving up and exits; the EXIT trap reports it and exits 0.
ralph_fail() {
  RALPH__FAIL_MSG=$1
  exit 1
}

# Appends $2 verbatim to file $1. The exclusive lock keeps concurrent hooks
# (parallel tool calls, subagents) from interleaving partial lines.
ralph_append() {
  if [[ -n $RALPH__HAVE_FLOCK ]]; then
    {
      flock -w 2 9 || true
      printf '%s' "$2" >&9
    } 9>>"$1"
  else
    printf '%s' "$2" >>"$1"
  fi
}

# Replaces file $1 with the single line $2 via rename, so readers never see a partial file.
ralph_write_atomic() {
  local tmp
  tmp=$(mktemp "$1.XXXXXX")
  printf '%s\n' "$2" >"$tmp"
  mv -f "$tmp" "$1"
}

# Sets RALPH_SESSION to the Copilot session id minted by log-session-start.sh, or "unknown".
ralph_copilot_session() {
  local id=""
  if [[ -r $RALPH_LOG_DIR/.current-session-id ]]; then
    IFS= read -r id <"$RALPH_LOG_DIR/.current-session-id" || true
  fi
  RALPH_SESSION=${id:-unknown}
}

# Mints the Copilot session id that every later Copilot record carries.
ralph_copilot_new_session() {
  ralph_write_atomic "$RALPH_LOG_DIR/.current-session-id" "ralph-$(date -u +%Y%m%d-%H%M%S)"
}

# Runs the adapter for RALPH_CLI over RALPH_INPUT and prints the result of the
# jq filter $1 applied to the envelope. $2 = record event.
ralph_adapt() {
  jq -r -L "$RALPH_HOOKS_LIB" \
    --arg hook "$RALPH_HOOK_EVENT" \
    --arg event "$2" \
    --arg session "$RALPH_SESSION" \
    --argjson now "$RALPH_NOW_MS" \
    "include \"record\"; include \"adapters/$RALPH_CLI\"; adapt | $1" <<<"$RALPH_INPUT"
}

# Normalises the payload for event $1, scrubs credentials through lib/redact.pl
# and sets RALPH_RECORD, RALPH_LOG_LINE and RALPH_TOOL_OUTPUT.
ralph_normalize() {
  local envelope assignments
  if [[ $RALPH_CLI == copilot ]]; then
    ralph_copilot_session
  fi
  envelope=$(ralph_adapt envelope_lines "$1") ||
    ralph_fail "the $RALPH_CLI adapter rejected the payload (jq exit $?)"
  [[ -n $envelope ]] || ralph_fail "empty payload"
  assignments=$(perl "$RALPH_HOOKS_LIB/redact.pl" <<<"$envelope") ||
    ralph_fail "redaction failed (perl exit $?)"
  eval "$assignments"
}

# The single audit writer: appends the v2 record to audit.jsonl and fans out the
# per-event side logs. pre-tool.log carries the same record with "ts" in place of
# "timestamp".
ralph_write() {
  ralph_append "$RALPH_LOG_DIR/audit.jsonl" "$RALPH_RECORD"$'\n'
  if [[ $RALPH_HOOK_EVENT == pre_tool ]]; then
    ralph_append "$RALPH_LOG_DIR/pre-tool.log" "${RALPH_RECORD/\"timestamp\":/\"ts\":}"$'\n'
  fi
  if [[ -n $RALPH_TOOL_OUTPUT ]]; then
    ralph_append "$RALPH_LOG_DIR/tool-output.log" "$RALPH_TOOL_OUTPUT"
  fi
  if [[ -n $RALPH_LOG_LINE ]]; then
    ralph_append "$RALPH_LOG_DIR/ralph.log" "$RALPH_LOG_LINE"$'\n'
  fi
}

# Writes the audit record for the event set by ralph_hook_init.
ralph_log_event() {
  ralph_normalize "$RALPH_HOOK_EVENT"
  ralph_write
}

# Best-effort report of a hook failure; never fails itself.
ralph__report() {
  local message=$1 session="unknown" record
  printf 'ralph hook %s (%s): %s\n' "${RALPH_HOOK_EVENT:-?}" "$RALPH_CLI" "$message" >&2
  [[ -d $RALPH_LOG_DIR ]] || mkdir -p "$RALPH_LOG_DIR" 2>/dev/null || return 0
  ralph_now_ms
  if [[ $RALPH_CLI == copilot ]]; then
    ralph_copilot_session
    session=$RALPH_SESSION
  else
    session=$(jq -r '.session_id | strings' <<<"$RALPH_INPUT" 2>/dev/null) || session=""
    session=${session:-unknown}
  fi
  record=$(jq -n -c \
    --argjson timestamp "$RALPH_NOW_MS" \
    --arg session "$session" \
    --arg cli "$RALPH_CLI" \
    --arg hook "${RALPH_HOOK_EVENT:-unknown}" \
    --arg error "$message" \
    '{schemaVersion: 2, event: "hook_error", timestamp: $timestamp, session: $session, cli: $cli,
      agent: null, agentId: null, hook: $hook, error: $error}' 2>/dev/null) &&
    ralph_append "$RALPH_LOG_DIR/audit.jsonl" "$record"$'\n' 2>/dev/null
  ralph_append "$RALPH_LOG_DIR/ralph.log" \
    "[RALPH] HOOK ERROR ${RALPH_HOOK_EVENT:-?} ($RALPH_CLI): $message"$'\n' 2>/dev/null
  return 0
}

ralph__on_exit() {
  local status=$?
  trap - EXIT ERR
  set +eu
  if ((status != 0)); then
    ralph__report "${RALPH__FAIL_MSG:-failed with status $status at ${RALPH__FAIL_AT:-unknown line}}"
  fi
  exit 0
}

# Installs the failure policy, reads the payload and parses the arguments.
# $1 = event family of the entry script, remaining arguments as described at the top.
ralph_hook_init() {
  RALPH_HOOK_EVENT=$1
  shift
  trap 'RALPH__FAIL_AT="${BASH_SOURCE[0]##*/}:$LINENO"' ERR
  trap ralph__on_exit EXIT
  RALPH_INPUT=$(cat)
  while (($# > 0)); do
    case $1 in
      --cli)
        (($# >= 2)) || ralph_fail "--cli needs a value"
        RALPH_CLI=$2
        shift 2
        ;;
      --cli=*)
        RALPH_CLI=${1#--cli=}
        shift
        ;;
      -*) ralph_fail "unknown option $1" ;;
      *) ralph_fail "unexpected argument $1" ;;
    esac
  done
  case $RALPH_CLI in
    claude | copilot) ;;
    *) ralph_fail "unsupported --cli value '$RALPH_CLI'" ;;
  esac
  [[ -d $RALPH_LOG_DIR ]] || mkdir -p "$RALPH_LOG_DIR"
  ralph_now_ms
}
