import { readFileSync } from "node:fs";

/** How the gateway runs a server. */
export enum ServerType {
  /** Serves Streamable HTTP itself, on the host and port the gateway passes. */
  Custom = "custom",
  /** Speaks MCP over stdio; the gateway bridges it in process and serves it only through the tool-filter proxy. */
  Npm = "npm",
}

/** One server entry of `gateway.json`, written by the orchestrator (`generateGatewayConfig`). */
export interface ServerConfig {
  name: string;
  type: ServerType;
  /** Agent-facing port: the URL in the agent's `mcp-config.json` is `http://mcp-sidecar:<port>/mcp`. */
  port: number;
  command: string;
  args: string[];
  env: Record<string, string>;
  /**
   * Enforced tool allowlist; required for npm servers. When present, `port` is served by the
   * tool-filter proxy, and a custom server listens on a loopback-only upstream port behind it.
   * When absent, a custom server listens on `port` itself and exposes every tool.
   */
  allowedTools?: string[];
}

/** Content of `gateway.json`. */
export interface GatewayConfig {
  servers: ServerConfig[];
}

/** A validated server entry with its derived listening layout. */
export interface ResolvedServerConfig extends ServerConfig {
  /**
   * Loopback port a filtered custom server listens on behind the proxy; `null` for an unfiltered
   * server and for an npm server, which the gateway reaches over stdio.
   */
  upstreamPort: number | null;
}

/** Validated `gateway.json`. */
export interface ResolvedGatewayConfig {
  servers: ResolvedServerConfig[];
}

/** Port of the gateway health endpoint (compose healthcheck target). */
export const HEALTH_PORT = 9000;

/** Distance between a filtered server's agent-facing port and its loopback upstream port. */
export const UPSTREAM_PORT_OFFSET = 10000;

const MAX_PORT = 65535;

/**
 * Read and validate `gateway.json`.
 *
 * @throws If the file is unreadable, is not JSON, or fails {@link parseGatewayConfig}.
 */
export function loadGatewayConfig(path: string, healthPort: number = HEALTH_PORT): ResolvedGatewayConfig {
  return parseGatewayConfig(JSON.parse(readFileSync(path, "utf-8")), healthPort);
}

/**
 * Validate a parsed `gateway.json` and derive each filtered custom server's upstream port
 * (`port + UPSTREAM_PORT_OFFSET`).
 *
 * A missing or empty `servers` list is valid (the gateway then serves only its health endpoint).
 *
 * @throws If an entry is malformed, a name repeats, `allowedTools` is not a non-empty list of
 *   unique non-empty strings or is missing on an npm server, or any two listening ports (health,
 *   agent-facing, upstream) collide.
 */
export function parseGatewayConfig(raw: unknown, healthPort: number = HEALTH_PORT): ResolvedGatewayConfig {
  if (!isRecord(raw)) throw new Error("gateway config must be a JSON object");
  if (raw.servers === undefined) return { servers: [] };
  if (!Array.isArray(raw.servers)) throw new Error("gateway config: servers must be an array");

  const servers = raw.servers.map((entry, index) => parseServer(entry, index));

  const names = new Set<string>();
  const portOwners = new Map<number, string>([[healthPort, "the health endpoint"]]);
  const claimPort = (port: number, owner: string): void => {
    const existing = portOwners.get(port);
    if (existing) throw new Error(`gateway config: port ${port} of ${owner} collides with ${existing}`);
    portOwners.set(port, owner);
  };

  for (const server of servers) {
    if (names.has(server.name)) throw new Error(`gateway config: duplicate server name "${server.name}"`);
    names.add(server.name);
    claimPort(server.port, `server "${server.name}"`);
    if (server.upstreamPort !== null) claimPort(server.upstreamPort, `server "${server.name}" (upstream)`);
  }

  return { servers };
}

function parseServer(entry: unknown, index: number): ResolvedServerConfig {
  const where = `gateway config: servers[${index}]`;
  if (!isRecord(entry)) throw new Error(`${where} must be an object`);

  const { name, type, port, command, args, env, allowedTools } = entry;
  if (typeof name !== "string" || name === "") throw new Error(`${where}: name must be a non-empty string`);
  const at = `gateway config: server "${name}"`;

  if (type !== ServerType.Custom && type !== ServerType.Npm) {
    throw new Error(`${at}: type must be "${ServerType.Custom}" or "${ServerType.Npm}"`);
  }
  if (!isPort(port)) throw new Error(`${at}: port must be an integer between 1 and ${MAX_PORT}`);
  if (typeof command !== "string" || command === "") throw new Error(`${at}: command must be a non-empty string`);
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) {
    throw new Error(`${at}: args must be an array of strings`);
  }
  if (!isRecord(env) || Object.values(env).some((v) => typeof v !== "string")) {
    throw new Error(`${at}: env must be an object of string values`);
  }

  if (allowedTools === undefined) {
    if (type === ServerType.Npm) {
      throw new Error(
        `${at}: allowedTools is required, because npm servers are served only through the tool-filter proxy`,
      );
    }
    return {
      name,
      type,
      port,
      command,
      args: args as string[],
      env: env as Record<string, string>,
      upstreamPort: null,
    };
  }

  if (
    !Array.isArray(allowedTools) ||
    allowedTools.length === 0 ||
    allowedTools.some((t) => typeof t !== "string" || t === "")
  ) {
    throw new Error(`${at}: allowedTools must be a non-empty array of non-empty strings`);
  }
  if (new Set(allowedTools).size !== allowedTools.length) {
    throw new Error(`${at}: allowedTools must not contain duplicates`);
  }
  const upstreamPort = type === ServerType.Custom ? port + UPSTREAM_PORT_OFFSET : null;
  if (upstreamPort !== null && upstreamPort > MAX_PORT) {
    throw new Error(
      `${at}: port ${port} leaves no room for its upstream port (${port} + ${UPSTREAM_PORT_OFFSET} > ${MAX_PORT})`,
    );
  }

  return {
    name,
    type,
    port,
    command,
    args: args as string[],
    env: env as Record<string, string>,
    allowedTools: allowedTools as string[],
    upstreamPort,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_PORT;
}
