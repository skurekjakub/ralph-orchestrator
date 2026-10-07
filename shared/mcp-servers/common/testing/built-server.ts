import { execFile, spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LISTENING_LINE = /listening on (\S+):(\d+)/;
const START_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 2_000;
const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2025-06-18",
};

/** The fields of `mcp-server.json` the harness launches with. */
interface Manifest {
  command: string;
  args: string[];
  tools: string[];
}

/** A built server bundle started the way the sidecar gateway starts it. */
export interface RunningServer {
  /** The address the server reported binding. */
  host: string;
  port: number;
  /** `http://127.0.0.1:<port>`. */
  baseUrl: string;
  /** Stop the process and delete its run directory. */
  stop(): Promise<void>;
}

/** Options for {@link startBuiltServer} and {@link runBuiltServerToExit}. */
export interface BuiltServerOptions {
  /** Passed as `--host` when set; the server's default applies otherwise. */
  host?: string;
  /** The only environment the process gets besides `PATH`. */
  env?: Record<string, string>;
}

/**
 * Run the package's `build` script.
 *
 * @throws If the build fails; the error carries its output.
 */
export async function buildPackage(packageDir: string): Promise<void> {
  await execFileAsync("npm", ["run", "build"], { cwd: packageDir });
}

/** The tool allowlist in the package's `mcp-server.json`. */
export async function manifestTools(packageDir: string): Promise<string[]> {
  return (await readManifest(packageDir)).tools;
}

/**
 * Start the package's built bundle with the manifest's `command` and `args` plus
 * `--transport http [--host <host>] --port 0`, from a directory that holds only `dist/` and
 * `package.json` (no `node_modules`), as in the sidecar.
 *
 * @throws If the process exits or prints no listening line within 10 seconds.
 */
export async function startBuiltServer(packageDir: string, options: BuiltServerOptions = {}): Promise<RunningServer> {
  const runDir = await copyBundle(packageDir);
  const child = await launch(packageDir, runDir, options, ["--port", "0"]);
  const stop = async (): Promise<void> => {
    await terminate(child);
    await rm(runDir, { recursive: true, force: true });
  };

  try {
    const { host, port } = await waitForListening(child);
    return { host, port, baseUrl: `http://127.0.0.1:${port}`, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}

/**
 * Start the built bundle with `--transport http` and `extraArgs`, and wait for it to exit.
 *
 * @returns The exit code and everything the process wrote to stderr.
 */
export async function runBuiltServerToExit(
  packageDir: string,
  extraArgs: string[],
  options: BuiltServerOptions = {},
): Promise<{ code: number | null; stderr: string }> {
  const runDir = await copyBundle(packageDir);
  try {
    const child = await launch(packageDir, runDir, options, extraArgs);
    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => (stderr += data.toString()));
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (exitCode) => resolve(exitCode));
    });
    return { code, stderr };
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

/**
 * Run the `initialize` handshake and `tools/list` against a stateless Streamable HTTP server.
 *
 * @returns The listed tool names.
 * @throws If either request fails or returns no result.
 */
export async function listToolNames(baseUrl: string): Promise<string[]> {
  await rpc(baseUrl, "initialize", {
    protocolVersion: MCP_HEADERS["mcp-protocol-version"],
    capabilities: {},
    clientInfo: { name: "built-server-test", version: "1.0.0" },
  });
  const result = (await rpc(baseUrl, "tools/list", {})) as { tools: { name: string }[] };
  return result.tools.map((tool) => tool.name);
}

/** This host's non-internal IPv4 addresses. */
export function nonLoopbackIPv4Addresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((infos) => infos ?? [])
    .filter((info) => !info.internal && info.family === "IPv4")
    .map((info) => info.address);
}

/** Non-loopback IPv4 addresses of this host on which `port` accepts TCP connections. */
export async function reachableNonLoopbackAddresses(port: number): Promise<string[]> {
  const candidates = nonLoopbackIPv4Addresses();
  const reachable = await Promise.all(candidates.map((host) => acceptsConnections(host, port)));
  return candidates.filter((_, index) => reachable[index]);
}

async function readManifest(packageDir: string): Promise<Manifest> {
  return JSON.parse(await readFile(join(packageDir, "mcp-server.json"), "utf8")) as Manifest;
}

async function copyBundle(packageDir: string): Promise<string> {
  const runDir = await mkdtemp(join(tmpdir(), "mcp-built-server-"));
  await cp(join(packageDir, "dist"), join(runDir, "dist"), { recursive: true });
  await cp(join(packageDir, "package.json"), join(runDir, "package.json"));
  return runDir;
}

async function launch(
  packageDir: string,
  runDir: string,
  options: BuiltServerOptions,
  extraArgs: string[],
): Promise<ChildProcess> {
  const manifest = await readManifest(packageDir);
  const hostArgs = options.host === undefined ? [] : ["--host", options.host];
  return spawn(
    manifest.command,
    [...manifest.args.map((arg) => join(runDir, arg)), "--transport", "http", ...hostArgs, ...extraArgs],
    { cwd: runDir, env: { PATH: process.env.PATH ?? "", ...options.env }, stdio: ["ignore", "pipe", "pipe"] },
  );
}

function waitForListening(child: ChildProcess): Promise<{ host: string; port: number }> {
  return new Promise((resolve, reject) => {
    let output = "";
    const fail = (reason: string): void => {
      clearTimeout(timer);
      reject(new Error(`${reason}; output:\n${output}`));
    };
    const timer = setTimeout(() => fail("server printed no listening line"), START_TIMEOUT_MS);
    child.stderr?.on("data", (data: Buffer) => (output += data.toString()));
    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
      const match = LISTENING_LINE.exec(output);
      if (!match) return;
      clearTimeout(timer);
      resolve({ host: match[1], port: Number(match[2]) });
    });
    child.once("error", (err) => fail(`server could not be started: ${err.message}`));
    child.once("close", (code) => fail(`server exited with code ${code}`));
  });
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  child.kill("SIGTERM");
  await closed;
}

async function rpc(baseUrl: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const messages = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:") && line.slice(5).trim() !== "")
        .map((line) => JSON.parse(line.slice(5)) as { result?: unknown; error?: unknown })
    : [JSON.parse(text) as { result?: unknown; error?: unknown }];
  const reply = messages.find((message) => "result" in message || "error" in message);
  if (!response.ok || reply?.result === undefined) {
    throw new Error(`${method} failed: HTTP ${response.status} ${text}`);
  }
  return reply.result;
}

function acceptsConnections(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const settle = (reachable: boolean): void => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}
