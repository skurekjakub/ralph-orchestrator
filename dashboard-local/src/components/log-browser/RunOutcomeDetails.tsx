import { useState } from "react";
import type { ExecutionSummary } from "../../types";

/**
 * What an execution summary says went wrong: a warning for sessions Ralph's hooks did not run in, the failure
 * reason, category and CLI error, and the agent's own text behind a toggle. Renders nothing for a clean run.
 */
export function RunOutcomeDetails({ summary }: { summary: ExecutionSummary }) {
  const [showAgentText, setShowAgentText] = useState(false);
  const hookless = summary.hooklessSessions ?? [];
  const { failureReason, failureCategory, cliError, agentText } = summary;

  if (hookless.length === 0 && !failureReason && !failureCategory && !cliError && !agentText) return null;

  return (
    <div className="flex flex-col gap-1 mb-1">
      {hookless.length > 0 && (
        <div role="alert" className="text-[10px] px-2 py-1 rounded border border-warn/30 bg-warn/10 text-warn">
          ⚠ Ralph's hooks did not run for {hookless.length === 1 ? "session" : "sessions"}{" "}
          <span className="font-mono">{hookless.join(", ")}</span>: the audit, pre-tool and tool-output logs miss their
          calls and the result gate did not run. Run telemetry and the session logs still cover them.
        </div>
      )}

      {(failureReason || failureCategory || cliError) && (
        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          {failureReason && (
            <span className="px-1 py-px rounded bg-error/15 text-error font-mono" title="Failure reason">
              {failureReason}
            </span>
          )}
          {failureCategory && (
            <span className="px-1 py-px rounded bg-border text-dim" title="Failure category">
              {failureCategory}
            </span>
          )}
          {cliError && (
            <span className="text-error">
              CLI error <span className="font-mono">{cliError.subtype}</span>
              {cliError.message && `: ${cliError.message}`}
            </span>
          )}
        </div>
      )}

      {agentText && (
        <div>
          <button
            type="button"
            onClick={() => setShowAgentText((prev) => !prev)}
            className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/[0.04] transition-colors"
          >
            <span className="text-[10px] text-dim">{showAgentText ? "▾" : "▸"}</span>
            <span className="text-[10px] text-dim">Agent text</span>
          </button>
          {showAgentText && (
            <pre className="m-0 mt-0.5 ml-4 max-h-60 overflow-y-auto rounded bg-bg-panel/50 p-1.5 font-mono text-[10px] whitespace-pre-wrap break-words">
              {agentText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
