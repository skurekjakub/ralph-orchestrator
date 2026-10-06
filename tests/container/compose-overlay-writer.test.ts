import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeProfile } from "../helpers/factories.js";
import { createMockLogger } from "../helpers/mocks.js";

const PID = "ralph-docs";

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue("{}"),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  };
});

const { existsSync, readFileSync, writeFileSync, readdirSync } = await import("node:fs");
const { ComposeOverlayWriter } = await import("../../src/container/setup/compose-overlay-writer.js");

describe("ComposeOverlayWriter", () => {
  const writer = new ComposeOverlayWriter();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue("{}");
    vi.mocked(writeFileSync).mockImplementation(() => {});
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it("writes overlay to the profile's build directory", () => {
    const profile = makeProfile({ id: PID, skills: ["skill-a"] });
    const logger = createMockLogger();

    writer.write(profile, logger);

    expect(writeFileSync).toHaveBeenCalledTimes(3);
    const overlayPath = vi.mocked(writeFileSync).mock.calls[0][0] as string;
    expect(overlayPath).toContain(`profiles/${PID}/.build/docker-compose.overlay.yml`);
    const mcpConfigPath = vi.mocked(writeFileSync).mock.calls[1][0] as string;
    expect(mcpConfigPath).toContain(`profiles/${PID}/.build/mcp-config.json`);
    const gatewayPath = vi.mocked(writeFileSync).mock.calls[2][0] as string;
    expect(gatewayPath).toContain(`profiles/${PID}/.build/gateway.json`);
  });

  it("generates skill volume mounts for declared skills", () => {
    const profile = makeProfile({ id: PID, skills: ["code-review", "testing"] });

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain("/workspace/.github/skills/code-review:ro");
    expect(content).toContain("/workspace/.github/skills/testing:ro");
  });

  it("excludes skills not in the matched variant", () => {
    const profile = makeProfile({ id: PID, skills: ["code-review"] });

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain("/workspace/.github/skills/code-review:ro");
    expect(content).not.toContain("unrelated-skill");
  });

  it("includes agent volume mounts when agent templates exist", () => {
    const profile = makeProfile({ id: PID, skills: [] });
    // readdirSync for the agents dir should return agent files
    vi.mocked(existsSync).mockImplementation((p) => {
      return String(p).includes("/agents");
    });
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("/agents")) {
        return ["ralph.agent.md", "reviewer.agent.md"] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain("/workspace/.github/agents/ralph.agent.md:ro");
    expect(content).toContain("/workspace/.github/agents/reviewer.agent.md:ro");
  });

  it("includes resource volume mounts when profile.json has resources config", () => {
    const profile = makeProfile({ id: PID, skills: [] });
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes("profile.json") || path.includes("/resources");
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        resources: { mountBase: "res" },
      }),
    );
    vi.mocked(readdirSync).mockImplementation((p, _opts) => {
      if (String(p).includes("/resources")) {
        return [{ name: "guide.md", isDirectory: () => false }] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain("/workspace/res/guide.md:ro");
  });

  it("skips resource mounts when profile.json does not exist", () => {
    const profile = makeProfile({ id: PID, skills: ["skill-a"] });
    vi.mocked(existsSync).mockReturnValue(false);

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    // Should still have skill mounts but no resource mounts
    expect(content).toContain("/workspace/.github/skills/skill-a:ro");
    expect(content).not.toContain("/workspace/res/");
  });

  it("skips resource mounts when profile.json has no resources field", () => {
    const profile = makeProfile({ id: PID, skills: [] });
    vi.mocked(existsSync).mockImplementation((p) => String(p).includes("profile.json"));
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ someOtherField: true }));

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).not.toContain("/workspace/res/");
  });

  it("skips resource mounts gracefully on profile.json parse error", () => {
    const profile = makeProfile({ id: PID, skills: [] });
    vi.mocked(existsSync).mockImplementation((p) => String(p).includes("profile.json"));
    vi.mocked(readFileSync).mockReturnValue("not valid json {{{");

    expect(() => writer.write(profile, createMockLogger())).not.toThrow();

    expect(writeFileSync).toHaveBeenCalledTimes(3);
  });

  it("includes MCP sidecar service when profile has MCP servers", () => {
    const profile = makeProfile({ id: PID, skills: [], mcpServers: ["ado", "jira-kentico"] });
    // Mock existsSync so loadMcpManifest finds the manifest files
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes("mcp-server.json")) {
        return JSON.stringify({
          name: "test",
          type: "custom",
          command: "node",
          args: ["server.js"],
          sidecarPort: 9100,
        });
      }
      return "{}";
    });

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain("mcp-sidecar:");
    expect(content).toContain("gateway.json:/opt/mcp/config/gateway.json:ro");
  });

  it("omits MCP sidecar service when profile has no MCP servers", () => {
    const profile = makeProfile({ id: PID, skills: [], mcpServers: [] });

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).not.toContain("mcp-sidecar:");
  });

  it("logs the number of skill mounts", () => {
    const profile = makeProfile({ id: PID, skills: ["a", "b", "c"] });
    const logger = createMockLogger();

    writer.write(profile, logger);

    expect(logger.info).toHaveBeenCalledWith(
      "Regenerated compose overlay, mcp-config, and gateway with 3 skill mount(s), 0 MCP server(s)",
    );
  });

  it("produces a valid overlay even with zero skills and zero servers", () => {
    const profile = makeProfile({ id: PID, skills: [], mcpServers: [] });

    writer.write(profile, createMockLogger());

    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(content).toContain("services:");
    expect(content).toContain("app:");
    expect(content).toContain("mcp-config.json:/workspace/.ralph/mcp-config.json:ro");
  });
});
