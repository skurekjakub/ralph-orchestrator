import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAgentCatalog } from "../../src/container/setup/agent-catalogs";
import { makeAgentTemplate } from "../helpers/factories";
import { createTempDir } from "../helpers/mcp-fs";

describe("loadAgentCatalog", () => {
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
    const catalog = await loadAgentCatalog(root, "docs");

    // Assert
    expect(catalog.fileIds).toEqual(["ralph.ralph"]);
    expect(catalog.get("ralph.ralph").frontmatter.name).toBe("ralph");
  });

  it("throws for a profile without an agents directory", async () => {
    // Act & Assert
    await expect(loadAgentCatalog(root, "docs")).rejects.toThrow(
      `Profile docs has no agents directory: ${join(root, "profiles", "docs", "agents")}`,
    );
  });

  it("rejects agent templates that do not form a valid graph", async () => {
    // Arrange
    mkdirSync(join(root, "profiles", "docs", "agents"), { recursive: true });
    writeFileSync(
      join(root, "profiles", "docs", "agents", "ralph.ralph.agent.md"),
      makeAgentTemplate("ralph", { subagents: ["gone"] }),
    );

    // Act & Assert
    await expect(loadAgentCatalog(root, "docs")).rejects.toThrow(/subagent "gone" is not an agent/);
  });
});
