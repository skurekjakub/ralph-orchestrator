import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Logger } from "../../logger.js";
import { generateMcpConfig, generateGatewayConfig } from "./mcp-config.js";
import { generateComposeOverlay } from "./compose-overlay.js";
import { generateProfileSquidConf } from "./squid-config.js";
import { generateResourceVolumeMounts, type ResourceConfig } from "./resource-mounts.js";
import { generateAgentVolumeMounts, generateSkillVolumeMounts } from "./artifact-mounts.js";
import { writeCopilotConfig } from "./url-restrictions.js";
import { discoverMcpServers } from "./mcp-manifest.js";

/**
 * Resolve configs for all profiles and write them to each profile's build directory.
 *
 * For each profile that declares `mcpServers`, generates:
 * - `mcp-config.json` — URL-based MCP config pointing to sidecar
 * - `gateway.json` — Sidecar gateway config with embedded secrets
 * - `docker-compose.overlay.yml` — Compose overlay with sidecar service
 * - `squid.conf` — Static baseline squid proxy config (MCP sidecar has direct internet access)
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

    let parsed: { mcpServers?: (string | { name: string })[]; resources?: ResourceConfig; variants?: { stages?: { skills?: string[] }[] }[] };
    try {
      parsed = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
    } catch (err) {
      logger?.warn(`Skipping profile ${profileId.name}: failed to parse profile.json — ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const serverNames = (parsed.mcpServers ?? []).map((s) => typeof s === "string" ? s : s.name);
    logger?.info(`Setting up profile ${profileId.name} (${serverNames.length} MCP server${serverNames.length === 1 ? "" : "s"})`);

    const config = generateMcpConfig(mcpServersDir, serverNames);
    const gatewayConfig = generateGatewayConfig(mcpServersDir, serverNames, process.env);

    const buildDir = join(profilesDir, profileId.name, ".build");
    rmSync(buildDir, { recursive: true, force: true });
    mkdirSync(buildDir, { recursive: true });

    // World-writable so the vscode user inside containers can create files
    const attachDir = join(buildDir, "attachments");
    mkdirSync(attachDir);
    chmodSync(attachDir, 0o777);

    // .gitignore files mounted into /workspace/.ralph/ and /workspace/.github/skills/
    // to hide orchestrator-managed runtime files from git inside the container
    writeFileSync(join(buildDir, ".gitignore"), "*\n", "utf-8");
    writeFileSync(join(buildDir, "github-gitignore"), "*\n", "utf-8");

    writeFileSync(
      join(buildDir, "mcp-config.json"),
      JSON.stringify(config, null, 2) + "\n",
      "utf-8",
    );

    writeFileSync(
      join(buildDir, "gateway.json"),
      JSON.stringify(gatewayConfig, null, 2) + "\n",
      "utf-8",
    );

    const profileDir = join(profilesDir, profileId.name);
    const resourceVolumes = parsed.resources
      ? generateResourceVolumeMounts(profileDir, parsed.resources)
      : [];
    const agentVolumes = generateAgentVolumeMounts(profileDir);
    const skillNames = [...new Set(
      (parsed.variants ?? []).flatMap((v) =>
        (v.stages ?? []).flatMap((s) => s.skills ?? []),
      ),
    )];
    const skillVolumes = generateSkillVolumeMounts(skillsDir, skillNames);

    const extraVolumes = [...agentVolumes, ...skillVolumes, ...resourceVolumes];

    const overlay = generateComposeOverlay(mcpServersDir, serverNames, buildDir, sidecarDir, extraVolumes);
    writeFileSync(
      join(buildDir, "docker-compose.overlay.yml"),
      overlay,
      "utf-8",
    );

    if (hasBaselineSquid) {
      const squidConf = generateProfileSquidConf(baselineSquidPath);
      writeFileSync(join(buildDir, "squid.conf"), squidConf, "utf-8");

      if (logger) {
        const domains = squidConf
          .split("\n")
          .filter((l) => l.startsWith("acl allowed_domains dstdomain"))
          .map((l) => l.replace("acl allowed_domains dstdomain ", ""));
        logger.info(`  → squid.conf: ${domains.length} allowed domain${domains.length === 1 ? "" : "s"}: ${domains.join(", ")}`);
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
