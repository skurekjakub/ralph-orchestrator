import { execa } from "execa";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ICliRuntime } from "../../cli/cli-runtime";
import { hostCliEnv } from "../../cli/host-env";
import type { HostStageWorkspace } from "../types";

/** What a host stage's CLI needs from its workspace before it starts. */
export interface HostStageLaunch {
  /** The rendered file of the stage's root agent, which `--agent` resolves. */
  readonly rootAgentPath: string;
  /** The stage CLI's runtime, whose credential the CLI gets. */
  readonly runtime: ICliRuntime;
  /** CLI-specific variables, which win over the inherited ones. */
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Readies `workspace` for a host stage's CLI and returns the CLI's whole environment ({@link hostCliEnv}).
 *
 * Creates the working directory, the CLI home and the log directory, and makes the working directory a git
 * repository of its own. A CLI that discovers instructions, agents and skills up to the git root then stops at
 * the working directory instead of reaching the orchestrator checkout it sits in.
 *
 * @throws Error when the stage's root agent was not rendered into the workspace, or `git init` fails.
 */
export async function prepareHostStage(
  workspace: HostStageWorkspace,
  { rootAgentPath, runtime, env }: HostStageLaunch,
): Promise<Record<string, string>> {
  if (!existsSync(rootAgentPath)) {
    throw new Error(`Rendered agent ${rootAgentPath} not found; the stage's agents must be rendered before it runs`);
  }
  for (const dir of [workspace.cwd, workspace.cliHomeDir, workspace.logDir]) await mkdir(dir, { recursive: true });
  if (!existsSync(join(workspace.cwd, ".git"))) await execa("git", ["init", "--quiet"], { cwd: workspace.cwd });
  return hostCliEnv(
    process.env,
    runtime.credentials.required.map(({ envVar }) => envVar),
    env,
  );
}
