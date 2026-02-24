import type { IAgentProfile, IAppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { IComposeClient } from "./compose-client.js";
import type { ContainerExecResult, CliPaths } from "./types.js";
import { CopilotExecutor } from "./cli-executors/copilot-executor.js";

/**
 * Common interface for CLI executors (Copilot CLI, Claude Code CLI).
 *
 * Each implementation translates a prompt into the appropriate CLI invocation
 * inside the container, handles streaming, timeout, and process lifecycle.
 */
export interface ICliExecutor {
  /** Filesystem paths specific to the chosen CLI. */
  readonly paths: CliPaths;
  /** Execute the agent CLI with the given prompt. */
  run(prompt: string): Promise<ContainerExecResult>;
  /** Resume the previous CLI session with a continuation prompt. */
  continueSession(prompt: string): Promise<ContainerExecResult>;
  /** Kill the active process if running (for graceful shutdown). */
  killActive(): void;
}

/**
 * Creates the appropriate {@link ICliExecutor} for a profile based on
 * available credentials.
 *
 * Only Copilot CLI is currently supported — Claude Code CLI lacks the
 * URL restriction and pre-tool hook infrastructure required for secure
 * operation.
 */
export interface ICliExecutorFactory {
  /** Create a CLI executor for the given profile. Throws if required credentials are missing. */
  create(compose: IComposeClient, profile: IAgentProfile, cliLogger: Logger): ICliExecutor;
}

/** Default implementation — creates a {@link CopilotExecutor} when GH_TOKEN is available. */
export class CliExecutorFactory implements ICliExecutorFactory {
  private readonly appConfig: IAppConfig;

  constructor({ config }: { config: IAppConfig }) {
    this.appConfig = config;
  }

  create(compose: IComposeClient, profile: IAgentProfile, cliLogger: Logger): ICliExecutor {
    if (this.appConfig.secrets.ghToken) {
      return new CopilotExecutor(compose, profile, cliLogger);
    }

    throw new Error(
      "GH_TOKEN is required — Copilot CLI is the only supported CLI. Set GH_TOKEN in .env",
    );
  }
}
