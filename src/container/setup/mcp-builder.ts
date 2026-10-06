import { execa } from "execa";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServerType, loadMcpManifest } from "./mcp-manifest";
import type { Logger } from "../../logger";

/**
 * Build all custom MCP servers and the MCP sidecar gateway.
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

  const buildTasks: Promise<void>[] = [];

  if (existsSync(mcpServersDir)) {
    const serverDirs = readdirSync(mcpServersDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => existsSync(join(mcpServersDir, d.name, "mcp-server.json")));

    for (const dir of serverDirs) {
      const manifest = loadMcpManifest(mcpServersDir, dir.name);
      if (manifest.type !== McpServerType.Custom) continue;

      const serverDir = join(mcpServersDir, dir.name);
      if (!existsSync(join(serverDir, "package.json"))) continue;

      buildTasks.push(buildServer(dir.name, serverDir, logger));
    }
  }

  buildTasks.push(buildSidecarGateway(root, logger));

  await Promise.all(buildTasks);
}

async function buildServer(name: string, serverDir: string, logger: Logger): Promise<void> {
  logger.info(`Building MCP server: ${name}`);
  await execa("npm", ["install"], { cwd: serverDir, stdio: "pipe" });
  await execa("npm", ["run", "build"], { cwd: serverDir, stdio: "pipe" });
  logger.info(`MCP server built: ${name}`);
}

/**
 * Build the MCP sidecar gateway (`shared/mcp-sidecar/`).
 *
 * The compiled `dist/` is volume-mounted into the sidecar container at runtime,
 * so it must be built before `docker compose up` runs.
 */
async function buildSidecarGateway(root: string, logger: Logger): Promise<void> {
  const sidecarDir = resolve(root, "shared/mcp-sidecar");
  if (!existsSync(join(sidecarDir, "package.json"))) return;

  logger.info("Building MCP sidecar gateway");

  await execa("npm", ["install"], { cwd: sidecarDir, stdio: "pipe" });
  await execa("npm", ["run", "build"], { cwd: sidecarDir, stdio: "pipe" });

  logger.info("MCP sidecar gateway built");
}
