import { describe, it, expect } from "vitest";
import { cliToolNamesFor } from "../../src/cli/cli-tools";
import { CliType } from "../../src/config/types";

describe("cliToolNamesFor", () => {
  it("names Claude Code's tools", () => {
    // Act & Assert
    expect(cliToolNamesFor(CliType.Claude)).toEqual({
      subagent: "Agent",
      skill: "Skill",
      shell: "Bash",
      read: "Read",
      askUser: "AskUserQuestion",
    });
  });

  it("names Copilot CLI's tools", () => {
    // Act & Assert
    expect(cliToolNamesFor(CliType.Copilot)).toEqual({
      subagent: "task",
      skill: "skill",
      shell: "bash",
      read: "view",
      askUser: "ask_questions",
    });
  });
});
