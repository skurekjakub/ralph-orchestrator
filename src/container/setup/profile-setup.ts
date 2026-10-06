import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Logger } from "../../logger.js";
import { readProfileFile, resolveProfileVariants } from "../../config/profile-variants.js";
import type { ProfileFile } from "../../config/schemas.js";
import type { IAgentProfile } from "../../config/types.js";
import { toErrorMessage } from "../../util/error.js";
import { generateMcpConfig, generateGatewayConfig } from "./mcp-config.js";
import { generateComposeOverlay } from "./compose-overlay.js";
import { generateProfileSquidConf } from "./squid-config.js";
import { generateResourceVolumeMounts } from "./resource-mounts.js";
import { generateAgentVolumeMounts, generateSkillVolumeMounts } from "./artifact-mounts.js";
import { writeCopilotConfig } from "./url-restrictions.js";
import { discoverMcpServers, loadMcpManifest } from "./mcp-manifest.js";

/**
 * Generate a `pre-init.sh` script that sources each active server's `initScript`
 * before the gateway launches. Scripts run in declaration order with failures
 * logged but non-fatal (the gateway still starts).
 *
 * @returns Script content, or `null` if no servers declare init scripts.
 */
export function generatePreInitScript(mcpServersDir: string, serverNames: string[]): string | null {
  const entries: { name: string; scriptPath: string }[] = [];

  for (const name of serverNames) {
    const manifest = loadMcpManifest(mcpServersDir, name);
    if (manifest.initScript) {
      entries.push({ name, scriptPath: `/opt/mcp/servers/${name}/${manifest.initScript}` });
    }
  }

  if (entries.length === 0) return null;

  const lines = [
    "#!/bin/bash",
    "# Auto-generated — runs MCP server init scripts before the gateway starts.",
    "# Each script runs with set +e so failures are non-fatal.",
    "",
  ];

  for (const { name, scriptPath } of entries) {
    lines.push(`echo "$(date -Iseconds) [pre-init] Running init script for '${name}'..."`);
    lines.push(`if bash "${scriptPath}"; then`);
    lines.push(`  echo "$(date -Iseconds) [pre-init] '${name}' init complete"`);
    lines.push("else");
    lines.push(`  echo "$(date -Iseconds) [pre-init] '${name}' init failed (non-fatal, continuing)"`);
    lines.push("fi");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Resolve configs for all profiles and write them to each profile's build directory.
 *
 * For each profile that declares `mcpServers`, generates:
 * - `mcp-config.json` — URL-based MCP config pointing to sidecar
 * - `gateway.json` — Sidecar gateway config with embedded secrets
 * - `docker-compose.overlay.yml` — Compose overlay with sidecar service
 * - `squid.conf` — Baseline squid proxy config augmented with profile-level allowlist domains
 * - `copilot-config.json` — Copilot CLI config with URL allowlist derived from squid.conf
 *
 * All files go to `profiles/<id>/.build/`. The compose overlay is passed as
 * a third `-f` argument to `docker compose` by {@link ComposeFileResolver}.
 *
 * @param rootDir Workspace root (defaults to cwd).
 * @param logger Logger for progress and error reporting.
 */
export function resolveAllProfileSetup(rootDir?: string, logger?: Logger): void {
  const root = rootDir ?? process.cwd();
  const mcpServersDir = resolve(root, "shared/mcp-servers");
  const sidecarDir = resolve(root, "shared/mcp-sidecar");
  const skillsDir = resolve(root, "shared/skills");
  const profilesDir = resolve(root, "profiles");
  const baselineSquidPath = resolve(root, "shared/security/squid.conf");

  if (!existsSync(profilesDir)) {
    logger?.warn("Profiles directory not found, skipping profile setup");
    return;
  }

  const hasBaselineSquid = existsSync(baselineSquidPath);
  if (!hasBaselineSquid) {
    logger?.warn("Baseline squid.conf not found — squid configs will not be generated");
  }

  // Verify MCP servers directory is valid (used for per-profile gateway config).
  const allServerNames = discoverMcpServers(mcpServersDir);
  if (allServerNames.length > 0) {
    logger?.info(`Discovered ${allServerNames.length} MCP server(s): ${allServerNames.join(", ")}`);
  }

  for (const profileId of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!profileId.isDirectory()) continue;

    const profileJsonPath = join(profilesDir, profileId.name, "profile.json");
    if (!existsSync(profileJsonPath)) continue;

    let parsed: ProfileFile;
    let variants: IAgentProfile[];
    try {
      parsed = readProfileFile(profileJsonPath);
      variants = resolveProfileVariants(parsed, profileId.name);
    } catch (err) {
      logger?.warn(`Skipping profile ${profileId.name}: invalid profile.json — ${toErrorMessage(err)}`);
      continue;
    }

    const serverNames = [...new Set(variants.flatMap((v) => v.mcpServers))];
    logger?.info(
      `Setting up profile ${profileId.name} (${serverNames.length} MCP server${serverNames.length === 1 ? "" : "s"})`,
    );

    // Startup mcp-config includes ALL servers (union). Per-task writer narrows to variant scope.
    const config = generateMcpConfig(mcpServersDir, serverNames);
    const gatewayConfig = generateGatewayConfig(mcpServersDir, serverNames, process.env);

    const buildDir = join(profilesDir, profileId.name, ".build");
    rmSync(buildDir, { recursive: true, force: true });
    mkdirSync(buildDir, { recursive: true });

    // World-writable so the vscode user inside containers can create files
    const attachDir = join(buildDir, "attachments");
    mkdirSync(attachDir);
    chmodSync(attachDir, 0o777);

    // .gitignore file mounted into /workspace/.ralph/
    // to hide orchestrator-managed runtime files from git inside the container
    writeFileSync(join(buildDir, ".gitignore"), "*\n", "utf-8");

    writeFileSync(join(buildDir, "mcp-config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");

    writeFileSync(join(buildDir, "gateway.json"), JSON.stringify(gatewayConfig, null, 2) + "\n", "utf-8");

    const profileDir = join(profilesDir, profileId.name);
    const resourceVolumes = parsed.resources ? generateResourceVolumeMounts(profileDir, parsed.resources) : [];
    const agentVolumes = generateAgentVolumeMounts(profileDir);
    const skillNames = [...new Set(variants.flatMap((v) => v.skills))];
    const skillVolumes = generateSkillVolumeMounts(skillsDir, skillNames);

    const extraVolumes = [...agentVolumes, ...skillVolumes, ...resourceVolumes];

    const sidecarEnv: Record<string, string> = Object.assign({}, ...variants.map((v) => v.mcpSidecarEnv));

    // Generate pre-init script from MCP server initScript declarations.
    const preInitScript = generatePreInitScript(mcpServersDir, serverNames);
    if (preInitScript) {
      const preInitPath = join(buildDir, "pre-init.sh");
      writeFileSync(preInitPath, preInitScript, "utf-8");
      chmodSync(preInitPath, 0o755);
    }

    const overlay = generateComposeOverlay(
      mcpServersDir,
      serverNames,
      buildDir,
      sidecarDir,
      extraVolumes,
      sidecarEnv,
      preInitScript !== null,
    );
    writeFileSync(join(buildDir, "docker-compose.overlay.yml"), overlay, "utf-8");

    if (hasBaselineSquid) {
      const squidConf = generateProfileSquidConf(baselineSquidPath, parsed.allowlistDomains);
      writeFileSync(join(buildDir, "squid.conf"), squidConf, "utf-8");

      if (logger) {
        const domains = squidConf
          .split("\n")
          .filter((l) => l.startsWith("acl allowed_domains dstdomain"))
          .map((l) => l.replace("acl allowed_domains dstdomain ", ""));
        logger.info(
          `  → squid.conf: ${domains.length} allowed domain${domains.length === 1 ? "" : "s"}: ${domains.join(", ")}`,
        );
      }
    }

    // Generate Copilot CLI config with URL allowlist derived from squid.conf.
    // Must run after squid.conf is written (reads it to discover allowed domains).
    writeCopilotConfig(buildDir);

    if (logger) {
      const copilotConfigPath = join(buildDir, "copilot-config.json");
      if (existsSync(copilotConfigPath)) {
        const copilotConfig = JSON.parse(readFileSync(copilotConfigPath, "utf-8"));
        const urls: string[] = copilotConfig.allowed_urls ?? [];
        logger.info(`  → copilot-config.json: ${urls.length} allowed URL${urls.length === 1 ? "" : "s"}:`);
        for (const url of urls) {
          logger.info(`      ${url}`);
        }
      }
    }

    const files = ["mcp-config.json", "gateway.json", "docker-compose.overlay.yml"];
    if (hasBaselineSquid) files.push("squid.conf", "copilot-config.json");
    logger?.info(`  → wrote ${files.join(", ")}`);
  }
}
