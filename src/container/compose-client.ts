import { execa, type ResultPromise } from "execa";
import { sharedHooksDir } from "./setup/build-paths";

/** Stdin for a `docker compose exec` command. */
export interface ExecInputOptions {
  /** Text written to the command's stdin, which is then closed. */
  readonly input?: string;
}

/** Public contract for Docker Compose process spawning. */
export interface IComposeClient {
  /** Run `docker compose -f <file...> <args>`. */
  compose(args: string[]): ResultPromise;
  /** Run `docker compose -f <file...> exec <args>`. */
  exec(args: string[]): ResultPromise;
  /**
   * Run `docker compose exec` with a timeout.
   *
   * @param options.input Text written to the command's stdin; pass `-T` in `args` so compose forwards it.
   */
  execWithTimeout(args: string[], timeoutMs: number, options?: ExecInputOptions): ResultPromise;
  /** Run `docker compose -f <file...> logs --no-color --no-log-prefix <service>`. */
  logs(service: string): ResultPromise;
  /** Verify that the Docker daemon is reachable. */
  checkDocker(): Promise<void>;
  /** Find the container ID by compose project label. */
  getContainerName(projectLabel: string, service: string): Promise<string>;
}

/**
 * Low-level Docker Compose wrapper.
 *
 * All `docker compose` invocations go through this class, which handles:
 * - The `-f` arguments of the compose files it is given
 * - Environment variable injection (secrets, host paths) into the compose process
 * - The `compose` / `exec` / `down` primitives
 *
 * Does **not** contain any business logic — just process spawning.
 */
export class ComposeClient implements IComposeClient {
  /** Environment variables passed to all `docker compose` commands. */
  private readonly env: Record<string, string>;
  /** Compose file `-f` args: ["-f", "base.yml", "-f", "security.yml", "-f", "overlay.yml", ...]. */
  private readonly fileArgs: string[];

  /**
   * @param deps.composeFiles The compose files, merged in order.
   * @param deps.workspacePath Absolute host path of the task's workspace, its checkout of the target repository,
   *   interpolated as `TARGET_REPO_PATH` and mounted at `/workspace` in the agent container and the MCP sidecar.
   * @param deps.squidConfPath Absolute path of the profile's generated `squid.conf`, interpolated as `SQUID_CONF_PATH`.
   * @param deps.rootDir The orchestrator checkout, whose `shared/hooks` is interpolated as `SHARED_HOOKS_PATH`.
   */
  constructor({
    composeFiles,
    workspacePath,
    squidConfPath,
    rootDir,
  }: {
    composeFiles: readonly string[];
    workspacePath: string;
    squidConfPath: string;
    rootDir: string;
  }) {
    this.fileArgs = composeFiles.flatMap((p) => ["-f", p]);

    this.env = {
      ...(process.env as Record<string, string>),
      // Computed paths — not in .env, needed for volume mount interpolation.
      TARGET_REPO_PATH: workspacePath,
      SHARED_HOOKS_PATH: sharedHooksDir(rootDir),
      SQUID_CONF_PATH: squidConfPath,
      // Host UID/GID for sidecar build args — ensures the sidecar process owns
      // the bind-mounted workspace and can write to it without permission errors.
      HOST_UID: String(process.getuid?.() ?? 1000),
      HOST_GID: String(process.getgid?.() ?? 1000),
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
    return execa("docker", ["compose", ...this.fileArgs, "exec", ...args], {
      env: this.env,
    });
  }

  /** Run `docker compose logs` for a single service (no ANSI color, no prefix). */
  logs(service: string) {
    return execa("docker", ["compose", ...this.fileArgs, "logs", "--no-color", "--no-log-prefix", service], {
      env: this.env,
    });
  }

  /**
   * Run `docker compose exec` with a timeout.
   *
   * Returns the raw execa result promise so callers can attach stream listeners.
   */
  execWithTimeout(args: string[], timeoutMs: number, options: ExecInputOptions = {}) {
    return execa("docker", ["compose", ...this.fileArgs, "exec", ...args], {
      env: this.env,
      timeout: timeoutMs,
      ...(options.input === undefined ? {} : { input: options.input }),
    });
  }

  /** Verify that the Docker daemon is reachable. */
  async checkDocker(): Promise<void> {
    try {
      await execa("docker", ["info"], { stdio: "ignore" });
    } catch {
      throw new Error("Docker is not running. Start Docker Desktop and try again.");
    }
  }

  /** Find the container ID by compose project label. */
  async getContainerName(projectLabel: string, service: string): Promise<string> {
    const result = await execa("docker", [
      "ps",
      "--filter",
      `label=com.docker.compose.project=${projectLabel}`,
      "--filter",
      `label=com.docker.compose.service=${service}`,
      "-q",
    ]);
    const id = result.stdout.trim();
    if (!id) throw new Error(`Container not found (project=${projectLabel}, service=${service})`);
    return id;
  }
}
