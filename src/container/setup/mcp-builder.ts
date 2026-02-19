import { execa } from "execa";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServerType, loadMcpManifest } from "./mcp-config.js";
import type { Logger } from "../../logger.js";

/**
 * Build all custom MCP servers that have a `build` script in their package.json.
 *
 * Runs `npm install` + `npm run build` host-side so that the bundled output
 * (e.g. `dist/bundle.mjs`) can be mounted read-only into containers with
 * no further installation needed.
 *
 * @param rootDir Workspace root (defaults to cwd).
 * @param logger Logger for build progress output.
 */
export async function buildCustomMcpServers(logger: Logger, rootDir?: string): Promise<void> {
  const root = rootDir ?? process.cwd();
  const mcpServersDir = resolve(root, "shared/mcp-servers");

  if (!existsSync(mcpServersDir)) return;

  const serverDirs = readdirSync(mcpServersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(mcpServersDir, d.name, "mcp-server.json")));

  for (const dir of serverDirs) {
    const manifest = loadMcpManifest(mcpServersDir, dir.name);
    if (manifest.type !== McpServerType.Custom) continue;

    const serverDir = join(mcpServersDir, dir.name);
    if (!existsSync(join(serverDir, "package.json"))) continue;

    logger.info(`Building MCP server: ${dir.name}`);

    await execa("npm", ["install"], { cwd: serverDir, stdio: "pipe" });
    await execa("npm", ["run", "build"], { cwd: serverDir, stdio: "pipe" });

    logger.info(`MCP server built: ${dir.name}`);
  }
}
