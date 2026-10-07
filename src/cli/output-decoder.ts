/** Token usage of one model within a CLI run. */
export interface CliModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly costUsd?: number;
}

/** Token, cost and turn usage a CLI reported for one run. */
export interface CliRunUsage {
  readonly costUsd?: number;
  readonly numTurns?: number;
  readonly durationApiMs?: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  /** Usage per model id. */
  readonly byModel: Readonly<Record<string, CliModelUsage>>;
  /** Tool calls the CLI's permission rules denied. */
  readonly permissionDenials: number;
  readonly subagentsSpawned?: number;
  /** Why the session ended, as the CLI reports it. */
  readonly terminalReason?: string;
}

/** Terminal error a CLI reported for its session (e.g. subtype `error_max_turns`). */
export interface CliError {
  readonly subtype: string;
  readonly message?: string;
}

/** What one stdout line of a CLI contributes to the activity log and to the agent's own text. */
export interface DecodedLine {
  /** Human-readable log lines (`assistant: …`, `[ralph-writer] tool Edit src/x.md`, `result: success $1.23 41 turns`). */
  readonly logLines: readonly string[];
  /** Lines to log as warnings: malformed output, tool and API errors. */
  readonly warnings?: readonly string[];
  /** Main-thread assistant text carried by the line; result-block detection reads only this. */
  readonly agentText?: string;
}

/** Everything decoded from one CLI process once it has exited. */
export interface CliRunOutcome {
  /**
   * The agent text the result block is read from: the final result the CLI reports when that holds a valid
   * result block, otherwise all main-thread assistant text, in order.
   */
  readonly agentText: string;
  /** The result the CLI returned as structured output (Claude Code `--json-schema`), unvalidated; absent without one. */
  readonly structuredOutput?: unknown;
  readonly usage?: CliRunUsage;
  /** CLI session id, for resuming the session and correlating logs. */
  readonly sessionId?: string;
  readonly cliError?: CliError;
}

/** Stateful decoder for the stdout of one CLI process. */
export interface ICliOutputDecoder {
  /**
   * Whether the agent's answer ends with a result block in the decoded text, after which the CLI may idle instead
   * of exiting. False for a CLI whose output ends with a result event of its own.
   */
  readonly answerEndsAtResultBlock: boolean;
  /** Decodes one stdout line. A malformed line is logged verbatim, never thrown. */
  decodeLine(rawLine: string): DecodedLine;
  /** The decoded run after the process exits; when the CLI reports several results, the last one wins. */
  finish(): CliRunOutcome;
}
