import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentCatalog } from "../../src/cli/agent-catalog";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode, CliType, StageMode, type IAgentProfile } from "../../src/config/types";
import { ComposeOverlayWriter, writeComposeArtifacts } from "../../src/container/setup/compose-overlay-writer";
import { loadAgentCatalog } from "../../src/container/setup/agent-catalogs";
import { makeAgentSource, makeProfile, makeStage } from "../helpers/factories";
import { createTempDir } from "../helpers/mcp-fs";
import { createSilentLogger } from "../helpers/mocks";

vi.mock("../../src/container/setup/agent-catalogs");

const PID = "docs";

/** `ralph` spawns `writer`; `other` is unreachable from it. */
const AGENTS = new AgentCatalog([
  makeAgentSource("ralph.ralph", { name: "ralph", subagents: ["writer"] }),
  makeAgentSource("ralph.writer", { name: "writer" }),
  makeAgentSource("ralph.other", { name: "other" }),
]);

/** A variant whose stages all run `cli` in the container, with one skill each. */
function variant(cli: CliType, overrides: Partial<IAgentProfile> = {}): IAgentProfile {
  return makeProfile({
    id: PID,
    stages: [makeStage({ agent: "ralph.ralph", cli, skills: ["code-review"] })],
    ...overrides,
  });
}

describe("writeComposeArtifacts", () => {
  let root: string;
  let buildDir: string;

  /** The generated overlay, squid.conf, or another build file. */
  const built = (file: string): string => readFileSync(join(buildDir, file), "utf-8");

  function write(profile: IAgentProfile, claudeAuth = ClaudeAuthMode.OAuthToken): void {
    writeComposeArtifacts({
      rootDir: root,
      cliRuntimes: createCliRuntimeRegistry(claudeAuth),
      profile,
      agents: AGENTS,
      logger: createSilentLogger(),
    });
  }

  beforeEach(() => {
    root = createTempDir();
    buildDir = join(root, "profiles", PID, ".build");
    mkdirSync(join(root, "profiles", PID), { recursive: true });
    mkdirSync(join(root, "shared", "mcp-servers"), { recursive: true });
    mkdirSync(join(root, "shared", "security"), { recursive: true });
    mkdirSync(join(root, "shared", "hooks", "claude"), { recursive: true });
    writeFileSync(
      join(root, "shared", "security", "squid.conf"),
      "# {{PROFILE_DOMAINS}}\nhttp_access allow allowed_domains\nhttp_access deny all\n",
    );
    writeFileSync(join(root, "shared", "hooks", "claude", "hooks.json"), JSON.stringify({ Stop: [] }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("for a Claude Code container stage", () => {
    it("passes only the OAuth token, never GH_TOKEN or the API key", () => {
      // Act
      write(variant(CliType.Claude));

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain('CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}"');
      expect(overlay).not.toContain("ANTHROPIC_API_KEY");
      expect(overlay).not.toContain("GH_TOKEN");
    });

    it("passes only the API key when claudeAuth is api-key", () => {
      // Act
      write(variant(CliType.Claude), ClaudeAuthMode.ApiKey);

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain('ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"');
      expect(overlay).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    });

    it("sets the environment Claude Code reads, under the names it reads them by", () => {
      // Act
      write(variant(CliType.Claude));

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      for (const entry of [
        'CLAUDE_CONFIG_DIR: "/workspace/.ralph/claude"',
        'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1"',
        'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"',
        'CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1"',
        'CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1"',
        'DISABLE_AUTOUPDATER: "1"',
        'DISABLE_COST_WARNINGS: "1"',
        'ENABLE_TOOL_SEARCH: "false"',
      ]) {
        expect(overlay).toContain(entry);
      }
      expect(overlay).not.toContain("CLAUDE_CODE_DISABLE_AUTOUPDATER");
      expect(overlay).not.toContain("CLAUDE_CODE_DISABLE_COST_WARNINGS");
    });

    it("loads the target repo's CLAUDE.md files when the profile opts in", () => {
      // Act
      write(variant(CliType.Claude, { claude: { loadRepoInstructions: true } }));

      // Assert
      expect(built("docker-compose.overlay.yml")).not.toContain("CLAUDE_CODE_DISABLE_CLAUDE_MDS");
    });

    it("mounts the session and user settings and the agents and skills directories", () => {
      // Act
      write(variant(CliType.Claude));

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain(`- ${buildDir}/claude/session-settings.json:/etc/ralph/claude-settings.json:ro`);
      expect(overlay).toContain(`- ${buildDir}/claude/user-settings.json:/workspace/.ralph/claude/settings.json:ro`);
      expect(overlay).toContain(`- ${buildDir}/claude/agents:/workspace/.ralph/claude/agents:ro`);
      expect(overlay).toContain(`- ${buildDir}/skills:/workspace/.ralph/claude/skills:ro`);
      expect(overlay).not.toContain("/workspace/.github/");
    });

    it("writes the settings files and creates the mounted directories", () => {
      // Act
      write(variant(CliType.Claude));

      // Assert
      const session = JSON.parse(built("claude/session-settings.json"));
      expect(session.hooks).toEqual({ Stop: [] });
      expect(JSON.parse(built("claude/user-settings.json"))).toEqual({});
      expect(existsSync(join(buildDir, "claude", "agents"))).toBe(true);
      expect(existsSync(join(buildDir, "skills"))).toBe(true);
      expect(existsSync(join(buildDir, "copilot-settings.json"))).toBe(false);
    });

    it("allows the Anthropic API but no Copilot domain through the egress proxy", () => {
      // Act
      write(variant(CliType.Claude, { allowlistDomains: [".npmjs.org"] }));

      // Assert
      const squid = built("squid.conf");
      expect(squid).toContain("acl allowed_domains dstdomain api.anthropic.com");
      expect(squid).toContain("acl allowed_domains dstdomain .npmjs.org");
      expect(squid).not.toContain("githubcopilot");
      expect(squid).not.toContain("github.com");
    });

    it("throws when the Claude Code hooks file is missing", () => {
      // Arrange
      rmSync(join(root, "shared", "hooks", "claude", "hooks.json"));

      // Act & Assert
      expect(() => write(variant(CliType.Claude))).toThrow(/Failed to read Claude Code hooks/);
    });
  });

  describe("for a Copilot container stage", () => {
    it("passes GH_TOKEN and no Claude Code environment", () => {
      // Act
      write(variant(CliType.Copilot));

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
      expect(overlay).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(overlay).not.toContain("CLAUDE_CONFIG_DIR");
      expect(overlay).not.toContain("ANTHROPIC_API_KEY");
      expect(overlay).not.toContain("DISABLE_AUTOUPDATER");
    });

    it("mounts the URL allowlist, the hook config, each reachable agent file and each skill", () => {
      // Act
      write(variant(CliType.Copilot));

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      const agentsDir = join(buildDir, "copilot", "agents");
      expect(overlay).toContain('COPILOT_HOME: "/workspace/.ralph"');
      expect(overlay).toContain(`- ${buildDir}/copilot-settings.json:/workspace/.ralph/settings.json:ro`);
      expect(overlay).toContain(
        `- ${join(root, "shared", "hooks")}/ralph-audit.json:/workspace/.github/hooks/ralph-audit.json:ro`,
      );
      expect(overlay).toContain(
        `- ${agentsDir}/ralph.ralph.agent.md:/workspace/.github/agents/ralph.ralph.agent.md:ro`,
      );
      expect(overlay).toContain(
        `- ${agentsDir}/ralph.writer.agent.md:/workspace/.github/agents/ralph.writer.agent.md:ro`,
      );
      expect(overlay).not.toContain("ralph.other.agent.md");
      expect(overlay).toContain(`- ${buildDir}/skills/code-review:/workspace/.github/skills/code-review:ro`);
      expect(overlay).not.toContain("/workspace/.ralph/claude");
    });

    it("allows the Copilot domains but not the Anthropic API, and derives the Copilot settings from them", () => {
      // Act
      write(variant(CliType.Copilot));

      // Assert
      const squid = built("squid.conf");
      expect(squid).toContain("acl allowed_domains dstdomain .githubcopilot.com");
      expect(squid).toContain("acl allowed_domains dstdomain api.github.com");
      expect(squid).not.toContain("anthropic");
      const settings = JSON.parse(built("copilot-settings.json"));
      expect(settings.allowedUrls).toContain("https://*.githubcopilot.com");
      expect(existsSync(join(buildDir, "claude"))).toBe(false);
    });
  });

  it("combines both CLIs' credentials, mounts and domains for a variant whose container stages run both", () => {
    // Arrange
    const profile = makeProfile({
      id: PID,
      stages: [
        makeStage({ role: "write", agent: "ralph.ralph", cli: CliType.Claude }),
        makeStage({ role: "review", agent: "ralph.other", cli: CliType.Copilot }),
      ],
    });

    // Act
    write(profile);

    // Assert
    const overlay = built("docker-compose.overlay.yml");
    expect(overlay).toContain('CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}"');
    expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
    expect(overlay).toContain("/workspace/.ralph/claude/agents:ro");
    expect(overlay).toContain("/workspace/.github/agents/ralph.other.agent.md:ro");
    expect(overlay).not.toContain("/workspace/.github/agents/ralph.ralph.agent.md");
    const squid = built("squid.conf");
    expect(squid).toContain("api.anthropic.com");
    expect(squid).toContain(".githubcopilot.com");
  });

  it("injects no CLI credential when every stage runs on the host", () => {
    // Arrange
    const profile = makeProfile({
      id: PID,
      stages: [makeStage({ agent: "ralph.ralph", mode: StageMode.Local, cli: CliType.Copilot })],
    });

    // Act
    write(profile);

    // Assert
    const overlay = built("docker-compose.overlay.yml");
    expect(overlay).not.toContain("environment:");
    expect(built("squid.conf")).toContain("acl allowed_domains src 0.0.0.0/32");
  });

  it("pins the agent CLI versions in the image build args", () => {
    // Act
    write(variant(CliType.Claude));

    // Assert
    const overlay = built("docker-compose.overlay.yml");
    expect(overlay).toMatch(/CLAUDE_CODE_VERSION: "\d+\.\d+\.\d+"/);
    expect(overlay).toMatch(/COPILOT_CLI_VERSION: "\d+\.\d+\.\d+"/);
  });

  it("mounts the profile's resource files", () => {
    // Arrange
    mkdirSync(join(root, "profiles", PID, "resources"), { recursive: true });
    writeFileSync(join(root, "profiles", PID, "resources", "guide.md"), "# Guide");

    // Act
    write(variant(CliType.Claude, { resources: { mountBase: "res" } }));

    // Assert
    expect(built("docker-compose.overlay.yml")).toContain("- ./resources/guide.md:/workspace/res/guide.md:ro");
  });

  it("scopes mcp-config.json and gateway.json to the variant's MCP servers", () => {
    // Act
    write(variant(CliType.Claude));

    // Assert
    expect(JSON.parse(built("mcp-config.json"))).toEqual({ mcpServers: {} });
    expect(JSON.parse(built("gateway.json")).servers).toEqual([]);
  });

  it("throws and writes no squid.conf when the baseline is missing", () => {
    // Arrange
    rmSync(join(root, "shared", "security", "squid.conf"));

    // Act & Assert
    expect(() => write(variant(CliType.Claude))).toThrow(/Baseline squid.conf not found/);
    expect(existsSync(join(buildDir, "squid.conf"))).toBe(false);
  });
});

describe("ComposeOverlayWriter", () => {
  let root: string;

  beforeEach(() => {
    root = createTempDir();
    mkdirSync(join(root, "profiles", PID), { recursive: true });
    mkdirSync(join(root, "shared", "mcp-servers"), { recursive: true });
    mkdirSync(join(root, "shared", "security"), { recursive: true });
    writeFileSync(join(root, "shared", "security", "squid.conf"), "# {{PROFILE_DOMAINS}}\nhttp_access deny all\n");
    vi.mocked(loadAgentCatalog).mockReset().mockResolvedValue(AGENTS);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("writes the variant's artifacts under the root with the profile's agent catalog", async () => {
    // Arrange
    const writer = new ComposeOverlayWriter({
      cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
      rootDir: root,
    });

    // Act
    await writer.write(variant(CliType.Copilot), createSilentLogger());

    // Assert
    expect(loadAgentCatalog).toHaveBeenCalledWith(root, PID);
    const overlay = readFileSync(join(root, "profiles", PID, ".build", "docker-compose.overlay.yml"), "utf-8");
    expect(overlay).toContain("/workspace/.github/agents/ralph.writer.agent.md:ro");
  });

  it("propagates an invalid agent catalog", async () => {
    // Arrange
    vi.mocked(loadAgentCatalog).mockRejectedValue(new Error("Invalid agent set"));
    const writer = new ComposeOverlayWriter({
      cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
      rootDir: root,
    });

    // Act & Assert
    await expect(writer.write(variant(CliType.Copilot), createSilentLogger())).rejects.toThrow("Invalid agent set");
  });
});
