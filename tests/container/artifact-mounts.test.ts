import { describe, it, expect } from "vitest";
import { agentFileMounts, skillDirMounts } from "../../src/container/setup/artifact-mounts";

describe("agentFileMounts", () => {
  it("mounts each rendered agent file read-only under the container agents directory", () => {
    // Act
    const mounts = agentFileMounts(
      ["ralph.ralph.agent.md", "ralph.malph.agent.md"],
      "/p/.build/copilot/agents",
      "/workspace/.github/agents",
    );

    // Assert
    expect(mounts).toEqual([
      "/p/.build/copilot/agents/ralph.ralph.agent.md:/workspace/.github/agents/ralph.ralph.agent.md:ro",
      "/p/.build/copilot/agents/ralph.malph.agent.md:/workspace/.github/agents/ralph.malph.agent.md:ro",
    ]);
  });

  it("mounts nothing for no agents", () => {
    // Act & Assert
    expect(agentFileMounts([], "/p/.build/copilot/agents", "/workspace/.github/agents")).toEqual([]);
  });
});

describe("skillDirMounts", () => {
  it("mounts each rendered skill directory read-only under the container skills directory", () => {
    // Act
    const mounts = skillDirMounts(["code-review", "testing"], "/p/.build/skills", "/workspace/.github/skills");

    // Assert
    expect(mounts).toEqual([
      "/p/.build/skills/code-review:/workspace/.github/skills/code-review:ro",
      "/p/.build/skills/testing:/workspace/.github/skills/testing:ro",
    ]);
  });

  it("mounts nothing for no skills", () => {
    // Act & Assert
    expect(skillDirMounts([], "/p/.build/skills", "/workspace/.github/skills")).toEqual([]);
  });
});
