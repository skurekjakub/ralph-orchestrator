---
applyTo: "shared/mcp-servers/**"
---

# MCP Tool Name Discovery

When working with MCP servers — adding tools to agent includes, updating manifests, or debugging tool invocations — always verify actual tool names by querying the server directly.

## How to discover tool names

Run a MCP client against the server using `tools/list`. From a directory with `@modelcontextprotocol/sdk` installed (e.g. `shared/mcp-servers/jira-kentico/`):

```js
node -e "
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({
  command: '<command>',
  args: [<args>],
  env: { ...process.env, <REQUIRED_ENV>: 'dummy' }
});
const client = new Client({ name: 'tool-lister', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
for (const t of tools) console.log(t.name + ' — ' + (t.description || '').slice(0, 80));
await client.close();
process.exit(0);
"
```

Replace `<command>`, `<args>`, and `<REQUIRED_ENV>` with values from the server's `mcp-server.json`.

## Why this matters

- npm MCP packages may use different tool names than their documentation suggests (e.g. `repo_update_pull_request_thread` vs. `repo_resolve_comment`)
- Documentation sites often show client-prefixed names (`mcp_ado_repo_*`) which are not the actual server-side tool names
- Tool names can change between package versions
