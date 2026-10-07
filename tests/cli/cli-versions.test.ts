import { describe, it, expect } from "vitest";
import { agentCliBuildArgs, hostCliBinary, parseAgentCliVersions } from "../../src/cli/cli-versions";
import { CliType } from "../../src/config/types";

describe("parseAgentCliVersions", () => {
  it("returns the exact version of each CLI package, ignoring other dependencies", () => {
    // Act & Assert
    expect(
      parseAgentCliVersions({ "@anthropic-ai/claude-code": "2.1.292", "@github/copilot": "1.0.3", zod: "^4.6.5" }),
    ).toEqual({
      [CliType.Claude]: "2.1.292",
      [CliType.Copilot]: "1.0.3",
    });
  });

  it.each([
    ["a missing CLI package", { "@anthropic-ai/claude-code": "2.1.292" }, "@github/copilot: undefined"],
    [
      "a range",
      { "@anthropic-ai/claude-code": "^2.1.292", "@github/copilot": "1.0.3" },
      '@anthropic-ai/claude-code: "^2.1.292"',
    ],
    [
      "a dist tag",
      { "@anthropic-ai/claude-code": "latest", "@github/copilot": "1.0.3" },
      '@anthropic-ai/claude-code: "latest"',
    ],
    [
      "a prerelease",
      { "@anthropic-ai/claude-code": "2.1.292", "@github/copilot": "1.0.3-beta.1" },
      '@github/copilot: "1.0.3-beta.1"',
    ],
    ["a number", { "@anthropic-ai/claude-code": 2, "@github/copilot": "1.0.3" }, "@anthropic-ai/claude-code: 2"],
  ])("rejects %s, naming the package", (_case, dependencies, problem) => {
    // Act & Assert
    expect(() => parseAgentCliVersions(dependencies)).toThrow(`(${problem})`);
  });
});

describe("agentCliBuildArgs", () => {
  it("maps each CLI's version to the build arg the profile Dockerfiles read", () => {
    // Act & Assert
    expect(agentCliBuildArgs({ [CliType.Claude]: "2.1.292", [CliType.Copilot]: "1.0.3" })).toEqual({
      CLAUDE_CODE_VERSION: "2.1.292",
      COPILOT_CLI_VERSION: "1.0.3",
    });
  });
});

describe("hostCliBinary", () => {
  it("resolves each CLI to the command its package installs under the orchestrator's node_modules", () => {
    // Act & Assert
    expect(hostCliBinary("/repo", CliType.Claude)).toBe("/repo/node_modules/.bin/claude");
    expect(hostCliBinary("/repo", CliType.Copilot)).toBe("/repo/node_modules/.bin/copilot");
  });
});
