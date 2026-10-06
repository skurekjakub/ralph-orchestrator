import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GatewayConfig } from "../../src/container/setup/mcp-config";
import { McpServerType } from "../../src/container/setup/mcp-manifest";
import { makeWorkItem, makeProfile } from "../helpers/factories";
import { createSilentLogger, createMockLogger } from "../helpers/mocks";
const PID = "ralph-docs";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue("{}"),
    writeFileSync: vi.fn(),
  };
});

const { existsSync, readFileSync, writeFileSync } = await import("node:fs");
const { JitMcpConfigWriter } = await import("../../src/container/setup/jit-mcp-params");

function makeGateway(servers: GatewayConfig["servers"] = []): GatewayConfig {
  return { servers };
}

function makeGatewayServer(name: string, env: Record<string, string> = {}): GatewayConfig["servers"][0] {
  return { name, type: McpServerType.Custom, port: 9100, command: "node", args: [], env };
}

describe("JitMcpConfigWriter", () => {
  const writer = new JitMcpConfigWriter();
  const issue = makeWorkItem("DOC-3143", "Update API docs for v2");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(writeFileSync).mockImplementation(() => {});
    vi.mocked(readFileSync).mockReturnValue("{}");
  });

  it("resolves $task.id macro into gateway.json", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["jira-kentico"],
      mcpServerConfigs: { "jira-kentico": { JIRA_ISSUE_KEY: "$task.id" } },
    });
    const gateway = makeGateway([makeGatewayServer("jira-kentico", { JIRA_PAT: "secret" })]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env).toEqual({
      JIRA_PAT: "secret",
      JIRA_ISSUE_KEY: "DOC-3143",
    });
  });

  it("resolves $task.project macro from issue key prefix", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { PROJECT: "$task.project" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.PROJECT).toBe("DOC");
  });

  it("resolves $task.branch macro to slugified branch name", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { TASK_BRANCH: "$task.branch" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.TASK_BRANCH).toBe("ralph/DOC-3143-update-api-docs-for-v2");
  });

  it("resolves $task.branch to target_branch trigger param when provided", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { TASK_BRANCH: "$task.branch" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger(), { branch: "code/my-existing-branch" });

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.TASK_BRANCH).toBe("code/my-existing-branch");
  });

  it("resolves $task.branch from explicit branch context when provided", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { TASK_BRANCH: "$task.branch" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger(), {}, { taskBranch: "feature/from-pr" });

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.TASK_BRANCH).toBe("feature/from-pr");
  });

  it("resolves $task.title macro to raw summary", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { SUMMARY: "$task.title" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.SUMMARY).toBe("Update API docs for v2");
  });

  it("passes static values through without resolution", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { ADO_PROJECT: "CustomerEducation", ADO_REPO: "my-repo" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.ADO_PROJECT).toBe("CustomerEducation");
    expect(written.servers[0].env.ADO_REPO).toBe("my-repo");
  });

  it("mixes static values and macros in same server config", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["ado"],
      mcpServerConfigs: {
        ado: {
          ADO_PROJECT: "CustomerEducation",
          TASK_BRANCH: "$task.branch",
          JIRA_KEY: "$task.id",
        },
      },
    });
    const gateway = makeGateway([makeGatewayServer("ado", { ADO_PAT: "secret" })]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env).toEqual({
      ADO_PAT: "secret",
      ADO_PROJECT: "CustomerEducation",
      TASK_BRANCH: "ralph/DOC-3143-update-api-docs-for-v2",
      JIRA_KEY: "DOC-3143",
    });
  });

  it("preserves existing env vars (secrets) when injecting", () => {
    const profile = makeProfile({
      id: PID,
      mcpServers: ["jira-kentico"],
      mcpServerConfigs: { "jira-kentico": { JIRA_ISSUE_KEY: "$task.id" } },
    });
    const gateway = makeGateway([makeGatewayServer("jira-kentico", { JIRA_PAT: "token123", JIRA_EMAIL: "a@b.com" })]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.JIRA_PAT).toBe("token123");
    expect(written.servers[0].env.JIRA_EMAIL).toBe("a@b.com");
    expect(written.servers[0].env.JIRA_ISSUE_KEY).toBe("DOC-3143");
  });

  it("no-ops when profile has no MCP servers", () => {
    const emptyProfile = makeProfile({ mcpServers: [] });

    writer.write(emptyProfile, issue, createSilentLogger());

    expect(readFileSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("no-ops when profile has no server configs", () => {
    const profile = makeProfile({
      mcpServers: ["jira-kentico"],
      mcpServerConfigs: {},
    });

    writer.write(profile, issue, createSilentLogger());

    expect(readFileSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("no-ops when gateway.json does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const profile = makeProfile({
      mcpServers: ["jira-kentico"],
      mcpServerConfigs: { "jira-kentico": { KEY: "$task.id" } },
    });
    const logger = createMockLogger();

    writer.write(profile, issue, logger);

    expect(readFileSync).not.toHaveBeenCalled();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("gateway.json not found"));
  });

  it("does not write when no servers have configs", () => {
    const profile = makeProfile({
      mcpServers: ["jira-kentico", "playwright"],
      mcpServerConfigs: {},
    });

    writer.write(profile, issue, createSilentLogger());

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("warns and skips when server is in config but not in gateway.json", () => {
    const profile = makeProfile({
      mcpServers: ["jira-kentico"],
      mcpServerConfigs: { "jira-kentico": { KEY: "$task.id" } },
    });
    const gateway = makeGateway([]); // empty
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));
    const logger = createMockLogger();

    writer.write(profile, issue, logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("not found in gateway.json"));
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("handles multiple servers — only injects into those with configs", () => {
    const profile = makeProfile({
      mcpServers: ["jira-kentico", "playwright"],
      mcpServerConfigs: { "jira-kentico": { JIRA_ISSUE_KEY: "$task.id" } },
    });
    const gateway = makeGateway([
      makeGatewayServer("jira-kentico", { JIRA_PAT: "s1" }),
      makeGatewayServer("playwright"),
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.JIRA_ISSUE_KEY).toBe("DOC-3143");
    expect(written.servers[0].env.JIRA_PAT).toBe("s1");
    expect(written.servers[1].env).toEqual({});
  });

  it("logs the injection count", () => {
    const profile = makeProfile({
      mcpServers: ["jira-kentico"],
      mcpServerConfigs: { "jira-kentico": { JIRA_ISSUE_KEY: "$task.id" } },
    });
    const gateway = makeGateway([makeGatewayServer("jira-kentico")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));
    const logger = createMockLogger();

    writer.write(profile, issue, logger);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Injected 1 env var(s)"));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("DOC-3143"));
  });

  it("throws on unknown macro", () => {
    const profile = makeProfile({
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { FOO: "$unknownMacro" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    expect(() => writer.write(profile, issue, createSilentLogger())).toThrow("Unknown macro");
    expect(() => writer.write(profile, issue, createSilentLogger())).toThrow("$variantEnv.<PREFIX>");
  });

  it("resolves $trigger.<key> from triggerParams", () => {
    const profile = makeProfile({
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { TARGET_BRANCH: "$trigger.target_branch" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger(), { target_branch: "develop" });

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.TARGET_BRANCH).toBe("develop");
  });

  it("resolves $trigger.<key> to empty string when key is missing", () => {
    const profile = makeProfile({
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { TARGET_BRANCH: "$trigger.target_branch" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger(), {});

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.TARGET_BRANCH).toBe("");
  });

  it("resolves $trigger.<key> to empty string when triggerParams is undefined", () => {
    const profile = makeProfile({
      mcpServers: ["ado"],
      mcpServerConfigs: { ado: { TARGET_BRANCH: "$trigger.target_branch" } },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.TARGET_BRANCH).toBe("");
  });

  it("mixes $trigger macros with issue macros and static values", () => {
    const profile = makeProfile({
      mcpServers: ["ado"],
      mcpServerConfigs: {
        ado: {
          ADO_PROJECT: "CustomerEducation",
          TASK_BRANCH: "$task.branch",
          TARGET_BRANCH: "$trigger.target_branch",
        },
      },
    });
    const gateway = makeGateway([makeGatewayServer("ado")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger(), { target_branch: "main" });

    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
    expect(written.servers[0].env.ADO_PROJECT).toBe("CustomerEducation");
    expect(written.servers[0].env.TASK_BRANCH).toBe("ralph/DOC-3143-update-api-docs-for-v2");
    expect(written.servers[0].env.TARGET_BRANCH).toBe("main");
  });

  it("skips server config for servers not in mcpServers list", () => {
    const profile = makeProfile({
      mcpServers: ["playwright"],
      mcpServerConfigs: { "jira-kentico": { KEY: "$task.id" } },
    });
    const gateway = makeGateway([makeGatewayServer("playwright")]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

    writer.write(profile, issue, createSilentLogger());

    // Should not write since the only config is for a server not in mcpServers
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  describe("$variantEnv macros", () => {
    it("resolves $variantEnv.PREFIX from process.env using variant-scoped name", () => {
      process.env.NODEBB_TOKEN_RALPH_DOCS_RALPH = "tok-ralph-123";
      const profile = makeProfile({
        id: PID,
        agentName: "ralph",
        mcpServers: ["ralphchives-write"],
        mcpServerConfigs: { "ralphchives-write": { NODEBB_API_TOKEN: "$variantEnv.NODEBB_TOKEN" } },
      });
      const gateway = makeGateway([makeGatewayServer("ralphchives-write")]);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

      writer.write(profile, issue, createSilentLogger());

      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
      expect(written.servers[0].env.NODEBB_API_TOKEN).toBe("tok-ralph-123");
      delete process.env.NODEBB_TOKEN_RALPH_DOCS_RALPH;
    });

    it("resolves different env vars for different variants of the same profile", () => {
      process.env.NODEBB_TOKEN_RALPH_DOCS_MALPH = "tok-malph-456";
      const profile = makeProfile({
        id: PID,
        agentName: "malph",
        mcpServers: ["ralphchives-write"],
        mcpServerConfigs: { "ralphchives-write": { NODEBB_API_TOKEN: "$variantEnv.NODEBB_TOKEN" } },
      });
      const gateway = makeGateway([makeGatewayServer("ralphchives-write")]);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

      writer.write(profile, issue, createSilentLogger());

      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
      expect(written.servers[0].env.NODEBB_API_TOKEN).toBe("tok-malph-456");
      delete process.env.NODEBB_TOKEN_RALPH_DOCS_MALPH;
    });

    it("throws when the variant env var is missing from process.env", () => {
      delete process.env.NODEBB_TOKEN_RALPH_DOCS_RALPH;
      const profile = makeProfile({
        id: PID,
        agentName: "ralph",
        mcpServers: ["ralphchives-write"],
        mcpServerConfigs: { "ralphchives-write": { NODEBB_API_TOKEN: "$variantEnv.NODEBB_TOKEN" } },
      });
      const gateway = makeGateway([makeGatewayServer("ralphchives-write")]);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

      expect(() => writer.write(profile, issue, createSilentLogger())).toThrow(
        'Missing env var "NODEBB_TOKEN_RALPH_DOCS_RALPH"',
      );
    });

    it("normalizes dashes to underscores and uppercases the env var name", () => {
      process.env.NODEBB_TOKEN_RALPH_VSCODE_RALPH = "tok-vscode";
      const profile = makeProfile({
        id: "ralph-vscode",
        agentName: "ralph",
        mcpServers: ["ralphchives-write"],
        mcpServerConfigs: { "ralphchives-write": { NODEBB_API_TOKEN: "$variantEnv.NODEBB_TOKEN" } },
      });
      const gateway = makeGateway([makeGatewayServer("ralphchives-write")]);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

      writer.write(profile, issue, createSilentLogger());

      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
      expect(written.servers[0].env.NODEBB_API_TOKEN).toBe("tok-vscode");
      delete process.env.NODEBB_TOKEN_RALPH_VSCODE_RALPH;
    });

    it("mixes $variantEnv with static values and other macros", () => {
      process.env.NODEBB_TOKEN_RALPH_DOCS_RALPH = "tok-mixed";
      const profile = makeProfile({
        id: PID,
        agentName: "ralph",
        mcpServers: ["ralphchives-write"],
        mcpServerConfigs: {
          "ralphchives-write": {
            NODEBB_API_TOKEN: "$variantEnv.NODEBB_TOKEN",
            NODEBB_CATEGORY_NAME: PID,
            JIRA_KEY: "$task.id",
          },
        },
      });
      const gateway = makeGateway([makeGatewayServer("ralphchives-write")]);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(gateway));

      writer.write(profile, issue, createSilentLogger());

      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string) as GatewayConfig;
      expect(written.servers[0].env).toEqual({
        NODEBB_API_TOKEN: "tok-mixed",
        NODEBB_CATEGORY_NAME: PID,
        JIRA_KEY: "DOC-3143",
      });
      delete process.env.NODEBB_TOKEN_RALPH_DOCS_RALPH;
    });
  });
});
