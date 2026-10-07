import type { AwilixContainer } from "awilix";
import type {
  ClaudeHostStageCradle,
  ClaudeHostStageValues,
  ClaudeStageCradle,
  ClaudeStageValues,
  CopilotHostStageCradle,
  CopilotStageCradle,
  HostStageValues,
  OrchestratorCradle,
  StageValues,
  TaskCradle,
} from "../awilix-cradle-types";
import { hostCliBinary } from "../cli/cli-versions";
import { CliType, type IAgentProfile, type IStageConfig } from "../config/types";
import { asValues } from "../di/registration";
import type { ICliExecutor, IStageExecutorFactory } from "./cli-executor-factory";
import { loadAgentCatalog } from "./setup/agent-catalogs";
import { profileBuildPaths } from "./setup/build-paths";
import type { HostStageWorkspace } from "./types";

/** A Claude Code container stage's scope of its task's scope, holding the stage's values. */
function openClaudeStageScope(
  taskScope: AwilixContainer<TaskCradle>,
  values: ClaudeStageValues,
): AwilixContainer<ClaudeStageCradle> {
  return taskScope.createScope<ClaudeStageCradle>().register(asValues(values));
}

/** A Copilot container stage's scope of its task's scope, holding the stage's values. */
function openCopilotStageScope(
  taskScope: AwilixContainer<TaskCradle>,
  values: StageValues,
): AwilixContainer<CopilotStageCradle> {
  return taskScope.createScope<CopilotStageCradle>().register(asValues(values));
}

/** A host Claude Code stage's scope of `parent`, holding the stage's values. */
function openClaudeHostStageScope(
  parent: AwilixContainer<OrchestratorCradle>,
  values: ClaudeHostStageValues,
): AwilixContainer<ClaudeHostStageCradle> {
  return parent.createScope<ClaudeHostStageCradle>().register(asValues(values));
}

/** A host Copilot stage's scope of `parent`, holding the stage's values. */
function openCopilotHostStageScope(
  parent: AwilixContainer<OrchestratorCradle>,
  values: HostStageValues,
): AwilixContainer<CopilotHostStageCradle> {
  return parent.createScope<CopilotHostStageCradle>().register(asValues(values));
}

/**
 * The stage executor factory of one task: each stage's executor resolves in a stage scope of `taskScope`, with the
 * stage's values. Claude Code takes the stage root's frontmatter name and the depth of its subagent graph from the
 * agent catalog; a Copilot container stage loads no catalog.
 *
 * @param taskScope The task's scope, whose `compose` the container stages exec through.
 */
export function createStageExecutorFactory(taskScope: AwilixContainer<TaskCradle>): IStageExecutorFactory {
  return {
    create: async (stageProfile, stage) => {
      const { cliRuntimes, rootDir } = taskScope.cradle;
      const runtime = cliRuntimes.get(stage.cli);
      switch (stage.cli) {
        case CliType.Claude: {
          const catalog = await loadAgentCatalog(rootDir, stageProfile.id);
          return openClaudeStageScope(taskScope, {
            stage,
            stageProfile,
            runtime,
            agentName: catalog.get(stage.agent).frontmatter.name,
            subagentDepth: catalog.depthFrom(stage.agent),
          }).resolve("claudeCodeExecutor");
        }
        case CliType.Copilot:
          return openCopilotStageScope(taskScope, { stage, stageProfile, runtime }).resolve("copilotExecutor");
      }
    },
    createHost: (stageProfile, stage, workspace) => createHostStageExecutor(taskScope, stageProfile, stage, workspace),
  };
}

/**
 * The executor of a `mode: "local"` stage, resolved in a host stage scope of `parent`. It runs the pinned CLI the
 * orchestrator installed (`node_modules/.bin/<cli>`) on the host in `workspace`. Claude Code also takes the
 * frontmatter names of the agents the stage root can reach, which its permission rules let it spawn, and runs the
 * audit hooks of the orchestrator's `shared/hooks`.
 *
 * @param parent The root container for a post-task hook stage, which runs after its task's scope is gone; the task's
 *   scope for a stage of the variant's pipeline.
 * @param stageProfile The variant with the stage's overrides applied (`deriveStageProfile`).
 * @throws Error when the stage runs Claude Code and the profile's agent templates are invalid or lack the stage's
 *   agent.
 */
export async function createHostStageExecutor(
  parent: AwilixContainer<OrchestratorCradle>,
  stageProfile: IAgentProfile,
  stage: IStageConfig,
  workspace: HostStageWorkspace,
): Promise<ICliExecutor> {
  const { cliRuntimes, rootDir } = parent.cradle;
  const runtime = cliRuntimes.get(stage.cli);
  const binary = hostCliBinary(rootDir, stage.cli);
  switch (stage.cli) {
    case CliType.Copilot:
      return openCopilotHostStageScope(parent, { stage, stageProfile, runtime, workspace, binary }).resolve(
        "localCopilotExecutor",
      );
    case CliType.Claude: {
      const catalog = await loadAgentCatalog(rootDir, stageProfile.id);
      const nameOf = (fileId: string): string => catalog.get(fileId).frontmatter.name;
      return openClaudeHostStageScope(parent, {
        stage,
        stageProfile,
        runtime,
        workspace,
        binary,
        hooksDir: profileBuildPaths(rootDir, stageProfile.id).hooksDir,
        agentName: nameOf(stage.agent),
        subagentDepth: catalog.depthFrom(stage.agent),
        subagents: catalog.reachableFrom(stage.agent).slice(1).map(nameOf),
      }).resolve("localClaudeCodeExecutor");
    }
  }
}
