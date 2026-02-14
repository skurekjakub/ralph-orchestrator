import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExeca } = vi.hoisted(() => {
  const mockExeca = vi.fn().mockReturnValue({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    then: vi.fn(),
    catch: vi.fn(),
    kill: vi.fn(),
  });
  return { mockExeca };
});

vi.mock("execa", () => ({
  execa: mockExeca,
}));

import { ComposeClient } from "../src/container/compose-client.js";

describe("ComposeClient", () => {
  const testConfig = {
    secrets: {
      ghToken: "gh-tok",
      adoPatDocs: "ado-docs",
      adoPatXperience: "ado-xp",
      jiraPat: "jira-pat",
      jiraEmail: "test@example.com",
      anthropicApiKey: "sk-ant-test",
    },
    jiraBaseUrl: "https://api.atlassian.com/ex/jira",
    jiraCloudId: "test-cloud-id",
    targetRepoPath: "/home/user/repos/target-repo",
  };

  beforeEach(() => {
    mockExeca.mockClear();
  });

  it("injects all required env vars into compose environment", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.compose(["config"]);

    const callArgs = mockExeca.mock.calls[0];
    const env = callArgs[2]?.env as Record<string, string>;

    expect(env.GH_TOKEN).toBe("gh-tok");
    expect(env.ADO_PAT_DOCS).toBe("ado-docs");
    expect(env.ADO_MCP_AUTH_TOKEN).toBe("ado-docs");
    expect(env.ADO_PAT_XPERIENCE).toBe("ado-xp");
    expect(env.JIRA_PAT).toBe("jira-pat");
    expect(env.JIRA_EMAIL).toBe("test@example.com");
    expect(env.JIRA_BASE_URL).toBe("https://api.atlassian.com/ex/jira");
    expect(env.JIRA_CLOUD_ID).toBe("test-cloud-id");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(env.CLAUDE_CODE_DISABLE_AUTOUPDATER).toBe("1");
    expect(env.CLAUDE_CODE_DISABLE_COST_WARNINGS).toBe("1");
  });

  it("passes compose file path to docker command", () => {
    const client = new ComposeClient("/path/to/docker-compose.yml", testConfig);
    client.compose(["up", "-d"]);

    const [cmd, args] = mockExeca.mock.calls[0];
    expect(cmd).toBe("docker");
    expect(args).toContain("-f");
    expect(args).toContain("/path/to/docker-compose.yml");
    expect(args).toContain("up");
    expect(args).toContain("-d");
  });

  it("exec prepends exec subcommand", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.exec(["--user", "vscode", "app", "cat", "/file"]);

    const [, args] = mockExeca.mock.calls[0];
    expect(args).toContain("exec");
    expect(args).toContain("--user");
    expect(args).toContain("vscode");
    expect(args).toContain("app");
  });

  it("execWithTimeout passes timeout option", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.execWithTimeout(["app", "echo", "hello"], 60000);

    const opts = mockExeca.mock.calls[0][2];
    expect(opts.timeout).toBe(60000);
  });

  it("uses same env for compose, exec, and execWithTimeout", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.compose(["config"]);
    client.exec(["app", "echo"]);
    client.execWithTimeout(["app", "echo"], 5000);

    const env1 = mockExeca.mock.calls[0][2]?.env;
    const env2 = mockExeca.mock.calls[1][2]?.env;
    const env3 = mockExeca.mock.calls[2][2]?.env;

    expect(env1).toBe(env2);
    expect(env2).toBe(env3);
  });

  it("injects TARGET_REPO_PATH and SHARED_HOOKS_PATH", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.compose(["config"]);

    const env = mockExeca.mock.calls[0][2]?.env as Record<string, string>;
    expect(env.TARGET_REPO_PATH).toBe("/home/user/repos/target-repo");
    expect(env.SHARED_HOOKS_PATH).toMatch(/shared\/hooks$/);
  });
});