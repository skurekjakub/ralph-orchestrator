import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentCatalogProvider } from "../../src/container/setup/agent-catalogs";
import { makeAgentTemplate } from "../helpers/factories";
import { createTempDir } from "../helpers/mcp-fs";

describe("AgentCatalogProvider", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("loads the agent templates of profiles/<id>/agents", async () => {
    // Arrange
    mkdirSync(join(root, "profiles", "docs", "agents"), { recursive: true });
    writeFileSync(join(root, "profiles", "docs", "agents", "ralph.ralph.agent.md"), makeAgentTemplate("ralph"));

    // Act
    const catalog = await new AgentCatalogProvider(root).load("docs");

    // Assert
    expect(catalog.fileIds).toEqual(["ralph.ralph"]);
    expect(catalog.get("ralph.ralph").frontmatter.name).toBe("ralph");
  });

  it("is empty for a profile without an agents directory", async () => {
    // Act
    const catalog = await new AgentCatalogProvider(root).load("docs");

    // Assert
    expect(catalog.fileIds).toEqual([]);
  });

  it("rejects agent templates that do not form a valid graph", async () => {
    // Arrange
    mkdirSync(join(root, "profiles", "docs", "agents"), { recursive: true });
    writeFileSync(
      join(root, "profiles", "docs", "agents", "ralph.ralph.agent.md"),
      makeAgentTemplate("ralph", { subagents: ["gone"] }),
    );

    // Act & Assert
    await expect(new AgentCatalogProvider(root).load("docs")).rejects.toThrow(/subagent "gone" is not an agent/);
  });
});
