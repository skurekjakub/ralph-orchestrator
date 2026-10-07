import { describe, it, expect } from "vitest";
import { hostCliEnv } from "../../src/cli/host-env";

describe("hostCliEnv", () => {
  const orchestratorEnv = {
    PATH: "/usr/bin",
    HOME: "/home/ralph",
    LANG: "C.UTF-8",
    CLAUDE_CODE_OAUTH_TOKEN: "oauth",
    GH_TOKEN: "gh",
    ADO_PAT: "ado",
    JIRA_PAT_DOCS: "jira",
    DISCORD_TOKEN: "discord",
  };

  it("passes PATH, HOME, LANG and the named credential, and nothing else of the orchestrator's", () => {
    // Act
    const env = hostCliEnv(orchestratorEnv, ["CLAUDE_CODE_OAUTH_TOKEN"]);

    // Assert
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/ralph", LANG: "C.UTF-8", CLAUDE_CODE_OAUTH_TOKEN: "oauth" });
  });

  it("adds the CLI's own variables, which win over inherited ones", () => {
    // Act
    const env = hostCliEnv(orchestratorEnv, [], { HOME: "/tmp/home", CLAUDE_CONFIG_DIR: "/tmp/cfg" });

    // Assert
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/tmp/home", LANG: "C.UTF-8", CLAUDE_CONFIG_DIR: "/tmp/cfg" });
  });

  it("leaves out unset and empty variables", () => {
    // Act
    const env = hostCliEnv({ PATH: "/usr/bin", LANG: "", GH_TOKEN: undefined }, ["GH_TOKEN"]);

    // Assert
    expect(env).toEqual({ PATH: "/usr/bin" });
  });
});
