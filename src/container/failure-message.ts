import { FailureReason, type RalphResult } from "./types";
import { truncate } from "../util/text";

/** Longest CLI error message quoted in a failure description. */
const CLI_MESSAGE_CHARS = 500;

/**
 * Why a run did not succeed, in plain language, for the ledger and the work item's error comment: the
 * failure reason with the CLI's own message, else the run's stderr, else its status.
 */
export function describeFailure(result: RalphResult): string {
  const message = result.cliError?.message ? `: ${truncate(result.cliError.message, CLI_MESSAGE_CHARS)}` : "";
  switch (result.failureReason) {
    case FailureReason.AuthFailed:
      return `The agent CLI could not authenticate${message}`;
    case FailureReason.MaxTurns:
      return `The agent CLI stopped at its turn limit${message}`;
    case FailureReason.ExecutionError:
      return `The agent CLI failed while it ran${message}`;
    case FailureReason.CliError:
      return `The agent CLI reported an error (${result.cliError?.subtype ?? "unknown"})${message}`;
    case FailureReason.MissingResultBlock:
      return (
        "The agent finished without the ===RALPH_RESULT_START=== … ===RALPH_RESULT_END=== result block " +
        "its stage requires"
      );
    case FailureReason.ExitCode:
      return result.stderr || `The agent CLI exited with code ${result.exitCode}`;
    case undefined:
      return result.stderr || `Agent finished with status: ${result.status}`;
  }
}
