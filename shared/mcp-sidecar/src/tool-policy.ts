import {
  ErrorCode,
  JSONRPCMessageSchema,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type RequestId,
} from "@modelcontextprotocol/sdk/types.js";

const TOOLS_CALL = "tools/call";
const TOOLS_LIST = "tools/list";

/** A JSON-RPC error response, or `id: null` when the failing message has no usable id. */
export interface JsonRpcErrorPayload {
  jsonrpc: "2.0";
  id: RequestId | null;
  error: { code: number; message: string };
}

/** Verdict on a client POST body. */
export type InboundVerdict =
  | {
      kind: "forward";
      /** Body to send upstream: the parsed JSON re-serialised, so upstream parses exactly what was inspected. */
      body: string;
      /** Keys ({@link requestIdKey}) of the `tools/list` requests in the body, whose responses must be filtered. */
      listToolsIds: string[];
      /** Id to answer with when the body is a single request and the proxy must reply itself; otherwise `null`. */
      replyId: RequestId | null;
    }
  | {
      kind: "reject";
      httpStatus: number;
      payload: JsonRpcErrorPayload | JsonRpcErrorPayload[];
      /** Tool names of the denied `tools/call` messages (`"<missing>"` when no name was given). */
      deniedTools: string[];
    };

/** The set of tool names a server may expose. */
export class ToolAllowlist {
  private readonly names: ReadonlySet<string>;

  constructor(names: readonly string[]) {
    this.names = new Set(names);
  }

  /** Whether `name` is an allowlisted tool name. */
  allows(name: unknown): name is string {
    return typeof name === "string" && this.names.has(name);
  }

  /** Allowlisted names absent from `exposed`, in allowlist order. */
  missingFrom(exposed: readonly string[]): string[] {
    const available = new Set(exposed);
    return [...this.names].filter((name) => !available.has(name));
  }

  /** The allowlisted names, in allowlist order. */
  toArray(): string[] {
    return [...this.names];
  }
}

/** Map key for a JSON-RPC id; keeps `1` and `"1"` distinct. */
export function requestIdKey(id: RequestId): string {
  return `${typeof id}:${id}`;
}

/**
 * Inspect the raw body of a client POST to the MCP endpoint.
 *
 * Rejects bodies that are not JSON (HTTP 400, -32700), not JSON-RPC 2.0 messages or an empty batch
 * (HTTP 400, -32600), and any `tools/call` that is not a request naming an allowlisted tool. A denied
 * single request gets an HTTP 200 JSON-RPC error (-32602 `Unknown tool`, the same error a server
 * gives for a tool it does not have). A batch with any denied call is rejected whole: every request
 * in it gets an error and nothing reaches the server.
 */
export function inspectInbound(rawBody: string, allowlist: ToolAllowlist): InboundVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return reject(400, errorPayload(null, ErrorCode.ParseError, "Parse error: Invalid JSON"), []);
  }

  const isBatch = Array.isArray(parsed);
  const candidates: unknown[] = isBatch ? (parsed as unknown[]) : [parsed];
  if (candidates.length === 0) {
    return reject(400, errorPayload(null, ErrorCode.InvalidRequest, "Invalid Request: empty batch"), []);
  }

  const messages: JSONRPCMessage[] = [];
  for (const candidate of candidates) {
    const result = JSONRPCMessageSchema.safeParse(candidate);
    if (!result.success) {
      return reject(
        400,
        errorPayload(null, ErrorCode.InvalidRequest, "Invalid Request: not a JSON-RPC 2.0 message"),
        [],
      );
    }
    messages.push(candidate as JSONRPCMessage);
  }

  const denied = messages.filter((m) => "method" in m && m.method === TOOLS_CALL && !isAllowedCall(m, allowlist));
  if (denied.length === 0) {
    const single = !isBatch && isRequest(messages[0]) ? messages[0] : undefined;
    return {
      kind: "forward",
      body: JSON.stringify(parsed),
      listToolsIds: messages
        .filter((m): m is JSONRPCRequest => isRequest(m) && m.method === TOOLS_LIST)
        .map((m) => requestIdKey(m.id)),
      replyId: single ? single.id : null,
    };
  }

  const deniedTools = denied.map((m) => toolNameOf(m) ?? "<missing>");
  const requests = messages.filter(isRequest);
  if (requests.length === 0) {
    return reject(
      400,
      errorPayload(null, ErrorCode.InvalidRequest, "Invalid Request: tools/call must be a request with an id"),
      deniedTools,
    );
  }
  if (!isBatch) return reject(200, denialFor(requests[0]), deniedTools);

  const deniedSet = new Set<JSONRPCMessage>(denied);
  return reject(
    200,
    requests.map((request) =>
      deniedSet.has(request)
        ? denialFor(request)
        : errorPayload(
            request.id,
            ErrorCode.InvalidRequest,
            "Invalid Request: batch rejected because it calls a tool that is not available",
          ),
    ),
    deniedTools,
  );
}

/**
 * Filter a `tools/list` response down to the allowlist.
 *
 * @returns The response with `result.tools` filtered (all other fields kept), or `undefined` when
 *   `message` is not a result response carrying a `tools` array.
 */
export function filterListToolsResponse(message: unknown, allowlist: ToolAllowlist): unknown {
  if (!isRecord(message) || !isRecord(message.result) || !Array.isArray(message.result.tools)) return undefined;
  const tools = message.result.tools.filter((tool: unknown) => isRecord(tool) && allowlist.allows(tool.name));
  return { ...message, result: { ...message.result, tools } };
}

/** Key ({@link requestIdKey}) of a response's id, or `undefined` when `message` is not a response with an id. */
export function responseIdKey(message: unknown): string | undefined {
  if (!isRecord(message) || "method" in message) return undefined;
  if (!("result" in message) && !("error" in message)) return undefined;
  const { id } = message;
  return typeof id === "string" || typeof id === "number" ? requestIdKey(id) : undefined;
}

/** Build a JSON-RPC error response. */
export function errorPayload(id: RequestId | null, code: number, message: string): JsonRpcErrorPayload {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function reject(
  httpStatus: number,
  payload: JsonRpcErrorPayload | JsonRpcErrorPayload[],
  deniedTools: string[],
): InboundVerdict {
  return { kind: "reject", httpStatus, payload, deniedTools };
}

function denialFor(request: JSONRPCRequest): JsonRpcErrorPayload {
  const name = toolNameOf(request);
  return name === undefined
    ? errorPayload(request.id, ErrorCode.InvalidParams, "Invalid params: tools/call requires a tool name")
    : errorPayload(request.id, ErrorCode.InvalidParams, `Unknown tool: ${name}`);
}

function isAllowedCall(message: JSONRPCMessage, allowlist: ToolAllowlist): boolean {
  return isRequest(message) && allowlist.allows(toolNameOf(message));
}

function toolNameOf(message: JSONRPCMessage): string | undefined {
  const params = "params" in message ? message.params : undefined;
  return isRecord(params) && typeof params.name === "string" ? params.name : undefined;
}

function isRequest(message: JSONRPCMessage): message is JSONRPCRequest {
  return "method" in message && "id" in message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
