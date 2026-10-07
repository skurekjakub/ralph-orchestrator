import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HEALTH_PORT,
  loadGatewayConfig,
  parseGatewayConfig,
  ServerType,
  UPSTREAM_PORT_OFFSET,
} from "../src/gateway-config";

function server(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "ado", type: "custom", port: 9101, command: "node", args: ["/opt/x.js"], env: {}, ...overrides };
}

describe("gateway config", () => {
  describe("parseGatewayConfig", () => {
    it("derives an upstream port for a filtered custom server only", () => {
      // Act
      const config = parseGatewayConfig({
        servers: [
          server({ allowedTools: ["a", "b"] }),
          server({ name: "web", port: 9104 }),
          server({ name: "browser", type: "npm", port: 9103, allowedTools: ["c"] }),
        ],
      });

      // Assert
      expect(config.servers).toEqual([
        expect.objectContaining({ name: "ado", allowedTools: ["a", "b"], upstreamPort: 9101 + UPSTREAM_PORT_OFFSET }),
        expect.objectContaining({ name: "web", type: ServerType.Custom, upstreamPort: null }),
        expect.objectContaining({ name: "browser", type: ServerType.Npm, allowedTools: ["c"], upstreamPort: null }),
      ]);
      expect(config.servers[1]).not.toHaveProperty("allowedTools");
    });

    it("lets an npm server use a high port, because it has no upstream port", () => {
      // Act
      const config = parseGatewayConfig({ servers: [server({ type: "npm", port: 60000, allowedTools: ["a"] })] });

      // Assert
      expect(config.servers[0].upstreamPort).toBeNull();
    });

    it("accepts a config without servers", () => {
      expect(parseGatewayConfig({}).servers).toEqual([]);
      expect(parseGatewayConfig({ servers: [] }).servers).toEqual([]);
    });

    it.each([
      ["a non-object config", [], "must be a JSON object"],
      ["servers that is not an array", { servers: {} }, "servers must be an array"],
      ["a server without a name", { servers: [server({ name: "" })] }, "name must be a non-empty string"],
      ["an unknown type", { servers: [server({ type: "python" })] }, 'type must be "custom" or "npm"'],
      ["a non-integer port", { servers: [server({ port: 91.5 })] }, "port must be an integer"],
      ["non-string args", { servers: [server({ args: [1] })] }, "args must be an array of strings"],
      ["non-string env values", { servers: [server({ env: { A: 1 } })] }, "env must be an object of string values"],
      ["an empty allowlist", { servers: [server({ allowedTools: [] })] }, "allowedTools must be a non-empty array"],
      [
        "a blank tool name",
        { servers: [server({ allowedTools: ["a", ""] })] },
        "allowedTools must be a non-empty array",
      ],
      ["a duplicated tool name", { servers: [server({ allowedTools: ["a", "a"] })] }, "must not contain duplicates"],
      ["an npm server without an allowlist", { servers: [server({ type: "npm" })] }, "allowedTools is required"],
      [
        "a port without room for its upstream",
        { servers: [server({ port: 60000, allowedTools: ["a"] })] },
        "leaves no room",
      ],
      ["a duplicated server name", { servers: [server(), server({ port: 9200 })] }, 'duplicate server name "ado"'],
      ["a port shared by two servers", { servers: [server(), server({ name: "b" })] }, "port 9101"],
      ["a port taken by the health endpoint", { servers: [server({ port: HEALTH_PORT })] }, "the health endpoint"],
      [
        "an upstream port that collides with another server",
        { servers: [server({ allowedTools: ["a"] }), server({ name: "b", port: 9101 + UPSTREAM_PORT_OFFSET })] },
        "collides with",
      ],
    ])("rejects %s", (_label, raw, message) => {
      expect(() => parseGatewayConfig(raw)).toThrow(message);
    });
  });

  describe("loadGatewayConfig", () => {
    it("reads and validates the file", () => {
      const dir = mkdtempSync(join(tmpdir(), "gateway-config-"));
      try {
        const path = join(dir, "gateway.json");
        writeFileSync(path, JSON.stringify({ servers: [server({ allowedTools: ["a"] })] }));

        expect(loadGatewayConfig(path).servers[0].upstreamPort).toBe(9101 + UPSTREAM_PORT_OFFSET);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("throws for a file that is not JSON", () => {
      const dir = mkdtempSync(join(tmpdir(), "gateway-config-"));
      try {
        const path = join(dir, "gateway.json");
        writeFileSync(path, "{ nope");

        expect(() => loadGatewayConfig(path)).toThrow(SyntaxError);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
