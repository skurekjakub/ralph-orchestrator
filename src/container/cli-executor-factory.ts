import type { AgentProfile, AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { IComposeClient } from "./compose-client.js";
import type { CliExecutor } from "./types.js";
import { CopilotExecutor } from "./cli-executors/copilot-executor.js";

/**
 * Creates the appropriate {@link CliExecutor} for a profile based on
 * available credentials.
 *
 * Only Copilot CLI is currently supported — Claude Code CLI lacks the
 * URL restriction and pre-tool hook infrastructure required for secure
 * operation.
 */
export interface ICliExecutorFactory {
  /** Create a CLI executor for the given profile. Throws if required credentials are missing. */
  create(compose: IComposeClient, profile: AgentProfile, cliLogger: Logger): CliExecutor;
}

/** Default implementation — creates a {@link CopilotExecutor} when GH_TOKEN is available. */
export class CliExecutorFactory implements ICliExecutorFactory {
  constructor(private readonly appConfig: AppConfig) {}

  create(compose: IComposeClient, profile: AgentProfile, cliLogger: Logger): CliExecutor {
    if (this.appConfig.secrets.ghToken) {
      return new CopilotExecutor(compose, profile, cliLogger);
    }

    throw new Error(
      "GH_TOKEN is required — Copilot CLI is the only supported CLI. Set GH_TOKEN in .env",
    );
  }
}
