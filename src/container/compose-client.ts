import { execa, type ResultPromise } from "execa";
import { resolve } from "node:path";
import type { SecretsConfig } from "../config.js";

/**
 * Configuration for the compose client — JIRA config, secrets, and target repo path.
 */
export interface ComposeEnvConfig {
  secrets: SecretsConfig;
  jiraBaseUrl: string;
  jiraCloudId: string;
  /** Absolute path to the target repository on the host (mounted as /workspace in the container). */
  targetRepoPath: string;
}

/** Public contract for Docker Compose process spawning. */
export interface IComposeClient {
  /** Run `docker compose -f <file...> <args>`. */
  compose(args: string[]): ResultPromise;
  /** Run `docker compose -f <file...> exec <args>`. */
  exec(args: string[]): ResultPromise;
  /** Run `docker compose exec` with a timeout. */
  execWithTimeout(args: string[], timeoutMs: number): ResultPromise;
  /** Verify that the Docker daemon is reachable. */
  checkDocker(): Promise<void>;
  /** Find the container ID by compose project label. */
  getContainerName(projectLabel: string, service: string): Promise<string>;
}

/**
 * Low-level Docker Compose wrapper.
 *
 * All `docker compose` invocations go through this class, which handles:
 * - Compose file path resolution (base + security + resources overlay)
 * - Environment variable injection (secrets, JIRA config) into the compose process
 * - The `compose` / `exec` / `down` primitives
 *
 * Does **not** contain any business logic — just process spawning.
 */
export class ComposeClient implements IComposeClient {
  /** Environment variables passed to all `docker compose` commands. */
  private readonly env: Record<string, string>;
  /** Compose file `-f` args: ["-f", "base.yml", "-f", "security.yml", "-f", "overlay.yml", ...]. */
  private readonly fileArgs: string[];

  constructor(
    composeFilePaths: string | string[],
    envConfig: ComposeEnvConfig,
  ) {
    const paths = Array.isArray(composeFilePaths) ? composeFilePaths : [composeFilePaths];
    this.fileArgs = paths.flatMap((p) => ["-f", p]);

    this.env = {
      ...process.env as Record<string, string>,
      TARGET_REPO_PATH: envConfig.targetRepoPath,
      SHARED_HOOKS_PATH: resolve(process.cwd(), "shared/hooks"),
      SQUID_CONF_PATH: resolve(process.cwd(), "shared/security/squid.conf"),
      GH_TOKEN: envConfig.secrets.ghToken,
      ADO_PAT_DOCS: envConfig.secrets.adoPatDocs,
      ADO_MCP_AUTH_TOKEN: envConfig.secrets.adoPatDocs,
      ADO_PAT_XPERIENCE: envConfig.secrets.adoPatXperience,
      JIRA_PAT: envConfig.secrets.jiraPat,
      JIRA_EMAIL: envConfig.secrets.jiraEmail,
      JIRA_BASE_URL: envConfig.jiraBaseUrl,
      JIRA_CLOUD_ID: envConfig.jiraCloudId,
      ANTHROPIC_API_KEY: envConfig.secrets.anthropicApiKey,
      DISCORD_BOT_TOKEN: envConfig.secrets.discordBotToken ?? "",
      DISCORD_CHANNEL_ID: envConfig.secrets.discordChannelId ?? "",
      CLAUDE_CODE_DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_COST_WARNINGS: "1",
    };
  }

  /** Run `docker compose -f <file...> <args>`. */
  compose(args: string[]) {
    return execa("docker", ["compose", ...this.fileArgs, ...args], {
      env: this.env,
    });
  }

  /** Run `docker compose -f <file...> exec <args>`. */
  exec(args: string[]) {
    return execa("docker", [
      "compose", ...this.fileArgs, "exec", ...args,
    ], {
      env: this.env,
    });
  }

  /**
   * Run `docker compose exec` with a timeout.
   *
   * Returns the raw execa result promise so callers can attach stream listeners.
   */
  execWithTimeout(args: string[], timeoutMs: number) {
    return execa("docker", [
      "compose", ...this.fileArgs, "exec", ...args,
    ], {
      env: this.env,
      timeout: timeoutMs,
    });
  }

  /** Verify that the Docker daemon is reachable. */
  async checkDocker(): Promise<void> {
    try {
      await execa("docker", ["info"], { stdio: "ignore" });
    } catch {
      throw new Error(
        "Docker is not running. Start Docker Desktop and try again."
      );
    }
  }

  /** Find the container ID by compose project label. */
  async getContainerName(projectLabel: string, service: string): Promise<string> {
    const result = await execa("docker", [
      "ps",
      "--filter", `label=com.docker.compose.project=${projectLabel}`,
      "--filter", `label=com.docker.compose.service=${service}`,
      "-q",
    ]);
    const id = result.stdout.trim();
    if (!id) throw new Error(`Container not found (project=${projectLabel}, service=${service})`);
    return id;
  }
}
