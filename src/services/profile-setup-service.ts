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
import { profileBuildPaths } from "../container/setup/build-paths";
import type { IJitMcpConfigWriter } from "../container/setup/jit-mcp-params";
import type { IComposeOverlayWriter } from "../container/setup/compose-overlay-writer";

/** Coordinates all profile artifact writes before and between pipeline stages. */
export interface IProfileSetupService {
  /**
   * Renders before the containers start: the agents of the first stage and of every container stage,
   * each CLI's build directory first cleared of what an earlier task left, so every agent file the
   * overlay mounts exists; the variant's skills; the compose overlay; and the JIT MCP config.
   *
   * @throws Error when rendering or writing an artifact fails.
   */
  prepareForTask(ctx: TaskContext): Promise<void>;
  /**
   * Per-stage re-render — renders the stage's agents for its CLI and its skills with stage-specific
   * context (stageIndex, stageRole, skills, etc.) for multi-stage pipelines and post-task hooks.
   *
   * While the variant's containers run (any stage without `stageOverrides.hook`), a render keeps in
   * place every agent file and skill directory a container CLI mounts one by one; otherwise it removes
   * the agents the stage cannot reach and the skills it does not use. Post-task hooks run after teardown.
   *
   * @throws Error when rendering fails.
   */
  prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides): Promise<void>;
}

/**
 * Orchestrates the four profile artifact writers that populate `.build/` before
 * each task and before each stage in a multi-stage pipeline.
 *
 * Agents land in `profiles/<id>/.build/<cli>/agents/` and skills in `profiles/<id>/.build/skills/`.
 */
export class ProfileSetupService implements IProfileSetupService {
  private readonly logger: Logger;
  private readonly cliRuntimes: ICliRuntimeRegistry;
  private readonly templateRenderer: IAgentTemplateRenderer;
  private readonly skillRenderer: ISkillTemplateRenderer;
  private readonly overlayWriter: IComposeOverlayWriter;
  private readonly jitMcpConfig: IJitMcpConfigWriter;

  constructor({
    logger,
    cliRuntimes,
    templateRenderer,
    skillRenderer,
    overlayWriter,
    jitMcpConfig,
  }: {
    logger: Logger;
    cliRuntimes: ICliRuntimeRegistry;
    templateRenderer: IAgentTemplateRenderer;
    skillRenderer: ISkillTemplateRenderer;
    overlayWriter: IComposeOverlayWriter;
    jitMcpConfig: IJitMcpConfigWriter;
  }) {
    this.logger = logger;
    this.cliRuntimes = cliRuntimes;
    this.templateRenderer = templateRenderer;
    this.skillRenderer = skillRenderer;
    this.overlayWriter = overlayWriter;
    this.jitMcpConfig = jitMcpConfig;
  }

  async prepareForTask(ctx: TaskContext): Promise<void> {
    const templateContext = buildTemplateContext(ctx, this.cliRuntimes);
    const profileId = ctx.profile.id;

    this.logger.info("Rendering agent templates...");
    await this.renderTaskAgents(ctx);

    this.logger.info("Rendering skill templates...");
    await this.skillRenderer.render(
      templateContext,
      { outDir: this.skillsBuildDir(profileId), prune: true },
      this.logger,
    );

    this.logger.info("Regenerating compose overlay for matched variant...");
    await this.overlayWriter.write(ctx.profile, this.logger);

    this.jitMcpConfig.write(ctx.profile, ctx.workItem, this.logger, ctx.triggerParams, {
      sourceBranch: ctx.sourceBranch,
      taskBranch: ctx.taskBranch,
    });
  }

  /**
   * Renders the first stage's agents and those of every later container stage, each with its own stage
   * context. The first render into a CLI's build directory prunes it; later ones add to it.
   */
  private async renderTaskAgents(ctx: TaskContext): Promise<void> {
    const { profile } = ctx;
    const stageCount = profile.stages.length;
    const rendered = new Set<CliType>();
    for (const [stageIndex, stage] of profile.stages.entries()) {
      if (stageIndex > 0 && stage.mode !== StageMode.Container) continue;
      const context =
        stageIndex === 0
          ? buildTemplateContext(ctx, this.cliRuntimes)
          : buildTemplateContext(ctx, this.cliRuntimes, {
              stage,
              stageIndex,
              stageCount,
              previousStageRoles: profile.stages.slice(0, stageIndex).map((s) => s.role),
            });
      const target = stageRenderTarget(profile.id, stage, { prune: !rendered.has(stage.cli) });
      rendered.add(stage.cli);
      await this.templateRenderer.render(profile.id, context, target, this.logger);
    }
  }

  /** The profile's rendered-skills directory under the orchestrator's working directory. */
  private skillsBuildDir(profileId: string): string {
    return profileBuildPaths(process.cwd(), profileId).skillsBuildDir;
  }

  async prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides): Promise<void> {
    const stageContext = buildTemplateContext(ctx, this.cliRuntimes, stageOverrides);
    const { stage } = stageOverrides;
    const { profile } = ctx;
    const containersRun = stageOverrides.hook === undefined;
    const keepAgents = containersRun && this.mountsEachItemOf(profile, stage.cli);
    const keepSkills = containersRun && profile.containerClis.some((cli) => this.mountsEachItemOf(profile, cli));
    await this.templateRenderer.render(
      profile.id,
      stageContext,
      stageRenderTarget(profile.id, stage, { prune: !keepAgents }),
      this.logger,
    );
    await this.skillRenderer.render(
      stageContext,
      { outDir: this.skillsBuildDir(profile.id), prune: !keepSkills },
      this.logger,
    );
  }

  /** Whether the variant's container mounts the rendered agent files and skill directories of `cli` one by one. */
  private mountsEachItemOf(profile: IAgentProfile, cli: CliType): boolean {
    return profile.containerClis.includes(cli) && this.cliRuntimes.get(cli).mountsEachRenderedItem;
  }
}
