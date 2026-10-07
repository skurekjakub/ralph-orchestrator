# Claude Code hook payload → v2 audit envelope {record, logLine, toolOutput}.
#
# Every payload carries session_id, transcript_path, cwd, hook_event_name and
# agent_type (frontmatter name of the running agent); agent_id appears inside
# subagents. Tool events add tool_name, tool_input (object) and tool_use_id;
# PostToolUse adds tool_response and duration_ms, PostToolUseFailure adds error.
# Payloads carry no timestamp, so records use the hook's clock ($now).
#
# Arguments: $event, $session (unused), $now (epoch ms), $failure (true for
# PostToolUseFailure), $extra ({blocks, max}, merged into result_gate_* records).
include "record";

def claude_tool_kind:
  if . == "Agent" or . == "Task" then "subagent"
  elif . == "Skill" then "skill"
  elif . == "Bash" then "shell"
  elif . == "Read" or . == "Write" or . == "Edit" or . == "MultiEdit" or . == "NotebookEdit" or . == "Glob" or . == "Grep" then "file"
  elif startswith("mcp__") then "mcp"
  else "other"
  end;

# Text a tool produced, from the structured tool_response: Bash {stdout, stderr},
# Agent/MCP {content: [text blocks]} or bare block arrays, Read {file: {content}}.
# Other objects are serialised without originalFile (the pre-edit file body).
def response_text:
  if type == "string" then .
  elif type == "null" then ""
  elif type == "array" then
    map(if type == "object" and .type == "text" then (.text | str_or("")) elif type == "string" then . else tojson end)
    | join("\n")
  elif type == "object" then
    if has("stdout") or has("stderr") then
      [(.stdout | str_or("")), (.stderr | str_or(""))] | map(select(. != "")) | join("\n")
    elif (.content | type) == "array" then .content | response_text
    elif (.file | type) == "object" and (.file.content | type) == "string" then .file.content
    else del(.originalFile) | tojson
    end
  else tojson
  end;

def adapt:
  if type != "object" then error("payload is not a JSON object") else . end
  | (.session_id | str_or("unknown")) as $sessionId
  | (.agent_type | str_or_null) as $agent
  | base_record("claude"; $event; $now; $sessionId; $agent; (.agent_id | str_or_null)) as $base
  | if $event == "session_start" then
      (.source | str_or("unknown")) as $source
      | {
          record: ($base + {source: $source, initialPrompt: "", cwd: (.cwd | str_or(""))}),
          logLine: "[RALPH] Session \($sessionId) started (source=\($source))"
        }
    elif $event == "prompt" then
      {record: ($base + {prompt: (.prompt | str_or(""))})}
    elif $event == "pre_tool" or $event == "post_tool" then
      (.tool_name | str_or("unknown")) as $tool
      | (.tool_input // {}) as $input
      | ($input | if type == "string" then . else tojson end) as $args
      | ($base + tool_fields($tool; (.tool_use_id | str_or_null); ($tool | claude_tool_kind); $input; "subagent_type"; $args)) as $pre
      | if $event == "pre_tool" then
          {record: $pre}
        else
          (if $failure then "failure" else "success" end) as $resultType
          | (if $failure then (.error | str_or("")) else (.tool_response | response_text) end) as $text
          | {
              record: ($pre + {
                resultType: $resultType,
                resultText: $text,
                durationMs: ((.duration_ms | numbers) // null)
              }),
              toolOutput: tool_output_block($now; $tool; $resultType; $args; $text),
              logLine: (if $failure then "[RALPH] TOOL FAILURE: \($tool) — \($text)" else "" end)
            }
        end
    elif $event == "error" then
      (.error | str_or("UnknownError")) as $name
      | (.last_assistant_message | str_or("")) as $message
      | {
          record: ($base + {errorName: $name, errorMsg: $message, errorStack: ""}),
          logLine: "[RALPH] ERROR [\($name)]: \($message)"
        }
    elif $event == "session_end" then
      (.reason | str_or("unknown")) as $reason
      | {
          record: ($base + {reason: $reason, cwd: (.cwd | str_or(""))}),
          logLine: "[RALPH] Session \($sessionId) ended (reason=\($reason))"
        }
    elif $event == "subagent_start" then
      {
        record: ($base + {subagent: $agent}),
        logLine: "[RALPH] Subagent \($agent // "unknown") started (id=\($base.agentId // "unknown"))"
      }
    elif $event == "subagent_stop" then
      {
        record: ($base + {
          subagent: $agent,
          lastMessage: (.last_assistant_message | str_or(""))
        }),
        logLine: "[RALPH] Subagent \($agent // "unknown") stopped (id=\($base.agentId // "unknown"))"
      }
    elif $event == "compact" then
      (.trigger | str_or("unknown")) as $trigger
      | {
          record: ($base + {trigger: $trigger}),
          logLine: "[RALPH] Context compaction (trigger=\($trigger), agent=\($agent // "main"))"
        }
    elif $event == "result_gate_block" then
      {
        record: ($base + $extra),
        logLine: "[RALPH] Result gate blocked stop \($extra.blocks)/\($extra.max): no result block yet"
      }
    elif $event == "result_gate_exhausted" then
      {
        record: ($base + $extra),
        logLine: "[RALPH] Result gate gave up after \($extra.max) blocks; stop allowed without a result block"
      }
    else
      error("Claude Code adapter has no mapping for \($event)")
    end;
