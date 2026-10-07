import { describe, expect, it } from "vitest";
import { ProtocolErrorCode } from "@modelcontextprotocol/client";
import {
  filterListToolsResponse,
  inspectInbound,
  requestIdKey,
  responseIdKey,
  ToolAllowlist,
  type InboundVerdict,
} from "../src/tool-policy";

const allowlist = new ToolAllowlist(["echo", "search"]);

function forwarded(verdict: InboundVerdict): Extract<InboundVerdict, { kind: "forward" }> {
  if (verdict.kind !== "forward") throw new Error(`expected forward, got ${JSON.stringify(verdict)}`);
  return verdict;
}

function rejected(verdict: InboundVerdict): Extract<InboundVerdict, { kind: "reject" }> {
  if (verdict.kind !== "reject") throw new Error(`expected reject, got ${JSON.stringify(verdict)}`);
  return verdict;
}

describe("tool policy", () => {
  describe("inspectInbound", () => {
    it.each([
      [
        "the denied name first",
        '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"secret","name":"echo"}}',
      ],
      [
        "the denied name last",
        '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","name":"secret"}}',
      ],
      [
        "an escaped repeat",
        '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","na\\u006de":"secret"}}',
      ],
      [
        "a repeat in a nested object",
        '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"a":1,"a":2}}}',
      ],
      [
        "a repeat inside a batch",
        '[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","jsonrpc":"2.0","id":2,"method":"ping"}]',
      ],
    ])("rejects a body whose object repeats a key (%s)", (_label, body) => {
      // Act
      const verdict = rejected(inspectInbound(body, allowlist));

      // Assert
      expect(verdict.httpStatus).toBe(400);
      expect(verdict.payload).toMatchObject({ id: null, error: { code: ProtocolErrorCode.InvalidRequest } });
    });

    it("accepts the same key in sibling objects and key-like text inside strings", () => {
      // Arrange
      const body = JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "echo", arguments: { name: "x" } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo", arguments: { q: '"name":"secret"' } } },
      ]);

      // Act & Assert
      expect(inspectInbound(body, allowlist).kind).toBe("forward");
    });

    it("tracks tools/list request ids, keeping numeric and string ids apart", () => {
      // Arrange
      const body = JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: "1", method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "prompts/list" },
      ]);

      // Act
      const verdict = forwarded(inspectInbound(body, allowlist));

      // Assert
      expect(verdict.listToolsIds).toEqual([requestIdKey(1), requestIdKey("1")]);
      expect(requestIdKey(1)).not.toBe(requestIdKey("1"));
    });

    it.each([
      ["a single request", { jsonrpc: "2.0", id: "a", method: "ping" }, "a"],
      ["a batch", [{ jsonrpc: "2.0", id: "a", method: "ping" }], null],
      ["a notification", { jsonrpc: "2.0", method: "notifications/initialized" }, null],
    ])("names the reply id only for a single request (%s)", (_label, message, replyId) => {
      // Act
      const verdict = forwarded(inspectInbound(JSON.stringify(message), allowlist));

      // Assert
      expect(verdict.replyId).toBe(replyId);
    });

    it.each([
      ["methods other than tools/call, whatever they name", { method: "resources/read", params: { name: "secret" } }],
      ["client responses to server requests", { result: { action: "accept" } }],
    ])("passes %s through", (_label, message) => {
      // Arrange
      const body = JSON.stringify({ jsonrpc: "2.0", id: 3, ...message });

      // Act & Assert
      expect(inspectInbound(body, allowlist).kind).toBe("forward");
    });

    it("rejects a non-string tool name", () => {
      // Arrange
      const body = JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: ["echo"] } });

      // Act
      const verdict = rejected(inspectInbound(body, allowlist));

      // Assert
      expect(verdict.deniedTools).toEqual(["<missing>"]);
      expect(verdict.payload).toMatchObject({ id: 5, error: { code: ProtocolErrorCode.InvalidParams } });
    });
  });

  describe("filterListToolsResponse", () => {
    it("keeps allowlisted tools and every other field of the result", () => {
      // Arrange
      const response = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "echo" }, { name: "secret" }, "junk"], nextCursor: "2", _meta: { x: 1 } },
      };

      // Act
      const filtered = filterListToolsResponse(response, allowlist);

      // Assert
      expect(filtered).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "echo" }], nextCursor: "2", _meta: { x: 1 } },
      });
    });

    it.each([
      ["a result without tools", { jsonrpc: "2.0", id: 1, result: { content: [] } }],
      ["an error", { jsonrpc: "2.0", id: 1, error: { code: 1, message: "x" } }],
      ["a non-object", "text"],
    ])("returns undefined for %s", (_label, message) => {
      // Act & Assert
      expect(filterListToolsResponse(message, allowlist)).toBeUndefined();
    });
  });

  describe("responseIdKey", () => {
    it.each([
      ["a result", { jsonrpc: "2.0", id: 1, result: {} }, requestIdKey(1)],
      ["an error", { jsonrpc: "2.0", id: "x", error: { code: 1, message: "m" } }, requestIdKey("x")],
      ["a request", { jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined],
      ["a notification", { jsonrpc: "2.0", method: "notifications/progress" }, undefined],
    ])("keys %s by its id, and only responses", (_label, message, key) => {
      // Act & Assert
      expect(responseIdKey(message)).toBe(key);
    });
  });

  describe("ToolAllowlist", () => {
    it("reports allowlisted names the server does not expose, in allowlist order", () => {
      // Arrange
      const allowlisted = new ToolAllowlist(["c", "a", "b"]);

      // Act & Assert
      expect(allowlisted.missingFrom(["a", "z"])).toEqual(["c", "b"]);
    });
  });
});
