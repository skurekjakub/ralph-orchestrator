import type { Logger } from "../logger.js";
import type { TaskContext } from "./task-context.js";
import { buildTemplateContext, type StageOverrides, type IAgentTemplateRenderer } from "../container/setup/agent-includes.js";
import type { ISkillTemplateRenderer } from "../container/setup/skill-includes.js";
import type { IJitMcpConfigWriter } from "../container/setup/jit-mcp-params.js";
import type { IComposeOverlayWriter } from "../container/setup/compose-overlay-writer.js";

/** Coordinates all profile artifact writes before and between pipeline stages. */
export interface IProfileSetupService {
  /**
   * Initial render with first-stage defaults — renders agent templates, skill
   * templates, compose overlay, and JIT MCP config before the container starts.
   */
  prepareForTask(ctx: TaskContext): Promise<void>;
  /**
   * Per-stage re-render — re-renders agent and skill templates with stage-specific
   * context (stageIndex, stageRole, skills, etc.) for multi-stage pipelines and
   * post-task hooks.
   */
  prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides): Promise<void>;
}

/**
 * Orchestrates the four profile artifact writers that populate `.build/` before
 * each task and before each stage in a multi-stage pipeline.
 *
 * Extracted from {@link TaskRunner} to keep its constructor focused on execution
 * concerns rather than file-generation concerns.
 */
export class ProfileSetupService implements IProfileSetupService {
  private readonly logger: Logger;
  private readonly templateRenderer: IAgentTemplateRenderer;
  private readonly skillRenderer: ISkillTemplateRenderer;
  private readonly overlayWriter: IComposeOverlayWriter;
  private readonly jitMcpConfig: IJitMcpConfigWriter;

  constructor({ logger, templateRenderer, skillRenderer, overlayWriter, jitMcpConfig }: {
    logger: Logger;
    templateRenderer: IAgentTemplateRenderer;
    skillRenderer: ISkillTemplateRenderer;
    overlayWriter: IComposeOverlayWriter;
    jitMcpConfig: IJitMcpConfigWriter;
  }) {
    this.logger = logger;
    this.templateRenderer = templateRenderer;
    this.skillRenderer = skillRenderer;
    this.overlayWriter = overlayWriter;
    this.jitMcpConfig = jitMcpConfig;
  }

  async prepareForTask(ctx: TaskContext): Promise<void> {
    const templateContext = buildTemplateContext(ctx);

    this.logger.info("Rendering agent templates...");
    await this.templateRenderer.render(ctx.profile.id, templateContext, this.logger);

    this.logger.info("Rendering skill templates...");
    await this.skillRenderer.render(templateContext, this.logger);

    this.logger.info("Regenerating compose overlay for matched variant...");
    this.overlayWriter.write(ctx.profile, this.logger);

    this.jitMcpConfig.write(ctx.profile, ctx.workItem, this.logger, ctx.triggerParams, {
      sourceBranch: ctx.sourceBranch,
      taskBranch: ctx.taskBranch,
    });
  }

  async prepareForStage(ctx: TaskContext, stageOverrides: StageOverrides): Promise<void> {
    const stageContext = buildTemplateContext(ctx, stageOverrides);
    await this.templateRenderer.render(ctx.profile.id, stageContext, this.logger);
    await this.skillRenderer.render(stageContext, this.logger);
  }
}
