import { describe, expect, it } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  filterListToolsResponse,
  inspectInbound,
  requestIdKey,
  responseIdKey,
  ToolAllowlist,
  type InboundVerdict,
} from "../src/tool-policy.js";

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
    it("forwards the inspected value, so a duplicated key cannot smuggle a different tool name upstream", () => {
      const smuggled = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"secret","name":"echo"}}';

      const verdict = forwarded(inspectInbound(smuggled, allowlist));

      expect(JSON.parse(verdict.body)).toEqual({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "echo" },
      });
    });

    it("denies a call whose last duplicated name is outside the allowlist", () => {
      const smuggled = '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","name":"secret"}}';

      const verdict = rejected(inspectInbound(smuggled, allowlist));

      expect(verdict.deniedTools).toEqual(["secret"]);
      expect(verdict.payload).toEqual({
        jsonrpc: "2.0",
        id: 1,
        error: { code: ErrorCode.InvalidParams, message: "Unknown tool: secret" },
      });
    });

    it("tracks tools/list request ids, keeping numeric and string ids apart", () => {
      const body = JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: "1", method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "prompts/list" },
      ]);

      expect(forwarded(inspectInbound(body, allowlist)).listToolsIds).toEqual([requestIdKey(1), requestIdKey("1")]);
      expect(requestIdKey(1)).not.toBe(requestIdKey("1"));
    });

    it("names the reply id only for a single request", () => {
      const single = JSON.stringify({ jsonrpc: "2.0", id: "a", method: "ping" });
      const batch = JSON.stringify([{ jsonrpc: "2.0", id: "a", method: "ping" }]);
      const notification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });

      expect(forwarded(inspectInbound(single, allowlist)).replyId).toBe("a");
      expect(forwarded(inspectInbound(batch, allowlist)).replyId).toBeNull();
      expect(forwarded(inspectInbound(notification, allowlist)).replyId).toBeNull();
    });

    it("passes methods other than tools/call through, whatever they name", () => {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { name: "secret" } });

      expect(inspectInbound(body, allowlist).kind).toBe("forward");
    });

    it("passes client responses to server requests through", () => {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 4, result: { action: "accept" } });

      expect(inspectInbound(body, allowlist).kind).toBe("forward");
    });

    it("rejects a non-string tool name", () => {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: ["echo"] } });

      const verdict = rejected(inspectInbound(body, allowlist));

      expect(verdict.deniedTools).toEqual(["<missing>"]);
      expect(verdict.payload).toMatchObject({ id: 5, error: { code: ErrorCode.InvalidParams } });
    });
  });

  describe("filterListToolsResponse", () => {
    it("keeps allowlisted tools and every other field of the result", () => {
      const response = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "echo" }, { name: "secret" }, "junk"], nextCursor: "2", _meta: { x: 1 } },
      };

      expect(filterListToolsResponse(response, allowlist)).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "echo" }], nextCursor: "2", _meta: { x: 1 } },
      });
    });

    it("returns undefined for messages that carry no tool list", () => {
      expect(filterListToolsResponse({ jsonrpc: "2.0", id: 1, result: { content: [] } }, allowlist)).toBeUndefined();
      expect(
        filterListToolsResponse({ jsonrpc: "2.0", id: 1, error: { code: 1, message: "x" } }, allowlist),
      ).toBeUndefined();
      expect(filterListToolsResponse("text", allowlist)).toBeUndefined();
    });
  });

  describe("responseIdKey", () => {
    it("keys results and errors by id and ignores requests and notifications", () => {
      expect(responseIdKey({ jsonrpc: "2.0", id: 1, result: {} })).toBe(requestIdKey(1));
      expect(responseIdKey({ jsonrpc: "2.0", id: "x", error: { code: 1, message: "m" } })).toBe(requestIdKey("x"));
      expect(responseIdKey({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toBeUndefined();
      expect(responseIdKey({ jsonrpc: "2.0", method: "notifications/progress" })).toBeUndefined();
    });
  });

  describe("ToolAllowlist", () => {
    it("reports allowlisted names the server does not expose, in allowlist order", () => {
      expect(new ToolAllowlist(["c", "a", "b"]).missingFrom(["a", "z"])).toEqual(["c", "b"]);
    });
  });
});
