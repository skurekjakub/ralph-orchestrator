import { execa, ExecaError, type ResultPromise } from "execa";
import { existsSync, readdirSync, symlinkSync, unlinkSync, mkdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { CliType, type IAgentProfile } from "../../config/types";
import { DEFAULT_COPILOT_MODEL } from "../../cli/model-catalog";
import type { ContainerExecResult } from "../types";
import type { Logger } from "../../logger";
import type { ICliExecutor } from "../cli-executor-factory";
import { StreamCapture } from "../stream-capture";
import { agentsBuildDir, profileBuildPaths } from "../setup/build-paths";

/**
 * Executes the Copilot CLI directly on the host machine (no Docker).
 *
 * Used for `mode: "local"` pipeline stages that run the CLI outside
 * the container — e.g. a reviewer stage that doesn't need Docker
 * infrastructure. Requires the `copilot` CLI to be installed and
 * available on `PATH`.
 *
 * The Copilot CLI discovers agents from `<cwd>/.github/agents/`. Since
 * rendered agent templates live in `profiles/<id>/.build/copilot/agents/`, this executor
 * symlinks them into the expected location before each invocation and
 * removes the symlinks afterwards.
 */
export class LocalCopilotExecutor implements ICliExecutor {
  readonly cli = CliType.Copilot;
  activeProcess: ResultPromise | null = null;

  /** Copilot debug log directory, relative to `cwd`. */
  private readonly logDir = ".ralph/logs/cli-debug";

  /** Symlinks created by {@link deployAgents}, removed by {@link removeAgents}. */
  private deployedLinks: string[] = [];

  constructor(
    private readonly profile: IAgentProfile,
    private readonly cwd: string,
    private readonly logger: Logger,
  ) {}

  killActive(): void {
    if (this.activeProcess) {
      try {
        this.activeProcess.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.activeProcess = null;
    }
  }

  /**
   * Build CLI flags to control the bundled GitHub MCP server.
   */
  private githubMcpFlags(): string[] {
    const tools = this.profile.githubMcpTools;
    if (tools === false) return ["--disable-builtin-mcps"];
    return tools.flatMap((t) => ["--add-github-mcp-tool", t]);
  }

  async run(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["-p", prompt]);
  }

  async continueSession(prompt: string): Promise<ContainerExecResult> {
    return this.exec(["--continue", "--prompt", prompt]);
  }

  private async exec(promptArgs: string[]): Promise<ContainerExecResult> {
    this.deployAgents();

    const args = [
      "--agent",
      this.profile.agentName,
      "--model",
      this.profile.model ?? DEFAULT_COPILOT_MODEL,
      ...this.githubMcpFlags(),
      "--log-level",
      "debug",
      "--log-dir",
      this.logDir,
      "--experimental",
      "--allow-all-tools",
      "--allow-all-paths",
      ...promptArgs,
    ];

    let capture: StreamCapture | undefined;
    try {
      this.activeProcess = execa("copilot", args, {
        cwd: this.cwd,
        timeout: this.profile.timeoutMs,
        reject: true,
      });
      capture = new StreamCapture(this.activeProcess, this.logger, "local-copilot");
      const result = await this.activeProcess;
      this.activeProcess = null;

      return {
        exitCode: result.exitCode ?? 0,
        stdout: capture.stdout,
        stderr: capture.stderr,
        timedOut: false,
        ...capture.outcome(),
      };
    } catch (err: unknown) {
      this.activeProcess = null;

      if (err instanceof ExecaError) {
        return {
          exitCode: err.exitCode ?? 1,
          stdout: capture?.stdout ?? err.stdout ?? "",
          stderr: capture?.stderr ?? err.stderr ?? "",
          timedOut: err.timedOut ?? false,
          ...(capture ? capture.outcome() : { agentText: "" }),
        };
      }

      throw err;
    } finally {
      this.removeAgents();
    }
  }

  /**
   * Symlink rendered agent templates into `<cwd>/.github/agents/` so the
   * Copilot CLI can discover them. Only creates symlinks for files that
   * don't already exist at the destination.
   */
  private deployAgents(): void {
    const buildDir = agentsBuildDir(profileBuildPaths(process.cwd(), this.profile.id), CliType.Copilot);
    if (!existsSync(buildDir)) return;

    const agentFiles = readdirSync(buildDir).filter((f) => f.endsWith(".agent.md"));
    if (agentFiles.length === 0) return;

    const agentsDir = join(this.cwd, ".github", "agents");
    mkdirSync(agentsDir, { recursive: true });

    for (const file of agentFiles) {
      const dest = join(agentsDir, file);
      if (existsSync(dest)) continue;

      const source = join(buildDir, file);
      symlinkSync(source, dest);
      this.deployedLinks.push(dest);
    }

    this.logger.info(`Deployed ${this.deployedLinks.length} agent symlink(s) to ${agentsDir}`);
  }

  /** Remove symlinks created by {@link deployAgents}. */
  private removeAgents(): void {
    for (const link of this.deployedLinks) {
      try {
        const stat = lstatSync(link, { throwIfNoEntry: false });
        if (stat?.isSymbolicLink()) {
          unlinkSync(link);
        }
      } catch {
        /* best-effort cleanup */
      }
    }
    this.deployedLinks = [];
  }
}
