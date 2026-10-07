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
import { StageWorkspaceResolver } from "../../src/services/stage-workspace";
import {
  createMockTemplateRenderer,
  createMockSkillRenderer,
  createMockJitMcpConfigWriter,
  createMockOverlayWriter,
  createSilentLogger,
} from "../helpers/mocks";
import {
  makeContainerWorkspace,
  makeHostWorkspace,
  makeProfile,
  makeStage,
  makeTaskContext,
} from "../helpers/factories";
import { agentsBuildDir, profileBuildPaths } from "../../src/container/setup/build-paths";
import { ClaudeAuthMode, CliType, StageMode } from "../../src/config/types";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";

const RUNTIMES = createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken);

/** Build paths of the "docs" profile under the orchestrator checkout the resolver lays out. */
const DOCS_PATHS = profileBuildPaths("/repo", "docs");

function createService() {
  const templateRenderer = createMockTemplateRenderer();
  const skillRenderer = createMockSkillRenderer();
  const overlayWriter = createMockOverlayWriter();
  const jitMcpConfig = createMockJitMcpConfigWriter();
  const service = new ProfileSetupService({
    logger: createSilentLogger(),
    cliRuntimes: RUNTIMES,
    templateRenderer,
    skillRenderer,
    overlayWriter,
    jitMcpConfig,
    stageWorkspaces: new StageWorkspaceResolver({ cliRuntimes: RUNTIMES, rootDir: "/repo" }),
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
        {
          cli: CliType.Claude,
          rootAgentFileId: "ralph.ralph",
          outDir: agentsBuildDir(DOCS_PATHS, CliType.Claude),
          prune: true,
        },
        expect.anything(),
      );
    });

    it("renders every container stage's agents before the containers start, pruning each CLI's directory once", async () => {
      // Arrange
      const { service, templateRenderer } = createService();
      const profile = makeProfile({
        id: "docs",
        stages: [
          makeStage({ agent: "ralph.ralph", role: "writer" }),
          makeStage({ agent: "ralph.malph", role: "reviewer", cli: CliType.Claude }),
          makeStage({ agent: "ralph.editor", role: "editor" }),
        ],
      });

      // Act
      await service.prepareForTask(makeTaskContext({ profile }));

      // Assert
      const renders = templateRenderer.render.mock.calls.map(([, context, target]) => ({
        agentName: context.agentName,
        stageIndex: context.stageIndex,
        cli: target.cli,
        prune: target.prune,
      }));
      expect(renders).toEqual([
        { agentName: "ralph.ralph", stageIndex: 0, cli: CliType.Copilot, prune: true },
        { agentName: "ralph.malph", stageIndex: 1, cli: CliType.Claude, prune: true },
        { agentName: "ralph.editor", stageIndex: 2, cli: CliType.Copilot, prune: false },
      ]);
    });

    it("leaves a local stage's agents to the render into its own workspace before it runs", async () => {
      // Arrange
      const { service, templateRenderer } = createService();
      const profile = makeProfile({
        id: "docs",
        stages: [
          makeStage({ agent: "ralph.ralph", role: "writer", mode: StageMode.Local }),
          makeStage({ agent: "ralph.editor", role: "editor" }),
        ],
      });

      // Act
      await service.prepareForTask(makeTaskContext({ profile }));

      // Assert
      expect(templateRenderer.render.mock.calls.map(([, , target]) => target.rootAgentFileId)).toEqual([
        "ralph.editor",
      ]);
    });

    it("renders the variant's skills into the profile's skills build directory", async () => {
      // Arrange
      const { service, skillRenderer } = createService();
      const profile = makeProfile({ id: "docs", stages: [makeStage({ skills: ["a"] }), makeStage({ skills: ["b"] })] });

      // Act
      await service.prepareForTask(makeTaskContext({ profile }));

      // Assert
      expect(skillRenderer.render).toHaveBeenCalledWith(
        expect.objectContaining({ skills: ["a", "b"], artifactDir: ".ralph/tasks/DF-100/artifacts" }),
        { outDir: DOCS_PATHS.skillsBuildDir, prune: true },
        expect.anything(),
      );
    });

    it("renders no container skills when every stage runs on the host", async () => {
      // Arrange
      const { service, skillRenderer, templateRenderer } = createService();
      const profile = makeProfile({ stages: [makeStage({ mode: StageMode.Local, skills: ["a"] })] });

      // Act
      await service.prepareForTask(makeTaskContext({ profile }));

      // Assert
      expect(skillRenderer.render).not.toHaveBeenCalled();
      expect(templateRenderer.render).not.toHaveBeenCalled();
    });

    it("writes the compose overlay for the matched variant", async () => {
      // Arrange
      const { service, overlayWriter } = createService();
      const ctx = makeTaskContext();

      // Act
      await service.prepareForTask(ctx);

      // Assert
      expect(overlayWriter.write).toHaveBeenCalledWith(ctx.profile, expect.anything());
    });

    it("writes JIT MCP config with task and trigger params", async () => {
      // Arrange
      const { service, jitMcpConfig } = createService();
      const ctx = makeTaskContext({ triggerParams: { verbose: "true" } });

      // Act
      await service.prepareForTask(ctx);

      // Assert
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

    it("renders a host stage's agents and skills into its own workspace, pruning both", async () => {
      // Arrange
      const { service, templateRenderer, skillRenderer } = createService();
      const workspace = makeHostWorkspace();
      const ctx = makeTaskContext({
        profile: makeProfile({ id: "docs", stages: [makeStage(), makeStage({ role: "notes" })] }),
      });

      // Act
      await service.prepareForStage(ctx, stageOverrides, workspace);

      // Assert
      expect(templateRenderer.render).toHaveBeenCalledWith(
        "docs",
        expect.objectContaining({ artifactDir: workspace.artifactDir }),
        { cli: CliType.Claude, rootAgentFileId: "ralph.scientist", outDir: workspace.agentsOutDir, prune: true },
        expect.anything(),
      );
      expect(skillRenderer.render).toHaveBeenCalledWith(
        expect.objectContaining({ skills: ["review"] }),
        { outDir: workspace.skillsOutDir, prune: true },
        expect.anything(),
      );
    });

    describe("with a Copilot container stage, whose agent files are mounted one by one", () => {
      const copilotStage = makeStage({ agent: "ralph.malph", role: "reviewer" });
      const profile = makeProfile({ id: "docs", stages: [makeStage({ agent: "ralph.ralph" }), copilotStage] });
      const overrides = { stage: copilotStage, stageIndex: 1, stageCount: 2, previousStageRoles: ["primary"] };

      it("keeps every rendered Copilot agent and skill in place while the containers run", async () => {
        // Arrange
        const { service, templateRenderer, skillRenderer } = createService();
        const workspace = makeContainerWorkspace({ skillsOutDir: DOCS_PATHS.skillsBuildDir });

        // Act
        await service.prepareForStage(makeTaskContext({ profile }), overrides, workspace);

        // Assert
        expect(templateRenderer.render.mock.calls[0][2]).toMatchObject({ cli: CliType.Copilot, prune: false });
        expect(skillRenderer.render.mock.calls[0][1]).toEqual({ outDir: DOCS_PATHS.skillsBuildDir, prune: false });
      });

      it("prunes for a post-task hook stage, which renders into its own workspace after teardown", async () => {
        // Arrange
        const { service, templateRenderer, skillRenderer } = createService();
        const hookStage = makeStage({ agent: "ralph.scientist", role: "scientist", mode: StageMode.Local });
        const workspace = makeHostWorkspace();

        // Act
        await service.prepareForStage(
          makeTaskContext({ profile }),
          {
            stage: hookStage,
            stageIndex: 0,
            stageCount: 1,
            previousStageRoles: [],
            hook: { collectedLogs: {}, clis: [CliType.Claude], name: "analysis", outputDir: "/out/hooks/analysis" },
          },
          workspace,
        );

        // Assert
        expect(templateRenderer.render.mock.calls[0][2]).toMatchObject({
          cli: CliType.Copilot,
          outDir: workspace.agentsOutDir,
          prune: true,
        });
        expect(skillRenderer.render.mock.calls[0][1]).toEqual({ outDir: workspace.skillsOutDir, prune: true });
      });

      it("prunes a Claude Code stage's agents, whose directory is mounted whole, but keeps the shared skills", async () => {
        // Arrange
        const { service, templateRenderer, skillRenderer } = createService();
        const claudeStage = makeStage({ agent: "ralph.editor", cli: CliType.Claude });

        // Act
        await service.prepareForStage(
          makeTaskContext({ profile }),
          { ...overrides, stage: claudeStage },
          makeContainerWorkspace(),
        );

        // Assert
        expect(templateRenderer.render.mock.calls[0][2]).toMatchObject({ cli: CliType.Claude, prune: true });
        expect(skillRenderer.render.mock.calls[0][1]).toMatchObject({ prune: false });
      });
    });

    it("propagates a rendering failure", async () => {
      // Arrange
      const { service, templateRenderer } = createService();
      templateRenderer.render.mockRejectedValue(new Error("agent ralph.scientist does not run on cli claude"));

      // Act & Assert
      await expect(service.prepareForStage(makeTaskContext(), stageOverrides, makeHostWorkspace())).rejects.toThrow(
        /does not run on cli/,
      );
    });

    it("includes stage role and index in the rendered template context", async () => {
      // Arrange
      const { service, templateRenderer } = createService();

      // Act
      await service.prepareForStage(makeTaskContext(), stageOverrides, makeHostWorkspace());

      // Assert
      const [, context] = templateRenderer.render.mock.calls[0];
      expect(context.stageRole).toBe("reviewer");
      expect(context.stageIndex).toBe(1);
      expect(context.stageCount).toBe(2);
      expect(context.previousStageRoles).toEqual(["primary"]);
    });

    it("does not regenerate compose overlay or JIT MCP config", async () => {
      // Arrange
      const { service, overlayWriter, jitMcpConfig } = createService();

      // Act
      await service.prepareForStage(makeTaskContext(), stageOverrides, makeHostWorkspace());

      // Assert
      expect(overlayWriter.write).not.toHaveBeenCalled();
      expect(jitMcpConfig.write).not.toHaveBeenCalled();
    });
  });
});
