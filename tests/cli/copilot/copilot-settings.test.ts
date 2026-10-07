import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COPILOT_SETTINGS_FILE, writeCopilotSettings } from "../../../src/cli/copilot/copilot-settings";
import { createTempDir } from "../../helpers/mcp-fs";
import { createMockLogger } from "../../helpers/mocks";

describe("writeCopilotSettings", () => {
  let buildDir: string;

  beforeEach(() => {
    buildDir = createTempDir();
  });

  afterEach(() => {
    rmSync(buildDir, { recursive: true, force: true });
  });

  it("writes allowedUrls derived from squid.conf and turns experimental features on", () => {
    // Arrange
    writeFileSync(
      join(buildDir, "squid.conf"),
      [
        "acl allowed_domains dstdomain .githubcopilot.com",
        "acl allowed_domains dstdomain .npmjs.org",
        "acl host_loopback dstdomain host.docker.internal",
        "acl host_loopback_ports port 4500",
      ].join("\n"),
    );

    // Act
    writeCopilotSettings(buildDir, createMockLogger());

    // Assert
    expect(JSON.parse(readFileSync(join(buildDir, COPILOT_SETTINGS_FILE), "utf-8"))).toEqual({
      allowedUrls: ["http://host.docker.internal:4500/*", "https://*.githubcopilot.com", "https://*.npmjs.org"],
      experimental: true,
    });
  });

  it("throws and writes nothing when squid.conf does not exist", () => {
    // Act & Assert
    expect(() => writeCopilotSettings(buildDir, createMockLogger())).toThrow(/squid\.conf does not exist/);
    expect(existsSync(join(buildDir, COPILOT_SETTINGS_FILE))).toBe(false);
  });
});
