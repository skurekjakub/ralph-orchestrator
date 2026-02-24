import type { IComposeClient } from "./compose-client.js";
import type { Logger } from "../logger.js";

/** Public contract for workspace cleanup inside a container. */
export interface IContainerWorkspaceCleaner {
  /** Ensure the CLI config directory and its writable subdirectories are owned by vscode. */
  prepareConfigDir(configDir: string, writableDirs: readonly string[]): Promise<void>;
  /** Clear and recreate the audit log directory with vscode ownership. */
  cleanDirectory(auditLogPath: string): Promise<void>;
  /** Delete configured workspace paths before agent execution. */
  cleanPaths(paths: readonly string[]): Promise<void>;
}

/**
 * Cleans up workspace paths inside a running Docker Compose container
 * before agent execution.
 *
 * Handles two kinds of cleanup:
 *
 * 1. **Log directory** — the Ralph audit/transcript log directory is removed and
 *    recreated with vscode ownership. The parent (`/workspace/.ralph/`) is
 *    root-owned (created by Docker as a side effect of the hooks volume mount),
 *    so root exec is required. Needs `DAC_OVERRIDE` capability in the security
 *    overlay to work with `cap_drop: ALL`.
 *
 * 2. **Workspace paths** — arbitrary paths configured in the profile
 *    (`cleanPaths`). Removed as vscode (agent-created files).
 */
export class ContainerWorkspaceCleaner implements IContainerWorkspaceCleaner {
  constructor(
    private readonly compose: IComposeClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Ensure the Copilot CLI config directory (`/workspace/.ralph`) and its
   * writable subdirectories are owned by vscode.
   *
   * Docker creates `/workspace/.ralph/` as root when bind-mounting files
   * into it (mcp-config.json, config.json, etc.). The Copilot CLI then
   * fails to create runtime directories like `session-state/` and
   * `logs/cli-debug/` because the parent is root-owned.
   *
   * @param configDir The config directory path inside the container.
   * @param writableDirs Subdirectories the CLI needs to create/write at runtime.
   */
  async prepareConfigDir(configDir: string, writableDirs: readonly string[]): Promise<void> {
    try {
      await this.compose.exec(["-T", "--user", "root", "app", "chown", "vscode:vscode", configDir]);
      for (const dir of writableDirs) {
        await this.compose.exec(["-T", "--user", "root", "app", "mkdir", "-p", dir]);
        await this.compose.exec(["-T", "--user", "root", "app", "chown", "vscode:vscode", dir]);
      }
      this.logger.info(`Config directory ready: ${configDir}`);
    } catch (err) {
      this.logger.warn(`Failed to prepare config directory: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Clear and recreate the audit log directory with vscode ownership.
   *
   * @param auditLogPath Absolute path to the audit log file inside the
   *   container — the parent directory is derived from this.
   */
  async cleanDirectory(auditLogPath: string): Promise<void> {
    const logDir = auditLogPath.substring(0, auditLogPath.lastIndexOf("/") + 1);
    try {
      await this.compose.exec(["-T", "--user", "root", "app", "rm", "-rf", logDir]);
      await this.compose.exec(["-T", "--user", "root", "app", "mkdir", "-p", logDir]);
      await this.compose.exec(["-T", "--user", "root", "app", "chown", "vscode:vscode", logDir]);
      this.logger.info(`Logs directory ready: ${logDir}`);
    } catch (err) {
      this.logger.warn(`Failed to prepare logs directory: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Delete configured workspace paths before agent execution.
   *
   * Runs as root — non-root users don't benefit from container capabilities
   * (`DAC_OVERRIDE`) because Linux only populates the effective set for UID 0.
   *
   * @param paths Absolute paths inside the container to remove.
   */
  async cleanPaths(paths: readonly string[]): Promise<void> {
    for (const fullPath of paths) {
      try {
        await this.compose.exec(["-T", "--user", "root", "app", "rm", "-rf", fullPath]);
        this.logger.info(`Cleaned: ${fullPath}`);
      } catch (err) {
        this.logger.warn(`Failed to clean ${fullPath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}
