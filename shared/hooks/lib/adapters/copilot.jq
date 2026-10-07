# GitHub Copilot CLI hook payload → v2 audit envelope {record, logLine, toolOutput}.
#
# Payload fields: timestamp (epoch ms), cwd, source, initialPrompt, prompt, toolName,
# toolArgs (JSON text), toolResult {resultType, textResultForLlm}, reason,
# error {name, message, stack}. Copilot sends no session id; the caller passes the
# one minted at sessionStart as $session. Copilot names no running agent, so
# agent/agentId stay null.
#
# Arguments: $event, $session, $now (epoch ms), $failure (unused), $extra (unused).
include "record";

def copilot_tool_kind:
  if . == "task" then "subagent"
  elif . == "skill" then "skill"
  elif . == "bash" or . == "read_bash" or . == "write_bash" or . == "stop_bash" or . == "list_bash" then "shell"
  elif . == "view" or . == "edit" or . == "create" or . == "glob" or . == "grep" then "file"
  else "other"
  end;

def adapt:
  if type != "object" then error("payload is not a JSON object") else . end
  | ((.timestamp | numbers) // (.timestamp | strings | tonumber?) // $now) as $ts
  | base_record("copilot"; $event; $ts; $session; null; null) as $base
  | if $event == "session_start" then
      (.source | str_or("unknown")) as $source
      | {
          record: ($base + {
            source: $source,
            initialPrompt: (.initialPrompt | str_or("")),
            cwd: (.cwd | str_or(""))
          }),
          logLine: "[RALPH] Session \($session) started (source=\($source))"
        }
    elif $event == "prompt" then
      {record: ($base + {prompt: (.prompt | str_or(""))})}
    elif $event == "pre_tool" or $event == "post_tool" then
      (.toolName | str_or("unknown")) as $tool
      | (.toolArgs | if type == "string" then (fromjson? // null) else . end) as $input
      | (.toolArgs | str_or("{}")) as $args
      | ($base + tool_fields($tool; null; ($tool | copilot_tool_kind); $input; "agent_type"; $args)) as $pre
      | if $event == "pre_tool" then
          {record: $pre}
        else
          ((.toolResult | objects) // {}) as $result
          | ($result.resultType | str_or("unknown")) as $resultType
          | ($result.textResultForLlm | str_or("")) as $text
          | {
              record: ($pre + {resultType: $resultType, resultText: $text, durationMs: null}),
              toolOutput: tool_output_block($ts; $tool; $resultType; $args; $text),
              logLine: (if $resultType == "failure" then "[RALPH] TOOL FAILURE: \($tool) — \($text)" else "" end)
            }
        end
    elif $event == "error" then
      ((.error | objects) // {}) as $error
      | ($error.name | str_or("UnknownError")) as $name
      | ($error.message | str_or("")) as $message
      | {
          record: ($base + {
            errorName: $name,
            errorMsg: $message,
            errorStack: ($error.stack | str_or(""))
          }),
          logLine: "[RALPH] ERROR [\($name)]: \($message)"
        }
    elif $event == "session_end" then
      (.reason | str_or("unknown")) as $reason
      | {
          record: ($base + {reason: $reason, cwd: (.cwd | str_or(""))}),
          logLine: "[RALPH] Session \($session) ended (reason=\($reason))"
        }
    else
      error("Copilot CLI emits no \($event) hook")
    end;
