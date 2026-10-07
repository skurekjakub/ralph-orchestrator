import { isAbsolute, join, resolve } from "node:path";
import type { ICliRuntimeRegistry } from "../cli/cli-runtime";
import { StageMode, type IStageConfig } from "../config/types";
import { agentsBuildDir, profileBuildPaths } from "../container/setup/build-paths";
import type { ContainerStageWorkspace, HostStageWorkspace, StageWorkspace } from "../container/types";
import { CONTAINER_WORKSPACE_DIR } from "../container/workspace-paths";
import { assertSafeName } from "../util/safe-id";
import type { TaskContext } from "./task-context";

/** Resolves where each stage of a task runs and where its rendered agents, skills and artifacts go. */
export interface IStageWorkspaceResolver {
  /**
   * The workspace of `stage`, a stage of the task's variant: the container's `/workspace` for a container stage,
   * `<outputDir>/stages/<role>` on the host for a local one, whose artifacts are the container stages' own.
   *
   * @throws Error when a local stage's role is unsafe as a directory name or the task has no absolute output dir.
   */
  forStage(ctx: TaskContext, stage: IStageConfig): StageWorkspace;
  /**
   * The workspace of `stage`, a stage of the post-task hook `hookName`: `<outputDir>/hooks/<hook>/<role>` on the
   * host, with an artifact directory all the hook's stages share.
   *
   * @throws Error when `stage` is not a local stage, its role is unsafe as a directory name or names the shared
   *   artifact directory, or the task has no absolute output dir.
   */
  forHookStage(ctx: TaskContext, hookName: string, stage: IStageConfig): HostStageWorkspace;
}

/** The directory under `<outputDir>/hooks/<hook>` that holds the artifacts all the hook's stages share. */
export const HOOK_ARTIFACTS_DIR = "artifacts";

/** `<outputDir>/hooks/<hookName>`: the output directory of one post-task hook (`hook.outputDir`). */
export function hookOutputDir(outputDir: string, hookName: string): string {
  return join(outputDir, "hooks", hookName);
}

/** The `shared/` sources a host stage may read: those the post-task hook prompts propose changes to. */
const READABLE_SHARED_DIRS = ["agent-includes", "skills", "mcp-servers"] as const;

/** `.ralph/tasks/<key>/artifacts`, relative to the task's workspace: where container stages write their artifacts. */
function workspaceArtifactDir(workItemId: string): string {
  return `.ralph/tasks/${workItemId}/artifacts`;
}

/** Lays out stage workspaces under the task's output directory and the profile's build directory. */
export class StageWorkspaceResolver implements IStageWorkspaceResolver {
  private readonly cliRuntimes: ICliRuntimeRegistry;
  private readonly rootDir: string;

  /**
   * @param rootDir The orchestrator checkout: the profile build directories, and the agent templates and `shared/`
   *   sources that host stages may read.
   */
  constructor({ cliRuntimes, rootDir }: { cliRuntimes: ICliRuntimeRegistry; rootDir: string }) {
    this.cliRuntimes = cliRuntimes;
    this.rootDir = resolve(rootDir);
  }

  forStage(ctx: TaskContext, stage: IStageConfig): StageWorkspace {
    switch (stage.mode) {
      case StageMode.Container:
        return this.containerWorkspace(ctx, stage);
      case StageMode.Local:
        return this.hostWorkspace(ctx, stage, {
          stageDir: join(ctx.outputDir, "stages", stage.role),
          artifactDir: join(ctx.workspacePath, workspaceArtifactDir(ctx.workItem.id)),
          extraDirs: [ctx.workspacePath],
        });
    }
  }

  forHookStage(ctx: TaskContext, hookName: string, stage: IStageConfig): HostStageWorkspace {
    if (stage.mode !== StageMode.Local) {
      throw new Error(`Post-task hook ${hookName} stage ${stage.role} must run in mode "local"`);
    }
    assertSafeName(hookName, "hook name");
    if (stage.role === HOOK_ARTIFACTS_DIR) {
      throw new Error(
        `Post-task hook ${hookName} stage role "${HOOK_ARTIFACTS_DIR}" names the hook's artifact directory`,
      );
    }
    const hookDir = hookOutputDir(ctx.outputDir, hookName);
    return this.hostWorkspace(ctx, stage, {
      stageDir: join(hookDir, stage.role),
      artifactDir: join(hookDir, HOOK_ARTIFACTS_DIR),
      extraDirs: [],
    });
  }

  private containerWorkspace(ctx: TaskContext, stage: IStageConfig): ContainerStageWorkspace {
    const paths = profileBuildPaths(this.rootDir, ctx.profile.id);
    return {
      mode: StageMode.Container,
      cwd: CONTAINER_WORKSPACE_DIR,
      artifactDir: workspaceArtifactDir(ctx.workItem.id),
      agentsOutDir: agentsBuildDir(paths, stage.cli),
      skillsOutDir: paths.skillsBuildDir,
    };
  }

  private hostWorkspace(
    ctx: TaskContext,
    stage: IStageConfig,
    { stageDir, artifactDir, extraDirs }: { stageDir: string; artifactDir: string; extraDirs: readonly string[] },
  ): HostStageWorkspace {
    if (!isAbsolute(ctx.outputDir)) {
      throw new Error(`Stage ${stage.role} runs on the host, which needs the task's absolute output directory`);
    }
    assertSafeName(stage.role, "stage role");
    const cwd = join(stageDir, "work");
    const cliHomeDir = join(stageDir, "home");
    const { agentsDir, skillsDir } = this.cliRuntimes.get(stage.cli).hostRenderDirs({ cwd, cliHomeDir });
    const readableSources = [
      profileBuildPaths(this.rootDir, ctx.profile.id).agentsDir,
      ...READABLE_SHARED_DIRS.map((dir) => join(this.rootDir, "shared", dir)),
    ];
    return {
      mode: StageMode.Local,
      stageDir,
      cwd,
      artifactDir,
      agentsOutDir: agentsDir,
      skillsOutDir: skillsDir,
      cliHomeDir,
      logDir: join(stageDir, "logs"),
      orchestratorDir: this.rootDir,
      additionalDirs: [ctx.outputDir, ...extraDirs, ...readableSources],
    };
  }
}
