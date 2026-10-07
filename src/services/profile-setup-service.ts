import type { ICliRuntimeRegistry } from "../cli/cli-runtime";
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
   * Initial render for the variant's first stage — renders its agents, the variant's skills, the
   * compose overlay, and JIT MCP config before the container starts.
   */
  prepareForTask(ctx: TaskContext): Promise<void>;
  /**
   * Per-stage re-render — renders the stage's agents for its CLI and its skills with stage-specific
   * context (stageIndex, stageRole, skills, etc.) for multi-stage pipelines and post-task hooks.
   */
  prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides): Promise<void>;
}

/**
 * Orchestrates the four profile artifact writers that populate `.build/` before
 * each task and before each stage in a multi-stage pipeline.
 *
 * Agents land in `profiles/<id>/.build/<cli>/agents/` (only those the stage's root agent can
 * reach) and skills in `profiles/<id>/.build/skills/`.
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
    await this.templateRenderer.render(
      profileId,
      templateContext,
      stageRenderTarget(profileId, ctx.profile.stages[0]),
      this.logger,
    );

    this.logger.info("Rendering skill templates...");
    await this.skillRenderer.render(templateContext, this.skillsBuildDir(profileId), this.logger);

    this.logger.info("Regenerating compose overlay for matched variant...");
    await this.overlayWriter.write(ctx.profile, this.logger);

    this.jitMcpConfig.write(ctx.profile, ctx.workItem, this.logger, ctx.triggerParams, {
      sourceBranch: ctx.sourceBranch,
      taskBranch: ctx.taskBranch,
    });
  }

  /** The profile's rendered-skills directory under the orchestrator's working directory. */
  private skillsBuildDir(profileId: string): string {
    return profileBuildPaths(process.cwd(), profileId).skillsBuildDir;
  }

  async prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides): Promise<void> {
    const stageContext = buildTemplateContext(ctx, this.cliRuntimes, stageOverrides);
    const profileId = ctx.profile.id;
    await this.templateRenderer.render(
      profileId,
      stageContext,
      stageRenderTarget(profileId, stageOverrides.stage),
      this.logger,
    );
    await this.skillRenderer.render(stageContext, this.skillsBuildDir(profileId), this.logger);
  }
}
