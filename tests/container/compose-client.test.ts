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

import { ComposeClient } from "../../src/container/compose-client";
const SVC_APP = "app";
const SVC_SIDECAR = "mcp-sidecar";

describe("ComposeClient", () => {
  const testConfig = {
    targetRepoPath: "/home/user/repos/target-repo",
    squidConfPath: "/fake/squid.conf",
  };

  beforeEach(() => {
    mockExeca.mockClear();
  });

  it("injects computed paths into compose environment", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.compose(["config"]);

    const callArgs = mockExeca.mock.calls[0];
    const env = callArgs[2]?.env as Record<string, string>;

    expect(env.TARGET_REPO_PATH).toBe("/home/user/repos/target-repo");
    expect(env.SHARED_HOOKS_PATH).toMatch(/shared\/hooks$/);
    expect(env.SQUID_CONF_PATH).toBe("/fake/squid.conf");
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
    client.exec(["--user", "vscode", SVC_APP, "cat", "/file"]);

    const [, args] = mockExeca.mock.calls[0];
    expect(args).toContain("exec");
    expect(args).toContain("--user");
    expect(args).toContain("vscode");
    expect(args).toContain(SVC_APP);
  });

  it("execWithTimeout passes timeout option", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.execWithTimeout([SVC_APP, "echo", "hello"], 60000);

    const opts = mockExeca.mock.calls[0][2];
    expect(opts.timeout).toBe(60000);
  });

  it("execWithTimeout writes the given input to the command's stdin", () => {
    // Arrange
    const client = new ComposeClient("/fake/compose.yml", testConfig);

    // Act
    client.execWithTimeout(["-T", SVC_APP, "claude", "-p"], 60000, { input: "the prompt" });

    // Assert
    expect(mockExeca.mock.calls[0][2]).toMatchObject({ timeout: 60000, input: "the prompt" });
  });

  it("execWithTimeout leaves stdin alone without input", () => {
    // Arrange
    const client = new ComposeClient("/fake/compose.yml", testConfig);

    // Act
    client.execWithTimeout([SVC_APP, "echo"], 5000, {});

    // Assert
    expect(mockExeca.mock.calls[0][2]).not.toHaveProperty("input");
  });

  it("uses same env for compose, exec, and execWithTimeout", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.compose(["config"]);
    client.exec([SVC_APP, "echo"]);
    client.execWithTimeout([SVC_APP, "echo"], 5000);

    const env1 = mockExeca.mock.calls[0][2]?.env;
    const env2 = mockExeca.mock.calls[1][2]?.env;
    const env3 = mockExeca.mock.calls[2][2]?.env;

    expect(env1).toBe(env2);
    expect(env2).toBe(env3);
  });

  it("logs passes correct args for service log retrieval", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.logs(SVC_SIDECAR);

    const [cmd, args] = mockExeca.mock.calls[0];
    expect(cmd).toBe("docker");
    expect(args).toEqual(["compose", "-f", "/fake/compose.yml", "logs", "--no-color", "--no-log-prefix", SVC_SIDECAR]);
  });

  it("logs uses same env as compose and exec", () => {
    const client = new ComposeClient("/fake/compose.yml", testConfig);
    client.compose(["config"]);
    client.logs(SVC_SIDECAR);

    const env1 = mockExeca.mock.calls[0][2]?.env;
    const env2 = mockExeca.mock.calls[1][2]?.env;

    expect(env1).toBe(env2);
  });
});
