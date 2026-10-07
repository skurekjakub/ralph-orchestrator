// Custom MCP server following the sidecar launch contract: `--transport http --host <host> --port <port>`,
// stateless Streamable HTTP on /mcp. FIXTURE_TOOLS lists the tool names it registers.
// FIXTURE_BIND_HOST makes it bind that address instead of --host; FIXTURE_MCP_STATUS makes /mcp answer that status.
import { createServer } from "node:http";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const host = process.env.FIXTURE_BIND_HOST ?? arg("--host");
const port = Number(arg("--port"));
const tools = (process.env.FIXTURE_TOOLS ?? "").split(",").filter(Boolean);
const brokenStatus = process.env.FIXTURE_MCP_STATUS ? Number(process.env.FIXTURE_MCP_STATUS) : undefined;

function buildServer() {
  const server = new McpServer({ name: "fixture", version: "1.0.0" });
  for (const name of tools) {
    server.registerTool(name, { description: `The ${name} tool` }, async () => ({
      content: [{ type: "text", text: `called ${name}` }],
    }));
  }
  return server;
}

createServer(async (req, res) => {
  if (req.url !== "/mcp") {
    res.writeHead(404).end();
    return;
  }
  if (brokenStatus !== undefined) {
    req.resume();
    res.writeHead(brokenStatus).end();
    return;
  }
  const server = buildServer();
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}).listen(port, host, () => console.log(`fixture listening on ${host}:${port}`));
