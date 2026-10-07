import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

export interface ConnectedClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

/** Connect a real MCP SDK client (Streamable HTTP) to `url` and complete the initialize handshake. */
export async function connectClient(url: URL): Promise<ConnectedClient> {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport);
  return { client, transport };
}

/** Headers a Streamable HTTP client sends with a POST. */
export const MCP_POST_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

/** POST a raw body to an MCP endpoint. */
export function postRaw(url: URL, body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, { method: "POST", headers: { ...MCP_POST_HEADERS, ...headers }, body });
}

/** POST bytes to an MCP endpoint with exactly `headers` besides `accept`, so no Content-Type unless given. */
export function postBytes(
  url: URL,
  body: Uint8Array<ArrayBuffer>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(url, { method: "POST", headers: { accept: MCP_POST_HEADERS.accept, ...headers }, body });
}

/** Parse an MCP POST response body, whether JSON or a `text/event-stream` of message events. */
export async function readMessages(response: Response): Promise<unknown[]> {
  const text = await response.text();
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "")
      .map((line) => JSON.parse(line.slice(5)));
  }
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}
