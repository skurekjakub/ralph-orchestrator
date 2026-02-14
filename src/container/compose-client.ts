import { execa } from "execa";
import type { SecretsConfig } from "../config.js";

/**
 * Configuration for the compose client — JIRA and secrets needed as env vars.
 */
export interface ComposeEnvConfig {
  secrets: SecretsConfig;
  jiraBaseUrl: string;
  jiraCloudId: string;
}

/**
 * Low-level Docker Compose wrapper.
 *
 * All `docker compose` invocations go through this class, which handles:
 * - Compose file path resolution
 * - Environment variable injection (secrets, JIRA config) into the compose process
 * - The `compose` / `exec` / `down` primitives
 *
 * Does **not** contain any business logic — just process spawning.
 */
export class ComposeClient {
  /** Environment variables passed to all `docker compose` commands. */
  private readonly env: Record<string, string>;

  constructor(
    private readonly composeFilePath: string,
    envConfig: ComposeEnvConfig,
  ) {
    this.env = {
      ...process.env as Record<string, string>,
      GH_TOKEN: envConfig.secrets.ghToken,
      ADO_PAT_DOCS: envConfig.secrets.adoPatDocs,
      ADO_MCP_AUTH_TOKEN: envConfig.secrets.adoPatDocs,
      ADO_PAT_XPERIENCE: envConfig.secrets.adoPatXperience,
      JIRA_PAT: envConfig.secrets.jiraPat,
      JIRA_EMAIL: envConfig.secrets.jiraEmail,
      JIRA_BASE_URL: envConfig.jiraBaseUrl,
      JIRA_CLOUD_ID: envConfig.jiraCloudId,
    };
  }

  /** Run `docker compose -f <file> <args>`. */
  compose(args: string[]) {
    return execa("docker", ["compose", "-f", this.composeFilePath, ...args], {
      env: this.env,
    });
  }

  /** Run `docker compose -f <file> exec <args>`. */
  exec(args: string[]) {
    return execa("docker", [
      "compose", "-f", this.composeFilePath, "exec", ...args,
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
      "compose", "-f", this.composeFilePath, "exec", ...args,
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
