#!/usr/bin/env node

/**
 * MCP sidecar gateway entry point.
 *
 * Runs the MCP servers listed in `gateway.json` as child processes, fronts every server that has an
 * `allowedTools` list with a tool-filter proxy, and serves the compose health endpoint on port 9000.
 *
 * Usage: node gateway.js <config-path>
 */

import { loadGatewayConfig, type ResolvedGatewayConfig } from "./gateway-config.js";
import { consoleLogger } from "./logger.js";
import { SidecarGateway } from "./sidecar-gateway.js";

const SHUTDOWN_GRACE_MS = 5000;

async function main(): Promise<void> {
  const configPath = process.argv[2];
  if (!configPath) {
    consoleLogger.error("Usage: node gateway.js <config-path>");
    process.exit(1);
  }

  let config: ResolvedGatewayConfig;
  try {
    config = loadGatewayConfig(configPath);
  } catch (err) {
    consoleLogger.error(`[gateway] Failed to read config: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const gateway = new SidecarGateway({ config, logger: consoleLogger });

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    consoleLogger.info("[gateway] Shutting down...");
    gateway.stop().catch((err: unknown) => {
      consoleLogger.error(`[gateway] Error during shutdown: ${err instanceof Error ? err.message : String(err)}`);
    });
    setTimeout(() => {
      gateway.forceKill();
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await gateway.start();
}

main().catch((err: unknown) => {
  consoleLogger.error(`[gateway] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
