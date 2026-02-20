#!/usr/bin/env node

/**
 * MCP Sidecar Gateway
 *
 * Lightweight process manager that spawns MCP servers as child processes
 * and exposes a health endpoint for compose healthchecks.
 *
 * Custom servers run natively with `--transport http --port PORT`.
 * npm servers are bridged via supergateway (stdio → Streamable HTTP).
 *
 * Usage: node gateway.js <config-path>
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Timestamped logging
// ---------------------------------------------------------------------------

function ts(): string {
  return new Date().toISOString();
}

function log(msg: string): void {
  console.log(`${ts()} ${msg}`);
}

function logErr(msg: string): void {
  console.error(`${ts()} ${msg}`);
}

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

enum ServerType {
  Custom = "custom",
  Npm = "npm",
}

interface ServerConfig {
  name: string;
  type: ServerType;
  port: number;
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface GatewayConfig {
  servers: ServerConfig[];
}

// ---------------------------------------------------------------------------
// Server process state
// ---------------------------------------------------------------------------

enum ServerStatus {
  Starting = "starting",
  Running = "running",
  Crashed = "crashed",
  Stopped = "stopped",
}

interface ManagedServer {
  config: ServerConfig;
  process: ChildProcess | null;
  status: ServerStatus;
  restarts: number;
  lastError: string | null;
}

const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 1000;
const HEALTH_PORT = 9000;

const servers = new Map<string, ManagedServer>();

// ---------------------------------------------------------------------------
// Process spawning
// ---------------------------------------------------------------------------

function spawnServer(managed: ManagedServer): void {
  const { config } = managed;
  managed.status = ServerStatus.Starting;

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...config.env,
  };

  let command: string;
  let args: string[];

  if (config.type === ServerType.Custom) {
    command = config.command;
    args = [...config.args, "--transport", "http", "--port", String(config.port)];
  } else {
    // npm servers: use supergateway to bridge stdio → Streamable HTTP
    command = "supergateway";
    args = [
      "--stdio", [config.command, ...config.args].join(" "),
      "--outputTransport", "streamableHttp",
      "--port", String(config.port),
    ];
  }

  log(`[gateway] Starting ${config.name} (${config.type}) on port ${config.port}: ${command} ${args.join(" ")}`);

  const child = spawn(command, args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  managed.process = child;

  log(`[gateway] ${config.name} spawned (pid=${child.pid})`);

  child.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      log(`[${config.name}] ${line}`);
      // Detect successful startup from the server's log output
      if (line.includes("listening") || line.includes("started") || line.includes("ready")) {
        managed.status = ServerStatus.Running;
      }
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) logErr(`[${config.name}] ${line}`);
    managed.lastError = line;
  });

  child.on("error", (err) => {
    logErr(`[gateway] Failed to spawn ${config.name}: ${err.message}`);
    managed.status = ServerStatus.Crashed;
    managed.lastError = err.message;
    managed.process = null;
    scheduleRestart(managed);
  });

  // Use 'close' instead of 'exit' — 'close' fires after stdio streams are flushed,
  // so any final stderr output is captured in the log before we report the crash.
  child.on("close", (code, signal) => {
    if (managed.status === ServerStatus.Stopped) return; // intentional stop

    logErr(`[gateway] ${config.name} exited (pid=${child.pid}, code=${code}, signal=${signal}, lastError=${managed.lastError ?? "none"})`);
    managed.status = ServerStatus.Crashed;
    managed.process = null;
    scheduleRestart(managed);
  });

  // Assume running after a brief delay if no explicit startup message
  setTimeout(() => {
    if (managed.status === ServerStatus.Starting && managed.process && !managed.process.killed) {
      managed.status = ServerStatus.Running;
    }
  }, 2000);
}

function scheduleRestart(managed: ManagedServer): void {
  if (managed.restarts >= MAX_RESTARTS) {
    logErr(`[gateway] ${managed.config.name} exceeded max restarts (${MAX_RESTARTS}), giving up`);
    return;
  }

  managed.restarts++;
  log(`[gateway] Restarting ${managed.config.name} in ${RESTART_DELAY_MS}ms (attempt ${managed.restarts}/${MAX_RESTARTS})`);

  setTimeout(() => {
    if (managed.status !== ServerStatus.Stopped) {
      spawnServer(managed);
    }
  }, RESTART_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

function startHealthServer(): void {
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/health" && req.method === "GET") {
      const serverStatuses: Record<string, { status: string; port: number; restarts: number; lastError: string | null }> = {};
      let allHealthy = true;

      for (const [name, managed] of servers) {
        serverStatuses[name] = {
          status: managed.status,
          port: managed.config.port,
          restarts: managed.restarts,
          lastError: managed.lastError,
        };
        if (managed.status !== ServerStatus.Running) {
          allHealthy = false;
        }
      }

      const statusCode = allHealthy ? 200 : 503;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ healthy: allHealthy, servers: serverStatuses }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  httpServer.listen(HEALTH_PORT, "0.0.0.0", () => {
    log(`[gateway] Health endpoint listening on port ${HEALTH_PORT}`);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(): void {
  log("[gateway] Shutting down...");
  for (const [name, managed] of servers) {
    managed.status = ServerStatus.Stopped;
    if (managed.process && !managed.process.killed) {
      log(`[gateway] Stopping ${name}`);
      managed.process.kill("SIGTERM");
    }
  }

  // Force kill after 5 seconds
  setTimeout(() => {
    for (const [, managed] of servers) {
      if (managed.process && !managed.process.killed) {
        managed.process.kill("SIGKILL");
      }
    }
    process.exit(0);
  }, 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const configPath = process.argv[2];
  if (!configPath) {
    logErr("Usage: node gateway.js <config-path>");
    process.exit(1);
  }

  let config: GatewayConfig;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    logErr(`[gateway] Failed to read config: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (!config.servers || config.servers.length === 0) {
    log("[gateway] No servers configured, running health endpoint only");
    startHealthServer();
    return;
  }

  log(`[gateway] Starting ${config.servers.length} MCP server(s)`);

  for (const serverConfig of config.servers) {
    const managed: ManagedServer = {
      config: serverConfig,
      process: null,
      status: ServerStatus.Starting,
      restarts: 0,
      lastError: null,
    };
    servers.set(serverConfig.name, managed);
    spawnServer(managed);
  }

  startHealthServer();
}

main();
