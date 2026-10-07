import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { agentsBuildDir, profileBuildPaths } from "../../src/container/setup/build-paths";
import { CliType } from "../../src/config/types";

describe("profileBuildPaths", () => {
  it("places the profile's sources under profiles/<id> and its generated artifacts under .build", () => {
    // Act
    const paths = profileBuildPaths("/repo", "ralph-docs");

    // Assert
    expect(paths).toEqual({
      profileDir: join("/repo", "profiles", "ralph-docs"),
      agentsDir: join("/repo", "profiles", "ralph-docs", "agents"),
      buildDir: join("/repo", "profiles", "ralph-docs", ".build"),
      skillsBuildDir: join("/repo", "profiles", "ralph-docs", ".build", "skills"),
      hooksDir: join("/repo", "shared", "hooks"),
    });
  });
});

describe("agentsBuildDir", () => {
  it("is one directory per CLI inside the build directory", () => {
    // Arrange
    const paths = profileBuildPaths("/repo", "ralph-docs");

    // Act & Assert
    expect(agentsBuildDir(paths, CliType.Claude)).toBe(join(paths.buildDir, "claude", "agents"));
    expect(agentsBuildDir(paths, CliType.Copilot)).toBe(join(paths.buildDir, "copilot", "agents"));
  });
});
