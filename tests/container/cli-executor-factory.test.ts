import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentCatalog } from "../../src/cli/agent-catalog";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType, StageMode } from "../../src/config/types";
import { CliExecutorFactory } from "../../src/container/cli-executor-factory";
import { ClaudeCodeExecutor } from "../../src/container/cli-executors/claude-code-executor";
import { CopilotExecutor } from "../../src/container/cli-executors/copilot-executor";
import { LocalCopilotExecutor } from "../../src/container/cli-executors/local-copilot-executor";
import type { IAgentCatalogProvider } from "../../src/container/setup/agent-catalogs";
import { makeAgentSource, makeProfile, makeStage } from "../helpers/factories";
import { createMockCompose, createMockLogger, fakeCliProcess, type Mocked } from "../helpers/mocks";

/** `ralph.root` (named `root`) spawns `writer`, which spawns `checker`. */
const CATALOG = new AgentCatalog([
  makeAgentSource("ralph.root", { name: "root", subagents: ["writer"] }),
  makeAgentSource("ralph.writer", { name: "writer", subagents: ["checker"] }),
  makeAgentSource("ralph.checker", { name: "checker" }),
]);

function createFactory() {
  const agentCatalogs: Mocked<IAgentCatalogProvider> = { load: vi.fn().mockResolvedValue(CATALOG) };
  const factory = new CliExecutorFactory({
    cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
    agentCatalogs,
  });
  return { factory, agentCatalogs };
}

describe("CliExecutorFactory", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "executor-factory-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

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
      const profile = makeProfile({ id: "docs", repoPath, stages: [stage] });

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
    it("creates a LocalCopilotExecutor for a host stage that runs Copilot", () => {
      // Arrange
      const { factory } = createFactory();
      const stage = makeStage({ mode: StageMode.Local, cli: CliType.Copilot });

      // Act
      const executor = factory.createLocal(makeProfile(), stage, "/tmp/repo", createMockLogger());

      // Assert
      expect(executor).toBeInstanceOf(LocalCopilotExecutor);
    });

    it("throws for a host stage that runs Claude Code", () => {
      // Arrange
      const { factory } = createFactory();
      const stage = makeStage({ role: "scientist", mode: StageMode.Local, cli: CliType.Claude });

      // Act & Assert
      expect(() => factory.createLocal(makeProfile(), stage, "/tmp/repo", createMockLogger())).toThrow(
        'Stage "scientist" runs cli "claude" on the host',
      );
    });
  });
});
