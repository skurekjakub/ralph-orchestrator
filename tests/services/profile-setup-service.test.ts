/**
 * ProfileSetupService unit tests.
 *
 * Verifies that the correct artifact writers are invoked for each preparation
 * phase (task-level vs stage-level) and that the template context is derived
 * correctly from the task context.
 *
 * Writers are mocked at the architectural boundary — they perform file I/O.
 * Assertions focus on *which* writers were called and with what profile/context,
 * not on their internal behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProfileSetupService } from "../../src/services/profile-setup-service.js";
import {
  createMockTemplateRenderer,
  createMockSkillRenderer,
  createMockJitMcpConfigWriter,
  createMockOverlayWriter,
  createSilentLogger,
} from "../helpers/mocks.js";
import { makeTaskContext } from "../helpers/factories.js";

function createService() {
  const templateRenderer = createMockTemplateRenderer();
  const skillRenderer = createMockSkillRenderer();
  const overlayWriter = createMockOverlayWriter();
  const jitMcpConfig = createMockJitMcpConfigWriter();
  const service = new ProfileSetupService({
    logger: createSilentLogger(),
    templateRenderer,
    skillRenderer,
    overlayWriter,
    jitMcpConfig,
  });
  return { service, templateRenderer, skillRenderer, overlayWriter, jitMcpConfig };
}

describe("ProfileSetupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("prepareForTask", () => {
    it("renders agent templates with the task's profile ID and context", async () => {
      const { service, templateRenderer } = createService();
      const ctx = makeTaskContext();

      await service.prepareForTask(ctx);

      expect(templateRenderer.render).toHaveBeenCalledWith(
        ctx.profile.id,
        expect.objectContaining({ taskId: ctx.workItem.id, profileId: ctx.profile.id }),
        expect.anything(),
      );
    });

    it("renders skill templates", async () => {
      const { service, skillRenderer } = createService();
      const ctx = makeTaskContext();

      await service.prepareForTask(ctx);

      expect(skillRenderer.render).toHaveBeenCalledOnce();
    });

    it("writes the compose overlay for the matched variant", async () => {
      const { service, overlayWriter } = createService();
      const ctx = makeTaskContext();

      await service.prepareForTask(ctx);

      expect(overlayWriter.write).toHaveBeenCalledWith(ctx.profile, expect.anything());
    });

    it("writes JIT MCP config with task and trigger params", async () => {
      const { service, jitMcpConfig } = createService();
      const ctx = makeTaskContext({ triggerParams: { verbose: "true" } });

      await service.prepareForTask(ctx);

      expect(jitMcpConfig.write).toHaveBeenCalledWith(
        ctx.profile,
        ctx.workItem,
        expect.anything(),
        ctx.triggerParams,
      );
    });
  });

  describe("prepareForStage", () => {
    const stageOverrides = {
      stageIndex: 1,
      stageCount: 2,
      stageRole: "reviewer",
      stageMode: "container",
      previousStageRoles: ["primary"] as string[],
    };

    it("re-renders agent and skill templates with stage-specific context", async () => {
      const { service, templateRenderer, skillRenderer } = createService();
      const ctx = makeTaskContext();

      await service.prepareForStage(ctx, stageOverrides);

      expect(templateRenderer.render).toHaveBeenCalledOnce();
      expect(skillRenderer.render).toHaveBeenCalledOnce();
    });

    it("includes stage role and index in the rendered template context", async () => {
      const { service, templateRenderer } = createService();
      const ctx = makeTaskContext();

      await service.prepareForStage(ctx, stageOverrides);

      const [, context] = templateRenderer.render.mock.calls[0];
      expect(context.stageRole).toBe("reviewer");
      expect(context.stageIndex).toBe(1);
      expect(context.stageCount).toBe(2);
      expect(context.previousStageRoles).toEqual(["primary"]);
    });

    it("does not regenerate compose overlay or JIT MCP config", async () => {
      const { service, overlayWriter, jitMcpConfig } = createService();
      const ctx = makeTaskContext();

      await service.prepareForStage(ctx, stageOverrides);

      expect(overlayWriter.write).not.toHaveBeenCalled();
      expect(jitMcpConfig.write).not.toHaveBeenCalled();
    });
  });
});
