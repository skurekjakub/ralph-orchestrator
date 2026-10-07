import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveAllProfileSetup, generatePreInitScript } from "../../src/container/setup/profile-setup";
import { createCliRuntimeRegistry } from "../../src/cli/supported-runtimes";
import { ClaudeAuthMode } from "../../src/config/types";
import { createTempDir, writeManifest } from "../helpers/mcp-fs";
import { createMockLogger, createSilentLogger } from "../helpers/mocks";
import { makeAgentTemplate } from "../helpers/factories";

/** A schema-valid profile.json with one single-stage variant running `ralph.ralph`, merged with `overrides`. */
function profileJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    repo: "/tmp/test-repo",
    dataSource: "test-source",
    variants: [{ stages: [{ agent: "ralph.ralph", role: "primary" }], match: { commentTrigger: "@go" } }],
    ...overrides,
  });
}

describe("Profile Setup", () => {
  describe("resolveAllProfileSetup", () => {
    let rootDir: string;
    let mcpDir: string;
    let securityDir: string;
    let profileDir: string;
    let buildDir: string;

    /** The generated file `name` of the test profile. */
    const built = (name: string): string => readFileSync(join(buildDir, name), "utf-8");

    /** Runs startup setup under `rootDir` with Claude Code on OAuth. */
    async function setup(logger = createSilentLogger()): Promise<void> {
      await resolveAllProfileSetup({
        rootDir,
        cliRuntimes: createCliRuntimeRegistry(ClaudeAuthMode.OAuthToken),
        logger,
      });
    }

    beforeEach(() => {
      rootDir = createTempDir();
      mcpDir = join(rootDir, "shared/mcp-servers");
      securityDir = join(rootDir, "shared/security");
      profileDir = join(rootDir, "profiles/test-profile");
      buildDir = join(profileDir, ".build");
      mkdirSync(join(profileDir, "agents"), { recursive: true });
      mkdirSync(mcpDir, { recursive: true });
      mkdirSync(securityDir, { recursive: true });
      mkdirSync(join(rootDir, "shared/hooks/claude"), { recursive: true });
      writeFileSync(join(rootDir, "shared/hooks/claude/hooks.json"), JSON.stringify({ Stop: [] }));
      writeFileSync(join(profileDir, "agents", "ralph.ralph.agent.md"), makeAgentTemplate("ralph"));
      writeFileSync(
        join(securityDir, "squid.conf"),
        "acl allowed_domains dstdomain .baseline.example\n# {{PROFILE_DOMAINS}}\nhttp_access allow allowed_domains",
      );
    });

    afterEach(() => {
      rmSync(rootDir, { recursive: true, force: true });
    });

    it("generates mcp-config.json, gateway.json, squid.conf, attachments and the .ralph .gitignore", async () => {
      // Arrange
      writeManifest(mcpDir, "test-server", {
        name: "test-server",
        type: "custom",
        command: "npx",
        args: ["-y", "test-pkg"],
        sidecarPort: 9100,
      });
      writeFileSync(join(profileDir, "profile.json"), profileJson({ mcpServers: ["test-server"] }));

      // Act
      await setup();

      // Assert
      const config = JSON.parse(built("mcp-config.json"));
      expect(config.mcpServers["test-server"].type).toBe("http");
      expect(config.mcpServers["test-server"].url).toContain("mcp-sidecar:9100/mcp");
      const gateway = JSON.parse(built("gateway.json"));
      expect(gateway.servers.map((s: { name: string; port: number }) => [s.name, s.port])).toEqual([
        ["test-server", 9100],
      ]);
      expect(built("squid.conf")).toContain(".baseline.example");
      expect(statSync(join(buildDir, "attachments")).mode & 0o777).toBe(0o777);
      expect(built(".gitignore")).toBe("*\n");
    });

    it("passes the Copilot credential, and no MCP secret, to a Copilot profile's agent container", async () => {
      // Arrange
      writeManifest(mcpDir, "test-mcp", {
        name: "test-mcp",
        type: "custom",
        command: "node",
        args: ["index.js"],
        sidecarPort: 9100,
        requiredEnv: ["MCP_TOKEN"],
      });
      writeFileSync(join(profileDir, "profile.json"), profileJson({ cli: "copilot", mcpServers: ["test-mcp"] }));

      // Act
      await setup();

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
      expect(overlay).not.toContain("ANTHROPIC_API_KEY");
      expect(overlay).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(overlay).not.toContain("MCP_TOKEN");
    });

    it("sets up a Claude Code profile's settings, environment and egress", async () => {
      // Arrange
      writeFileSync(join(profileDir, "profile.json"), profileJson({ cli: "claude" }));

      // Act
      await setup();

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain('CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}"');
      expect(overlay).not.toContain("GH_TOKEN");
      expect(overlay).toContain("/etc/claude-code/managed-settings.json:ro");
      expect(JSON.parse(built("claude/managed-settings.json")).allowManagedHooksOnly).toBe(true);
      expect(built("squid.conf")).toContain("acl allowed_domains dstdomain .anthropic.com");
      expect(existsSync(join(buildDir, "copilot-settings.json"))).toBe(false);
    });

    it("generates the Copilot settings from the Copilot and profile domains in squid.conf", async () => {
      // Arrange
      writeFileSync(
        join(profileDir, "profile.json"),
        profileJson({ cli: "copilot", allowlistDomains: [".npmjs.org"] }),
      );

      // Act
      await setup();

      // Assert
      const settings = JSON.parse(built("copilot-settings.json"));
      expect(settings.allowedUrls).toContain("https://*.githubcopilot.com");
      expect(settings.allowedUrls).toContain("https://*.npmjs.org");
      expect(settings.allowedUrls).not.toContain("https://*.anthropic.com");
    });

    it("injects allowlistDomains from profile.json into squid.conf", async () => {
      // Arrange
      writeFileSync(
        join(profileDir, "profile.json"),
        profileJson({ allowlistDomains: [".npmjs.org", "dev.azure.com", ".rubygems.org"] }),
      );

      // Act
      await setup();

      // Assert
      const squidConf = built("squid.conf");
      expect(squidConf).toContain("acl allowed_domains dstdomain .npmjs.org");
      expect(squidConf).toContain("acl allowed_domains dstdomain dev.azure.com");
      expect(squidConf).toContain("acl allowed_domains dstdomain .rubygems.org");
      expect(squidConf).not.toContain("{{PROFILE_DOMAINS}}");
    });

    it("mounts resource files only when the profile configures resources", async () => {
      // Arrange
      mkdirSync(join(profileDir, "resources"), { recursive: true });
      writeFileSync(join(profileDir, "resources", "test-file.md"), "# Test");
      writeFileSync(join(profileDir, "profile.json"), profileJson());

      // Act
      await setup();
      const withoutResources = built("docker-compose.overlay.yml");
      writeFileSync(join(profileDir, "profile.json"), profileJson({ resources: { mountBase: "resources/ralph" } }));
      await setup();

      // Assert
      expect(withoutResources).not.toContain("./resources/");
      expect(built("docker-compose.overlay.yml")).toContain(
        "- ./resources/test-file.md:/workspace/resources/ralph/test-file.md:ro",
      );
    });

    it("generates per-profile gateway.json with only declared servers", async () => {
      // Arrange
      for (const [name, port] of [
        ["server-a", 9100],
        ["server-b", 9101],
        ["server-c", 9102],
      ] as const) {
        writeManifest(mcpDir, name, { name, type: "custom", command: "npx", args: ["-y", name], sidecarPort: port });
      }
      writeFileSync(join(profileDir, "profile.json"), profileJson({ mcpServers: ["server-a", "server-c"] }));

      // Act
      await setup();

      // Assert
      const gateway = JSON.parse(built("gateway.json"));
      expect(gateway.servers.map((s: { name: string }) => s.name)).toEqual(["server-a", "server-c"]);
    });

    it("mounts the Copilot rendering of each agent the stage reaches, and the stage's skills", async () => {
      // Arrange
      writeFileSync(
        join(profileDir, "agents", "ralph.ralph.agent.md"),
        makeAgentTemplate("ralph", { subagents: ["writer"] }),
      );
      writeFileSync(join(profileDir, "agents", "ralph.writer.agent.md"), makeAgentTemplate("writer"));
      writeFileSync(join(profileDir, "agents", "ralph.other.agent.md"), makeAgentTemplate("other"));
      writeFileSync(
        join(profileDir, "profile.json"),
        profileJson({
          cli: "copilot",
          variants: [
            {
              stages: [{ agent: "ralph.ralph", role: "primary", skills: ["git-workflow"] }],
              match: { commentTrigger: "@go" },
            },
          ],
        }),
      );

      // Act
      await setup();

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain(
        `${buildDir}/copilot/agents/ralph.ralph.agent.md:/workspace/.github/agents/ralph.ralph.agent.md:ro`,
      );
      expect(overlay).toContain(
        `${buildDir}/copilot/agents/ralph.writer.agent.md:/workspace/.github/agents/ralph.writer.agent.md:ro`,
      );
      expect(overlay).not.toContain("ralph.other.agent.md");
      expect(overlay).toContain(`${buildDir}/skills/git-workflow:/workspace/.github/skills/git-workflow:ro`);
    });

    it("writes and mounts pre-init.sh when a server declares initScript", async () => {
      // Arrange
      writeManifest(mcpDir, "with-init", {
        name: "with-init",
        type: "custom",
        command: "npx",
        args: ["-y", "pkg"],
        sidecarPort: 9100,
        initScript: "init.sh",
      });
      writeFileSync(join(mcpDir, "with-init", "init.sh"), "#!/bin/bash\necho init");
      writeFileSync(join(profileDir, "profile.json"), profileJson({ mcpServers: ["with-init"] }));

      // Act
      await setup();

      // Assert
      expect(built("pre-init.sh")).toContain("/opt/mcp/servers/with-init/init.sh");
      expect(statSync(join(buildDir, "pre-init.sh")).mode & 0o755).toBe(0o755);
      expect(built("docker-compose.overlay.yml")).toContain("pre-init.sh:/opt/mcp/pre-init.sh:ro");
    });

    it("writes no pre-init.sh when no server declares initScript", async () => {
      // Arrange
      writeManifest(mcpDir, "plain-server", {
        name: "plain-server",
        type: "custom",
        command: "npx",
        args: ["-y", "pkg"],
        sidecarPort: 9100,
      });
      writeFileSync(join(profileDir, "profile.json"), profileJson({ mcpServers: ["plain-server"] }));

      // Act
      await setup();

      // Assert
      expect(existsSync(join(buildDir, "pre-init.sh"))).toBe(false);
      expect(built("docker-compose.overlay.yml")).not.toContain("pre-init.sh");
    });

    it("includes variant-level MCP servers in the startup gateway config", async () => {
      // Arrange
      writeManifest(mcpDir, "server-a", {
        name: "server-a",
        type: "custom",
        command: "npx",
        args: [],
        sidecarPort: 9100,
      });
      writeManifest(mcpDir, "server-b", {
        name: "server-b",
        type: "custom",
        command: "npx",
        args: [],
        sidecarPort: 9101,
      });
      writeFileSync(
        join(profileDir, "profile.json"),
        profileJson({
          mcpServers: ["server-a"],
          variants: [
            { stages: [{ agent: "ralph.ralph", role: "primary" }], match: { commentTrigger: "@go" } },
            {
              stages: [{ agent: "ralph.ralph", role: "primary" }],
              match: { commentTrigger: "@other" },
              mcpServers: ["server-b"],
            },
          ],
        }),
      );

      // Act
      await setup();

      // Assert
      const gateway = JSON.parse(built("gateway.json"));
      expect(gateway.servers.map((s: { name: string }) => s.name)).toEqual(["server-a", "server-b"]);
    });

    it("covers the container CLIs of every variant", async () => {
      // Arrange
      writeFileSync(
        join(profileDir, "profile.json"),
        profileJson({
          variants: [
            { stages: [{ agent: "ralph.ralph", role: "primary", cli: "claude" }], match: { commentTrigger: "@go" } },
            { stages: [{ agent: "ralph.ralph", role: "primary", cli: "copilot" }], match: { commentTrigger: "@co" } },
          ],
        }),
      );

      // Act
      await setup();

      // Assert
      const overlay = built("docker-compose.overlay.yml");
      expect(overlay).toContain('CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}"');
      expect(overlay).toContain('GH_TOKEN: "${GH_TOKEN}"');
    });

    it("warns and skips a profile.json that breaks the schema", async () => {
      // Arrange
      writeFileSync(join(profileDir, "profile.json"), JSON.stringify({ mcpServers: [] }));
      const logger = createMockLogger();

      // Act
      await setup(logger);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Skipping profile test-profile"));
      expect(existsSync(buildDir)).toBe(false);
    });

    it("rejects when a stage's agent has no template", async () => {
      // Arrange
      writeFileSync(
        join(profileDir, "profile.json"),
        profileJson({
          cli: "copilot",
          variants: [{ stages: [{ agent: "ralph.missing", role: "primary" }], match: { commentTrigger: "@go" } }],
        }),
      );

      // Act & Assert
      await expect(setup()).rejects.toThrow(/No agent template ralph.missing/);
    });
  });

  describe("generatePreInitScript", () => {
    it("returns null when no servers have initScript", () => {
      const mcpDir = createTempDir();
      writeManifest(mcpDir, "server-a", {
        name: "server-a",
        type: "custom",
        command: "npx",
        args: ["-y", "a"],
        sidecarPort: 9100,
      });

      const result = generatePreInitScript(mcpDir, ["server-a"]);
      expect(result).toBeNull();

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("generates script sourcing init scripts from servers that declare them", () => {
      const mcpDir = createTempDir();
      writeManifest(mcpDir, "with-init", {
        name: "with-init",
        type: "custom",
        command: "npx",
        args: ["-y", "pkg"],
        sidecarPort: 9100,
        initScript: "init.sh",
      });
      writeFileSync(join(mcpDir, "with-init", "init.sh"), "#!/bin/bash\necho init");
      writeManifest(mcpDir, "no-init", {
        name: "no-init",
        type: "custom",
        command: "npx",
        args: ["-y", "pkg2"],
        sidecarPort: 9101,
      });

      const result = generatePreInitScript(mcpDir, ["with-init", "no-init"]);
      expect(result).not.toBeNull();
      expect(result).toContain("/opt/mcp/servers/with-init/init.sh");
      expect(result).not.toContain("no-init");

      rmSync(mcpDir, { recursive: true, force: true });
    });

    it("includes all servers with initScript in order", () => {
      const mcpDir = createTempDir();
      writeManifest(mcpDir, "alpha", {
        name: "alpha",
        type: "custom",
        command: "npx",
        args: [],
        sidecarPort: 9100,
        initScript: "setup.sh",
      });
      writeFileSync(join(mcpDir, "alpha", "setup.sh"), "#!/bin/bash");
      writeManifest(mcpDir, "beta", {
        name: "beta",
        type: "custom",
        command: "npx",
        args: [],
        sidecarPort: 9101,
        initScript: "boot.sh",
      });
      writeFileSync(join(mcpDir, "beta", "boot.sh"), "#!/bin/bash");

      const result = generatePreInitScript(mcpDir, ["alpha", "beta"]);
      expect(result).toContain("/opt/mcp/servers/alpha/setup.sh");
      expect(result).toContain("/opt/mcp/servers/beta/boot.sh");
      const alphaIdx = result!.indexOf("alpha");
      const betaIdx = result!.indexOf("beta");
      expect(alphaIdx).toBeLessThan(betaIdx);

      rmSync(mcpDir, { recursive: true, force: true });
    });
  });
});
