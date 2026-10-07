import { describe, it, expect } from "vitest";
import { agentCliBuildArgs, parseAgentCliVersions } from "../../src/cli/cli-versions";
import { CliType } from "../../src/config/types";

describe("parseAgentCliVersions", () => {
  it("returns one exact version per CLI", () => {
    // Act & Assert
    expect(parseAgentCliVersions({ claude: "2.1.292", copilot: "1.0.3" })).toEqual({
      [CliType.Claude]: "2.1.292",
      [CliType.Copilot]: "1.0.3",
    });
  });

  it.each([
    ["a missing CLI", { claude: "2.1.292" }, "copilot: undefined"],
    ["a range", { claude: "^2.1.292", copilot: "1.0.3" }, 'claude: "^2.1.292"'],
    ["a dist tag", { claude: "latest", copilot: "1.0.3" }, 'claude: "latest"'],
    ["a prerelease", { claude: "2.1.292", copilot: "1.0.3-beta.1" }, 'copilot: "1.0.3-beta.1"'],
    ["a number", { claude: 2, copilot: "1.0.3" }, "claude: 2"],
  ])("rejects %s, naming the CLI", (_case, raw, problem) => {
    // Act & Assert
    expect(() => parseAgentCliVersions(raw)).toThrow(`(${problem})`);
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
