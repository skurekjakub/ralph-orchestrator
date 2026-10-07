import { describe, it, expect } from "vitest";
import { generateComposeOverlay, type ComposeOverlayOptions } from "../../src/container/setup/compose-overlay";

const BUILD_DIR = "/repo/profiles/p/.build";
const SIDECAR_DIR = "/repo/shared/mcp-sidecar";

/** Overlay options for a variant without MCP servers, CLI artifacts or extra build args, merged with `overrides`. */
function options(overrides: Partial<ComposeOverlayOptions> = {}): ComposeOverlayOptions {
  return {
    mcpServersDir: "/repo/shared/mcp-servers",
    serverNames: [],
    buildDir: BUILD_DIR,
    sidecarDir: SIDECAR_DIR,
    appVolumes: [],
    appEnv: {},
    appBuildArgs: {},
    sidecarEnv: {},
    hasPreInit: false,
    ...overrides,
  };
}

/** The `app` service part of an overlay. */
function appSection(overlay: string): string {
  const sidecarStart = overlay.indexOf("\n  mcp-sidecar:\n");
  return sidecarStart === -1 ? overlay : overlay.slice(0, sidecarStart);
}

/** The `mcp-sidecar` service part of an overlay. */
function sidecarSection(overlay: string): string {
  return overlay.slice(overlay.indexOf("\n  mcp-sidecar:\n"));
}

describe("generateComposeOverlay", () => {
  describe("app service", () => {
    it("always mounts the URL-only MCP config and the .ralph .gitignore", () => {
      // Act
      const overlay = generateComposeOverlay(options());

      // Assert
      expect(overlay).toContain(`- ${BUILD_DIR}/mcp-config.json:/workspace/.ralph/mcp-config.json:ro`);
      expect(overlay).toContain(`- ${BUILD_DIR}/.gitignore:/workspace/.ralph/.gitignore:ro`);
    });

    it("lists the CLI and resource volumes it is given", () => {
      // Act
      const overlay = generateComposeOverlay(
        options({ appVolumes: ["/b/settings.json:/etc/x.json:ro", "./resources/data.md:/workspace/res/data.md:ro"] }),
      );

      // Assert
      expect(overlay).toContain("      - /b/settings.json:/etc/x.json:ro");
      expect(overlay).toContain("      - ./resources/data.md:/workspace/res/data.md:ro");
    });

    it("writes the given environment as quoted values, keeping compose interpolations", () => {
      // Act
      const overlay = generateComposeOverlay(
        options({ appEnv: { CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}", DISABLE_AUTOUPDATER: "1" } }),
      );

      // Assert
      expect(appSection(overlay)).toContain("    environment:");
      expect(overlay).toContain('      CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN}"');
      expect(overlay).toContain('      DISABLE_AUTOUPDATER: "1"');
    });

    it("has no environment and no CLI credential when no agent CLI runs in the container", () => {
      // Act
      const app = appSection(generateComposeOverlay(options()));

      // Assert
      expect(app).not.toContain("environment:");
      expect(app).not.toContain("GH_TOKEN");
      expect(app).not.toContain("ANTHROPIC_API_KEY");
      expect(app).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    });

    it("passes the host UID/GID and the given build args to the image build", () => {
      // Act
      const overlay = generateComposeOverlay(
        options({ appBuildArgs: { CLAUDE_CODE_VERSION: "2.1.292", COPILOT_CLI_VERSION: "1.0.3" } }),
      );

      // Assert
      expect(appSection(overlay)).toContain(
        [
          "    build:",
          "      args:",
          '        HOST_UID: "${HOST_UID}"',
          '        HOST_GID: "${HOST_GID}"',
          '        CLAUDE_CODE_VERSION: "2.1.292"',
          '        COPILOT_CLI_VERSION: "1.0.3"',
        ].join("\n"),
      );
    });

    it("escapes quotes and backslashes in environment values", () => {
      // Act
      const overlay = generateComposeOverlay(options({ appEnv: { ODD: 'a"b\\c' } }));

      // Assert
      expect(overlay).toContain('      ODD: "a\\"b\\\\c"');
    });
  });

  describe("MCP sidecar service", () => {
    it("is defined with its hardening when servers are declared", () => {
      // Act
      const overlay = generateComposeOverlay(options({ serverNames: ["test-server"] }));

      // Assert
      const sidecar = sidecarSection(overlay);
      expect(sidecar).toContain(`context: ${SIDECAR_DIR}`);
      expect(sidecar).toContain("/repo/shared/mcp-servers:/opt/mcp/servers:ro");
      expect(sidecar).toContain("/opt/mcp/gateway/dist:ro");
      expect(sidecar).toContain("entrypoint.sh:/opt/mcp/entrypoint.sh:ro");
      expect(sidecar).toContain("gateway.json:/opt/mcp/config/gateway.json:ro");
      expect(sidecar).toContain("no-new-privileges:true");
      expect(sidecar).toContain("- ALL");
      expect(sidecar).toContain("memory: 24G");
    });

    it("is omitted, with the attachment volume, when no servers are declared", () => {
      // Act
      const overlay = generateComposeOverlay(options());

      // Assert
      expect(overlay).not.toContain("mcp-sidecar:");
      expect(overlay).not.toContain("/opt/mcp/servers");
      expect(overlay).not.toContain("/tmp/mcp-attachments");
    });

    it("makes the app wait for a healthy sidecar", () => {
      // Act
      const app = appSection(generateComposeOverlay(options({ serverNames: ["test-server"] })));

      // Assert
      expect(app).toContain("    depends_on:\n      mcp-sidecar:\n        condition: service_healthy");
    });

    it("mounts no MCP server code into the agent container", () => {
      // Act
      const app = appSection(generateComposeOverlay(options({ serverNames: ["test-server"] })));

      // Assert
      expect(app).not.toContain("/opt/mcp/servers");
    });

    it("shares the attachment directory read-write with the app and read-only with the sidecar", () => {
      // Act
      const overlay = generateComposeOverlay(options({ serverNames: ["test-server"] }));

      // Assert
      expect(appSection(overlay)).toContain(`${BUILD_DIR}/attachments:/tmp/mcp-attachments\n`);
      expect(sidecarSection(overlay)).toContain(`${BUILD_DIR}/attachments:/tmp/mcp-attachments:ro`);
    });

    it("mounts the repo for git operations and sets REPO_ROOT and the servers' sidecar env", () => {
      // Act
      const sidecar = sidecarSection(
        generateComposeOverlay(options({ serverNames: ["test-server"], sidecarEnv: { CGC_MODE: "fast" } })),
      );

      // Assert
      expect(sidecar).toContain('"${TARGET_REPO_PATH}:/workspace"');
      expect(sidecar).toContain('      REPO_ROOT: "/workspace"');
      expect(sidecar).toContain('      CGC_MODE: "fast"');
    });

    it("reaches the internet directly, not through the egress proxy, and resolves host.docker.internal", () => {
      // Act
      const sidecar = sidecarSection(generateComposeOverlay(options({ serverNames: ["test-server"] })));

      // Assert
      expect(sidecar).toContain("ralph-sidecar-external:");
      expect(sidecar).not.toContain("egress-proxy:");
      expect(sidecar).toContain("host.docker.internal:host-gateway");
    });

    it("mounts pre-init.sh only when there is one", () => {
      // Act
      const withPreInit = generateComposeOverlay(options({ serverNames: ["test-server"], hasPreInit: true }));
      const withoutPreInit = generateComposeOverlay(options({ serverNames: ["test-server"] }));

      // Assert
      expect(sidecarSection(withPreInit)).toContain("pre-init.sh:/opt/mcp/pre-init.sh:ro");
      expect(withoutPreInit).not.toContain("pre-init.sh");
    });
  });
});
