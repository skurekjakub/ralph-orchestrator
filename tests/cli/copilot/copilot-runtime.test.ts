import { describe, it, expect } from "vitest";
import { AgentCatalog } from "../../../src/cli/agent-catalog";
import { CopilotRuntime } from "../../../src/cli/copilot/copilot-runtime";
import { PlainTextDecoder } from "../../../src/cli/plain-text-decoder";
import { CliType, StageMode } from "../../../src/config/types";
import { CaptureMode } from "../../../src/container/log-collector";
import { profileBuildPaths } from "../../../src/container/setup/build-paths";
import { makeAgentSource, makeProfile, makeStage } from "../../helpers/factories";

const PATHS = profileBuildPaths("/repo", "docs");

/** `ralph.ralph` spawns `writer`; `ralph.malph` spawns `scout`. */
const AGENTS = new AgentCatalog([
  makeAgentSource("ralph.ralph", { name: "ralph", subagents: ["writer"] }),
  makeAgentSource("ralph.writer", { name: "writer" }),
  makeAgentSource("ralph.malph", { name: "malph", subagents: ["scout"] }),
  makeAgentSource("ralph.scout", { name: "scout" }),
]);

const runtime = new CopilotRuntime();

describe("CopilotRuntime", () => {
  it("describes the Copilot CLI", () => {
    // Act & Assert
    expect(new CopilotRuntime().cli).toBe(CliType.Copilot);
  });

  it("validates models as Copilot model ids", () => {
    // Act & Assert
    expect(runtime.models.validate("claude-opus-4.6")).toBeNull();
    expect(runtime.models.validate("opus")).not.toBeNull();
  });

  it("authenticates with GH_TOKEN", () => {
    // Act
    const envVars = runtime.credentials.required.map((c) => c.envVar);

    // Assert
    expect(envVars).toEqual(["GH_TOKEN"]);
  });

  it("keeps its writable directories and debug log under its config directory", () => {
    // Arrange
    const { layout } = runtime;

    // Act
    const paths = [...layout.writableDirs, layout.debugLog.path, layout.transcriptPath ?? ""];

    // Assert
    expect(paths.every((p) => p.startsWith(`${layout.configDir}/`))).toBe(true);
  });

  describe("composeContribution", () => {
    it("mounts the config, the hook config, each agent its container stages reach and their skills", () => {
      // Arrange
      const profile = makeProfile({
        stages: [
          makeStage({ role: "a", agent: "ralph.ralph", cli: CliType.Copilot, skills: ["code-review"] }),
          makeStage({ role: "b", agent: "ralph.malph", cli: CliType.Claude, skills: ["claude-only"] }),
          makeStage({ role: "c", agent: "ralph.malph", cli: CliType.Copilot, mode: StageMode.Local, skills: ["host"] }),
        ],
      });

      // Act
      const { volumes, env } = runtime.composeContribution({ profile, paths: PATHS, agents: AGENTS });

      // Assert
      expect(volumes).toEqual([
        `${PATHS.buildDir}/copilot-config.json:/workspace/.ralph/config.json:ro`,
        "/repo/shared/hooks/ralph-audit.json:/workspace/.github/hooks/ralph-audit.json:ro",
        `${PATHS.buildDir}/copilot/agents/ralph.ralph.agent.md:/workspace/.github/agents/ralph.ralph.agent.md:ro`,
        `${PATHS.buildDir}/copilot/agents/ralph.writer.agent.md:/workspace/.github/agents/ralph.writer.agent.md:ro`,
        `${PATHS.buildDir}/skills/code-review:/workspace/.github/skills/code-review:ro`,
      ]);
      expect(env).toEqual({ GH_TOKEN: "${GH_TOKEN}" });
    });

    it("mounts each agent once when two stages reach it", () => {
      // Arrange
      const profile = makeProfile({
        stages: [
          makeStage({ role: "a", agent: "ralph.ralph", cli: CliType.Copilot }),
          makeStage({ role: "b", agent: "ralph.writer", cli: CliType.Copilot }),
        ],
      });

      // Act
      const { volumes } = runtime.composeContribution({ profile, paths: PATHS, agents: AGENTS });

      // Assert
      expect(volumes.filter((v) => v.includes("ralph.writer.agent.md"))).toHaveLength(1);
    });

    it("throws when a stage's agent has no template", () => {
      // Arrange
      const profile = makeProfile({ stages: [makeStage({ agent: "ralph.missing", cli: CliType.Copilot })] });

      // Act & Assert
      expect(() => runtime.composeContribution({ profile, paths: PATHS, agents: AGENTS })).toThrow(
        /No agent template ralph.missing/,
      );
    });
  });

  it("needs the Copilot API and GitHub through the egress proxy", () => {
    // Act & Assert
    expect(runtime.egressDomains).toEqual([".githubcopilot.com", "api.github.com", "github.com"]);
  });

  it("reports its config, its hook config and the whole agents and skills directories as mount targets", () => {
    // Act & Assert
    expect(runtime.workspaceMountTargets).toEqual([
      ".ralph/config.json",
      ".github/hooks/ralph-audit.json",
      ".github/agents/",
      ".github/skills/",
    ]);
  });

  describe("logSources", () => {
    it("collects the transcript and the debug log directory, and exports the session state", () => {
      // Act
      const { sources, exports } = runtime.logSources();

      // Assert
      expect(sources.map((s) => [s.id, s.containerPath, s.mode])).toEqual([
        ["transcript", "/workspace/.ralph/logs/session-transcript.md", CaptureMode.Collect],
        ["cli-debug", "/workspace/.ralph/logs/cli-debug", CaptureMode.Collect],
      ]);
      expect(exports.map((e) => [e.id, e.containerPath])).toEqual([
        ["session-state", "/workspace/.ralph/session-state"],
        ["session-db", "/workspace/.ralph/session-store.db"],
      ]);
    });

    it("streams the debug log directory when a callback is given", () => {
      // Arrange
      const onLine = (): void => {};

      // Act
      const debug = runtime.logSources(onLine).sources.find((s) => s.id === "cli-debug");

      // Assert
      expect(debug).toMatchObject({ mode: CaptureMode.Stream, onLine });
      expect(debug?.streamArgs?.join(" ")).toContain("tail -n 0 -F /workspace/.ralph/logs/cli-debug/*.log");
    });
  });

  it("decodes output as plain text", () => {
    // Act & Assert
    expect(runtime.createOutputDecoder()).toBeInstanceOf(PlainTextDecoder);
  });
});
