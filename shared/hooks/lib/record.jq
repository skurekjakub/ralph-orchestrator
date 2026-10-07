# Building blocks shared by the CLI adapters (lib/adapters/*.jq).
#
# The container images ship jq 1.6 (Ubuntu 22.04, Debian bookworm), so this file
# avoids jq 1.7-only syntax: every `if` has an `else`, and substring checks use
# literal split/contains because jq 1.6 `index` returns byte offsets that do not
# line up with codepoint slicing on non-ASCII text.

# Version of the audit record layout written to every record.
def schema_version: 2;

# Character budget for free text in audit.jsonl; tool-output.log keeps the full text.
def audit_text_limit: 2000;

def truncate_text:
  if length > audit_text_limit then .[:audit_text_limit] + "...[truncated]" else . end;

# Keeps the record shape stable when a CLI sends an unexpected type.
def str_or($default):
  if type == "string" then . elif . == null then $default else tojson end;

def str_or_null: str_or(null);

# Bash variables cannot hold NUL bytes, so raw text handed to the shell drops them.
def nul_free: split("\u0000") | join("");

# Literal values of credential variables in the hook's environment. Hooks inherit
# the CLI's environment, so these are exactly the secrets an agent could echo.
def secret_values:
  [
    $ENV
    | to_entries[]
    | select(.key | test("TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|CREDENTIAL|(^|_)PAT(_|$)"))
    | .value
    | select(type == "string" and length >= 8)
  ];

# Scrubs credentials from free text: the literal values in $secrets, then
# well-known token formats, HTTP authorization values, URL passwords and
# KEY=value / "key": "value" assignments whose key names a secret.
def redact($secrets):
  if type != "string" then .
  else
    reduce $secrets[] as $secret (.; split($secret) | join("[REDACTED]"))
    | if test("sk-ant-|gh[pousr]_|github_pat_|://[^/@\\s]+:[^/@\\s]+@|(?i:authorization|token|secret|passw|api_?key|private_?key|pat)") then
        gsub("sk-ant-[A-Za-z0-9_-]{8,}"; "[REDACTED]")
        | gsub("\\bgh[pousr]_[A-Za-z0-9]{20,}"; "[REDACTED]")
        | gsub("\\bgithub_pat_[A-Za-z0-9_]{20,}"; "[REDACTED]")
        | gsub("(?<k>(?i:authorization)\\\\?\"?\\s*[:=]\\s*\\\\?\"?(?i:bearer|basic|token)\\s+)[^\\s\"'\\\\]+"; "\(.k)[REDACTED]")
        | gsub("(?<k>://[^/@\\s:]+:)[^/@\\s]+@"; "\(.k)[REDACTED]@")
        | gsub("(?<k>\\b[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|_PAT)=)[^\\s\"'\\\\$][^\\s\"'\\\\]*"; "\(.k)[REDACTED]")
        | gsub("(?<k>\\\\?\"[A-Za-z0-9_-]*(?i:token|secret|password|passwd|api_?key|private_?key|pat)\\\\?\"\\s*:\\s*\\\\?\")[^\"\\\\]+"; "\(.k)[REDACTED]")
      else .
      end
  end;

# The text between the first ===RALPH_RESULT_START=== and the first
# ===RALPH_RESULT_END=== after it, or null when there is no such pair.
def result_block_body:
  split("===RALPH_RESULT_START===") as $parts
  | if ($parts | length) < 2 then null
    else
      ($parts[1:] | join("===RALPH_RESULT_START===") | split("===RALPH_RESULT_END===")) as $rest
      | if ($rest | length) < 2 then null else $rest[0] end
    end;

# JavaScript's \s, so the status token ends where the orchestrator's regex ends it.
def js_space: "\t\n\u000b\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

# The STATUS value parseResultBlock (src/container/result-parser.ts) reads from
# the text, or null. The key is ASCII case-insensitive, like its /i flag.
def result_status:
  if type != "string" then null
  else
    result_block_body
    | if . == null then null
      else (first(capture("[Ss][Tt][Aa][Tt][Uu][Ss]:[\(js_space)]*(?<status>[^\(js_space)]+)") | .status) // null)
      end
  end;

# True when the text holds a result block whose STATUS the orchestrator accepts.
def has_result_block:
  result_status | . == "completed" or . == "partial" or . == "blocked";

# "mcp__<server>__<tool>" → {server, tool}; null for any other name.
def mcp_parts:
  if startswith("mcp__") then
    (.[5:] | split("__")) as $parts
    | if ($parts | length) >= 2 and ($parts[0] | length) > 0 then
        {server: $parts[0], tool: ($parts[1:] | join("__"))}
      else null
      end
  else null
  end;

def base_record($cli; $event; $timestamp; $session; $agent; $agentId):
  {
    schemaVersion: schema_version,
    event: $event,
    timestamp: $timestamp,
    session: $session,
    cli: $cli,
    agent: $agent,
    agentId: $agentId
  };

# Tool fields shared by pre_tool and post_tool records. $input is the parsed tool
# arguments (object or null); $subagentKey names the argument carrying the agent type.
def tool_fields($tool; $toolUseId; $kind; $input; $subagentKey; $args):
  ($tool | mcp_parts) as $mcp
  | {
      tool: $tool,
      toolUseId: $toolUseId,
      toolKind: $kind,
      mcpServer: (if $mcp == null then null else $mcp.server end),
      mcpTool: (if $mcp == null then null else $mcp.tool end),
      subagent: (if $kind == "subagent" then (($input | objects | .[$subagentKey] | strings) // null) else null end),
      skill: (if $kind == "skill" then (($input | objects | .skill | strings) // null) else null end),
      args: $args
    };

# The human-readable block appended to tool-output.log. The header format is parsed
# by dashboard-local (tool-log-timeline-parser.ts), so it must not change.
def tool_output_block($timestamp; $tool; $resultType; $args; $text):
  "── \($timestamp / 1000 | floor | strftime("%H:%M:%S")) \($tool) (\($resultType)) ──\nargs: \($args)\n\($text)\n\n";

# Shell assignments consumed by lib/common.sh (`eval`): the one-line record, the
# ralph.log line and the tool-output.log block.
def shell_envelope:
  @sh "RALPH_RECORD=\(.record | tojson) RALPH_LOG_LINE=\(.logLine // "" | nul_free) RALPH_TOOL_OUTPUT=\(.toolOutput // "" | nul_free)";
