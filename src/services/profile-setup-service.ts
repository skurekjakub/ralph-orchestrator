import type { ICliRuntimeRegistry } from "../cli/cli-runtime";
import { type CliType, type IAgentProfile, StageMode } from "../config/types";
import type { Logger } from "../logger";
import type { TaskContext } from "./task-context";
import {
  buildTemplateContext,
  stageRenderTarget,
  type StageOverrides,
  type IAgentTemplateRenderer,
} from "../container/setup/agent-includes";
import type { ISkillTemplateRenderer } from "../container/setup/skill-includes";
import type { IJitMcpConfigWriter } from "../container/setup/jit-mcp-params";
import type { IComposeOverlayWriter } from "../container/setup/compose-overlay-writer";
import type { StageWorkspace } from "../container/types";
import type { IStageWorkspaceResolver } from "./stage-workspace";

/** Coordinates all profile artifact writes before and between pipeline stages. */
export interface IProfileSetupService {
  /**
   * Renders before the containers start: the agents of every container stage, each CLI's build directory first
   * cleared of what an earlier task left, so every agent file the overlay mounts exists; the variant's skills;
   * the compose overlay; and the JIT MCP config. A `mode: "local"` stage renders into its own workspace right
   * before it runs.
   *
   * @throws Error when rendering or writing an artifact fails.
   */
  prepareForTask(ctx: TaskContext): Promise<void>;
  /**
   * Per-stage re-render — renders the stage's agents for its CLI and its skills with stage-specific context
   * (stageIndex, stageRole, skills, artifactDir, etc.) into `workspace`, for multi-stage pipelines, local stages
   * and post-task hooks.
   *
   * A container stage's render keeps in place every agent file and skill directory a container CLI mounts one by
   * one; otherwise, and always in a host stage's own workspace, it removes the agents the stage cannot reach and
   * the skills it does not use.
   *
   * @throws Error when rendering fails.
   */
  prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides, workspace: StageWorkspace): Promise<void>;
}

/**
 * Orchestrates the four profile artifact writers that populate `.build/` before each task, and renders each
 * stage's agents and skills into its workspace before each stage of a multi-stage pipeline, each local stage and
 * each post-task hook stage.
 *
 * Container stages render agents into `profiles/<id>/.build/<cli>/agents/` and skills into
 * `profiles/<id>/.build/skills/`; host stages into the directories their CLI discovers in their workspace.
 */
export class ProfileSetupService implements IProfileSetupService {
  private readonly logger: Logger;
  private readonly cliRuntimes: ICliRuntimeRegistry;
  private readonly templateRenderer: IAgentTemplateRenderer;
  private readonly skillRenderer: ISkillTemplateRenderer;
  private readonly overlayWriter: IComposeOverlayWriter;
  private readonly jitMcpConfig: IJitMcpConfigWriter;
  private readonly stageWorkspaces: IStageWorkspaceResolver;

  constructor({
    logger,
    cliRuntimes,
    templateRenderer,
    skillRenderer,
    overlayWriter,
    jitMcpConfig,
    stageWorkspaces,
  }: {
    logger: Logger;
    cliRuntimes: ICliRuntimeRegistry;
    templateRenderer: IAgentTemplateRenderer;
    skillRenderer: ISkillTemplateRenderer;
    overlayWriter: IComposeOverlayWriter;
    jitMcpConfig: IJitMcpConfigWriter;
    stageWorkspaces: IStageWorkspaceResolver;
  }) {
    this.logger = logger;
    this.cliRuntimes = cliRuntimes;
    this.templateRenderer = templateRenderer;
    this.skillRenderer = skillRenderer;
    this.overlayWriter = overlayWriter;
    this.jitMcpConfig = jitMcpConfig;
    this.stageWorkspaces = stageWorkspaces;
  }

  async prepareForTask(ctx: TaskContext): Promise<void> {
    this.logger.info("Rendering agent templates...");
    await this.renderTaskAgents(ctx);

    const containerStage = ctx.profile.stages.find((stage) => stage.mode === StageMode.Container);
    if (containerStage) {
      this.logger.info("Rendering skill templates...");
      const workspace = this.stageWorkspaces.forStage(ctx, containerStage);
      await this.skillRenderer.render(
        buildTemplateContext(ctx, this.cliRuntimes, workspace),
        { outDir: workspace.skillsOutDir, prune: true },
        this.logger,
      );
    }

    this.logger.info("Regenerating compose overlay for matched variant...");
    await this.overlayWriter.write(ctx.profile, this.logger);

    this.jitMcpConfig.write(ctx.profile, ctx.workItem, this.logger, ctx.triggerParams, {
      sourceBranch: ctx.sourceBranch,
      taskBranch: ctx.taskBranch,
    });
  }

  /**
   * Renders the agents of every container stage, the first one with the variant's first-stage context and later
   * ones with their own stage context. The first render into a CLI's build directory prunes it; later ones add to
   * it.
   */
  private async renderTaskAgents(ctx: TaskContext): Promise<void> {
    const { profile } = ctx;
    const stageCount = profile.stages.length;
    const rendered = new Set<CliType>();
    for (const [stageIndex, stage] of profile.stages.entries()) {
      if (stage.mode !== StageMode.Container) continue;
      const workspace = this.stageWorkspaces.forStage(ctx, stage);
      const context =
        stageIndex === 0
          ? buildTemplateContext(ctx, this.cliRuntimes, workspace)
          : buildTemplateContext(ctx, this.cliRuntimes, workspace, {
              stage,
              stageIndex,
              stageCount,
              previousStageRoles: profile.stages.slice(0, stageIndex).map((s) => s.role),
            });
      const target = stageRenderTarget(stage, workspace, { prune: !rendered.has(stage.cli) });
      rendered.add(stage.cli);
      await this.templateRenderer.render(profile.id, context, target, this.logger);
    }
  }

  async prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides, workspace: StageWorkspace): Promise<void> {
    const stageContext = buildTemplateContext(ctx, this.cliRuntimes, workspace, stageOverrides);
    const { stage } = stageOverrides;
    const { profile } = ctx;
    const inContainer = workspace.mode === StageMode.Container;
    const keepAgents = inContainer && this.mountsEachItemOf(profile, stage.cli);
    const keepSkills = inContainer && profile.containerClis.some((cli) => this.mountsEachItemOf(profile, cli));
    await this.templateRenderer.render(
      profile.id,
      stageContext,
      stageRenderTarget(stage, workspace, { prune: !keepAgents }),
      this.logger,
    );
    await this.skillRenderer.render(stageContext, { outDir: workspace.skillsOutDir, prune: !keepSkills }, this.logger);
  }

  /** Whether the variant's container mounts the rendered agent files and skill directories of `cli` one by one. */
  private mountsEachItemOf(profile: IAgentProfile, cli: CliType): boolean {
    return profile.containerClis.includes(cli) && this.cliRuntimes.get(cli).mountsEachRenderedItem;
  }
}
