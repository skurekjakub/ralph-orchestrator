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
import { ProfileSetupService } from "../../src/services/profile-setup-service";
import {
  createMockTemplateRenderer,
  createMockSkillRenderer,
  createMockJitMcpConfigWriter,
  createMockOverlayWriter,
  createSilentLogger,
} from "../helpers/mocks";
import { makeProfile, makeStage, makeTaskContext } from "../helpers/factories";
import { agentsBuildDir, profileBuildPaths } from "../../src/container/setup/build-paths";
import { ClaudeAuthMode, CliType, StageMode } from "../../src/config/types";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";

/** Build paths of the "docs" profile under the working directory, where the service renders. */
const DOCS_PATHS = profileBuildPaths(process.cwd(), "docs");

function createService() {
  const templateRenderer = createMockTemplateRenderer();
  const skillRenderer = createMockSkillRenderer();
  const overlayWriter = createMockOverlayWriter();
  const jitMcpConfig = createMockJitMcpConfigWriter();
  const service = new ProfileSetupService({
    logger: createSilentLogger(),
    cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
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
    it("renders the first stage's agents for its CLI into the profile's build directory for that CLI", async () => {
      // Arrange
      const { service, templateRenderer } = createService();
      const profile = makeProfile({
        id: "docs",
        stages: [makeStage({ agent: "ralph.ralph", cli: CliType.Claude }), makeStage({ agent: "ralph.second" })],
      });
      const ctx = makeTaskContext({ profile });

      // Act
      await service.prepareForTask(ctx);

      // Assert
      expect(templateRenderer.render).toHaveBeenCalledWith(
        "docs",
        expect.objectContaining({ taskId: ctx.workItem.id, profileId: "docs", agentName: "ralph.ralph" }),
        { cli: CliType.Claude, rootAgentFileId: "ralph.ralph", outDir: agentsBuildDir(DOCS_PATHS, CliType.Claude) },
        expect.anything(),
      );
    });

    it("renders the variant's skills into the profile's skills build directory", async () => {
      // Arrange
      const { service, skillRenderer } = createService();
      const profile = makeProfile({ id: "docs", stages: [makeStage({ skills: ["a"] }), makeStage({ skills: ["b"] })] });

      // Act
      await service.prepareForTask(makeTaskContext({ profile }));

      // Assert
      expect(skillRenderer.render).toHaveBeenCalledWith(
        expect.objectContaining({ skills: ["a", "b"] }),
        DOCS_PATHS.skillsBuildDir,
        expect.anything(),
      );
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

      expect(jitMcpConfig.write).toHaveBeenCalledWith(ctx.profile, ctx.workItem, expect.anything(), ctx.triggerParams, {
        sourceBranch: ctx.sourceBranch,
        taskBranch: ctx.taskBranch,
      });
    });
  });

  describe("prepareForStage", () => {
    const stage = makeStage({
      agent: "ralph.scientist",
      role: "reviewer",
      mode: StageMode.Local,
      cli: CliType.Claude,
      skills: ["review"],
    });
    const stageOverrides = {
      stage,
      stageIndex: 1,
      stageCount: 2,
      previousStageRoles: ["primary"] as string[],
    };

    it("renders the stage's agents for its CLI and its own skills", async () => {
      // Arrange
      const { service, templateRenderer, skillRenderer } = createService();
      const ctx = makeTaskContext({ profile: makeProfile({ id: "docs" }) });

      // Act
      await service.prepareForStage(ctx, stageOverrides);

      // Assert
      expect(templateRenderer.render).toHaveBeenCalledWith(
        "docs",
        expect.anything(),
        { cli: CliType.Claude, rootAgentFileId: "ralph.scientist", outDir: agentsBuildDir(DOCS_PATHS, CliType.Claude) },
        expect.anything(),
      );
      expect(skillRenderer.render).toHaveBeenCalledWith(
        expect.objectContaining({ skills: ["review"] }),
        DOCS_PATHS.skillsBuildDir,
        expect.anything(),
      );
    });

    it("propagates a rendering failure", async () => {
      // Arrange
      const { service, templateRenderer } = createService();
      templateRenderer.render.mockRejectedValue(new Error("agent ralph.scientist does not run on cli claude"));

      // Act & Assert
      await expect(service.prepareForStage(makeTaskContext(), stageOverrides)).rejects.toThrow(/does not run on cli/);
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
