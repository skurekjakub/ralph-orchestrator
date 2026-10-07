// Stdio MCP server for the bridge tests. FIXTURE_TOOLS lists plain tools that answer "called <name>";
// the other tools exercise the bridge: process state, crashes, progress, notifications, cancellation.
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

const server = new McpServer({ name: "stdio-fixture", version: "1.0.0" }, { capabilities: { logging: {} } });
const text = (value) => ({ content: [{ type: "text", text: String(value) }] });
let calls = 0;
let cancellations = 0;

for (const name of (process.env.FIXTURE_TOOLS ?? "echo,secret").split(",").filter(Boolean)) {
  server.registerTool(name, { description: `The ${name} tool` }, async () => text(`called ${name}`));
}

server.registerTool("count", { description: "Counts its calls in this process" }, async () => text(++calls));

server.registerTool("crash", { description: "Exits the process mid-call" }, async () => process.exit(1));

server.registerTool("progress", { description: "Reports progress twice" }, async (ctx) => {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken !== undefined) {
    for (const progress of [1, 2]) {
      await ctx.mcpReq.notify({ method: "notifications/progress", params: { progressToken, progress, total: 2 } });
    }
  }
  return text("done");
});

server.registerTool("announce", { description: "Announces a changed tool list" }, async () => {
  server.sendToolListChanged();
  return text("announced");
});

server.registerTool("garbage", { description: "Writes a line that is JSON but not JSON-RPC" }, async () => {
  process.stdout.write('{"not":"json-rpc"}\n');
  return text("after garbage");
});

server.registerTool(
  "wait",
  { description: "Reports progress once waiting, waits until cancelled, then logs it" },
  async (ctx) => {
    const { signal } = ctx.mcpReq;
    const cancelled = new Promise((resolve) =>
      signal.aborted ? resolve() : signal.addEventListener("abort", resolve, { once: true }),
    );
    const progressToken = ctx.mcpReq._meta?.progressToken;
    if (progressToken !== undefined) {
      await ctx.mcpReq.notify({ method: "notifications/progress", params: { progressToken, progress: 0 } });
    }
    await cancelled;
    cancellations++;
    await server.sendLoggingMessage({ level: "info", data: "wait cancelled" });
    return text("cancelled");
  },
);

server.registerTool("cancellations", { description: "Counts cancelled waits" }, async () => text(cancellations));

server.registerTool("ping_client", { description: "Pings the client" }, async () => {
  await server.server.ping();
  return text("pong");
});

await server.connect(new StdioServerTransport());
