import { describe, it, expect, vi } from "vitest";
import { AgentCatalog } from "../../src/cli/agent-catalog";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType, StageMode } from "../../src/config/types";
import { CliExecutorFactory } from "../../src/container/cli-executor-factory";
import { ClaudeCodeExecutor } from "../../src/container/cli-executors/claude-code-executor";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor";
import { LocalCopilotExecutor } from "../../src/container/cli-executors/local-copilot-executor";
import { makeAgentSource, makeHostWorkspace, makeProfile, makeStage } from "../helpers/factories";
import { createMockAgentCatalogProvider, createMockCompose, createMockLogger, fakeCliProcess } from "../helpers/mocks";

/** `ralph.root` (named `root`) spawns `writer`, which spawns `checker`. */
const CATALOG = new AgentCatalog([
  makeAgentSource("ralph.root", { name: "root", subagents: ["writer"] }),
  makeAgentSource("ralph.writer", { name: "writer", subagents: ["checker"] }),
  makeAgentSource("ralph.checker", { name: "checker" }),
]);

function createFactory() {
  const agentCatalogs = createMockAgentCatalogProvider(CATALOG);
  const factory = new CliExecutorFactory({
    cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
    rootDir: "/repo",
    agentCatalogs,
  });
  return { factory, agentCatalogs };
}

describe("CliExecutorFactory", () => {
  describe("create", () => {
    it("creates a CopilotExecutor for a stage that runs Copilot, without loading agents", async () => {
      // Arrange
      const { factory, agentCatalogs } = createFactory();
      const { compose } = createMockCompose();
      const stage = makeStage({ agent: "ralph.root", cli: CliType.Copilot });

      // Act
      const executor = await factory.create(compose, makeProfile({ stages: [stage] }), stage, createMockLogger());

      // Assert
      expect(executor).toBeInstanceOf(CopilotExecutor);
      expect(agentCatalogs.load).not.toHaveBeenCalled();
    });

    it("creates a ClaudeCodeExecutor with the root agent's name and the depth of its subagent graph", async () => {
      // Arrange
      const { factory, agentCatalogs } = createFactory();
      const { compose } = createMockCompose();
      vi.mocked(compose.execWithTimeout).mockImplementation(() => fakeCliProcess(""));
      const stage = makeStage({ agent: "ralph.root", cli: CliType.Claude });
      const profile = makeProfile({ id: "docs", stages: [stage] });

      // Act
      const executor = await factory.create(compose, profile, stage, createMockLogger());
      await executor.run("p");

      // Assert
      expect(executor).toBeInstanceOf(ClaudeCodeExecutor);
      expect(agentCatalogs.load).toHaveBeenCalledWith("docs");
      const args = vi.mocked(compose.execWithTimeout).mock.calls[0][0];
      expect(args[args.indexOf("--agent") + 1]).toBe("root");
      expect(args).toContain("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2");
    });

    it("rejects a Claude Code stage whose agent has no template", async () => {
      // Arrange
      const { factory } = createFactory();
      const { compose } = createMockCompose();
      const stage = makeStage({ agent: "ralph.missing", cli: CliType.Claude });

      // Act & Assert
      await expect(factory.create(compose, makeProfile(), stage, createMockLogger())).rejects.toThrow(
        /No agent template ralph.missing/,
      );
    });

    it("propagates an agent catalog that fails to load", async () => {
      // Arrange
      const { factory, agentCatalogs } = createFactory();
      agentCatalogs.load.mockRejectedValue(new Error("Invalid agent set"));
      const { compose } = createMockCompose();
      const stage = makeStage({ agent: "ralph.root", cli: CliType.Claude });

      // Act & Assert
      await expect(factory.create(compose, makeProfile(), stage, createMockLogger())).rejects.toThrow(
        "Invalid agent set",
      );
    });
  });

  describe("createLocal", () => {
    it("creates a LocalCopilotExecutor for a host stage that runs Copilot", async () => {
      // Arrange
      const { factory } = createFactory();
      const stage = makeStage({ mode: StageMode.Local, cli: CliType.Copilot });

      // Act
      const executor = await factory.createLocal(makeProfile(), stage, makeHostWorkspace(), createMockLogger());

      // Assert
      expect(executor).toBeInstanceOf(LocalCopilotExecutor);
    });

    it("throws for a host stage that runs Claude Code", async () => {
      // Arrange
      const { factory } = createFactory();
      const stage = makeStage({ role: "scientist", mode: StageMode.Local, cli: CliType.Claude });

      // Act & Assert
      await expect(factory.createLocal(makeProfile(), stage, makeHostWorkspace(), createMockLogger())).rejects.toThrow(
        'Stage "scientist" runs cli "claude" on the host',
      );
    });
  });
});
