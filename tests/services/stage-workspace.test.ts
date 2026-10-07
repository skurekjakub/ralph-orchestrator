import { describe, expect, it } from "vitest";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType, StageMode } from "../../src/config/types";
import { hookOutputDir, StageWorkspaceResolver } from "../../src/services/stage-workspace";
import { makeProfile, makeStage, makeTaskContext } from "../helpers/factories";

const OUTPUT_DIR = "/srv/ralph/output/logs/DF-100-1234567890000";

function createResolver(): StageWorkspaceResolver {
  return new StageWorkspaceResolver({
    cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
    rootDir: "/srv/ralph",
  });
}

function taskContext() {
  return makeTaskContext({
    profile: makeProfile({ id: "docs" }),
    outputDir: OUTPUT_DIR,
    workspacePath: "/srv/ralph/cache/workspaces/DF-100-1234567890000",
  });
}

describe("hookOutputDir", () => {
  it("is the hook's directory under the task's output dir", () => {
    // Act & Assert
    expect(hookOutputDir("/out", "run-analysis")).toBe("/out/hooks/run-analysis");
  });
});

describe("StageWorkspaceResolver", () => {
  describe("forStage", () => {
    it("puts a container stage in /workspace, rendering into the profile's build directory for its CLI", () => {
      // Act
      const workspace = createResolver().forStage(taskContext(), makeStage({ cli: CliType.Claude }));

      // Assert
      expect(workspace).toEqual({
        mode: StageMode.Container,
        cwd: "/workspace",
        artifactDir: ".ralph/tasks/DF-100/artifacts",
        agentsOutDir: "/srv/ralph/profiles/docs/.build/claude/agents",
        skillsOutDir: "/srv/ralph/profiles/docs/.build/skills",
      });
    });

    it("gives a variant's local stage its own host workspace, sharing the container stages' artifacts", () => {
      // Act
      const workspace = createResolver().forStage(
        taskContext(),
        makeStage({ role: "reviewer", mode: StageMode.Local, cli: CliType.Claude }),
      );

      // Assert
      const stageDir = `${OUTPUT_DIR}/stages/reviewer`;
      expect(workspace).toEqual({
        mode: StageMode.Local,
        stageDir,
        cwd: `${stageDir}/work`,
        artifactDir: "/srv/ralph/cache/workspaces/DF-100-1234567890000/.ralph/tasks/DF-100/artifacts",
        agentsOutDir: `${stageDir}/home/agents`,
        skillsOutDir: `${stageDir}/home/skills`,
        cliHomeDir: `${stageDir}/home`,
        logDir: `${stageDir}/logs`,
        orchestratorDir: "/srv/ralph",
        additionalDirs: [
          OUTPUT_DIR,
          "/srv/ralph/cache/workspaces/DF-100-1234567890000",
          "/srv/ralph/profiles/docs/agents",
          "/srv/ralph/shared/agent-includes",
          "/srv/ralph/shared/skills",
          "/srv/ralph/shared/mcp-servers",
        ],
      });
    });

    it("rejects a local stage role that would leave its workspace directory", () => {
      // Act & Assert
      expect(() =>
        createResolver().forStage(taskContext(), makeStage({ role: "../../etc", mode: StageMode.Local })),
      ).toThrow('Unsafe stage role for filesystem use: "../../etc"');
    });

    it("rejects a local stage of a task without an absolute output directory", () => {
      // Act & Assert
      expect(() =>
        createResolver().forStage(makeTaskContext({ outputDir: "" }), makeStage({ mode: StageMode.Local })),
      ).toThrow("needs the task's absolute output directory");
    });
  });

  describe("forHookStage", () => {
    it("gives a Claude Code hook stage a private home holding its agents and skills, and logs of its own", () => {
      // Act
      const workspace = createResolver().forHookStage(
        taskContext(),
        "run-analysis",
        makeStage({ role: "scientist", mode: StageMode.Local, cli: CliType.Claude }),
      );

      // Assert
      const stageDir = `${OUTPUT_DIR}/hooks/run-analysis/scientist`;
      expect(workspace).toEqual({
        mode: StageMode.Local,
        stageDir,
        cwd: `${stageDir}/work`,
        artifactDir: `${OUTPUT_DIR}/hooks/run-analysis/artifacts`,
        agentsOutDir: `${stageDir}/home/agents`,
        skillsOutDir: `${stageDir}/home/skills`,
        cliHomeDir: `${stageDir}/home`,
        logDir: `${stageDir}/logs`,
        orchestratorDir: "/srv/ralph",
        additionalDirs: [
          OUTPUT_DIR,
          "/srv/ralph/profiles/docs/agents",
          "/srv/ralph/shared/agent-includes",
          "/srv/ralph/shared/skills",
          "/srv/ralph/shared/mcp-servers",
        ],
      });
    });

    it("gives a hook stage no readable directory holding the profile's gateway.json or the checkout's .env", () => {
      // Arrange
      const secrets = ["/srv/ralph/profiles/docs/.build/gateway.json", "/srv/ralph/.env"];

      // Act
      const { cwd, additionalDirs } = createResolver().forHookStage(
        taskContext(),
        "run-analysis",
        makeStage({ role: "scientist", mode: StageMode.Local }),
      );

      // Assert
      const exposing = [cwd, ...additionalDirs].filter((dir) => secrets.some((path) => path.startsWith(`${dir}/`)));
      expect(exposing).toEqual([]);
    });

    it("renders a Copilot hook stage's agents and skills into its working directory's .github/", () => {
      // Act
      const workspace = createResolver().forHookStage(
        taskContext(),
        "run-analysis",
        makeStage({ role: "scientist", mode: StageMode.Local, cli: CliType.Copilot }),
      );

      // Assert
      expect(workspace.agentsOutDir).toBe(`${OUTPUT_DIR}/hooks/run-analysis/scientist/work/.github/agents`);
      expect(workspace.skillsOutDir).toBe(`${OUTPUT_DIR}/hooks/run-analysis/scientist/work/.github/skills`);
    });

    it("shares one artifact directory between a hook's stages and keeps their homes apart", () => {
      // Arrange
      const resolver = createResolver();

      // Act
      const analyzer = resolver.forHookStage(
        taskContext(),
        "run-analysis",
        makeStage({ role: "analyzer", mode: StageMode.Local }),
      );
      const improver = resolver.forHookStage(
        taskContext(),
        "run-analysis",
        makeStage({ role: "improver", mode: StageMode.Local }),
      );

      // Assert
      expect(analyzer.artifactDir).toBe(improver.artifactDir);
      expect(analyzer.cliHomeDir).not.toBe(improver.cliHomeDir);
      expect(analyzer.cwd).not.toBe(improver.cwd);
    });

    it("rejects a hook stage whose role names the hook's shared artifact directory", () => {
      // Act & Assert
      expect(() =>
        createResolver().forHookStage(
          taskContext(),
          "run-analysis",
          makeStage({ role: "artifacts", mode: StageMode.Local }),
        ),
      ).toThrow('stage role "artifacts" names the hook\'s artifact directory');
    });

    it("rejects a hook stage that would run in the container", () => {
      // Act & Assert
      expect(() => createResolver().forHookStage(taskContext(), "run-analysis", makeStage())).toThrow(
        'must run in mode "local"',
      );
    });
  });
});
