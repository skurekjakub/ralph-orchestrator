import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { IAgentProfile } from "../../config/types.js";
import type { Logger } from "../../logger.js";
import { generateAgentVolumeMounts, generateSkillVolumeMounts } from "./artifact-mounts.js";
import { generateResourceVolumeMounts, type ResourceConfig } from "./resource-mounts.js";
import { generateComposeOverlay } from "./compose-overlay.js";
import { generateMcpConfig, generateGatewayConfig } from "./mcp-config.js";

/**
 * Regenerates the Docker Compose overlay, mcp-config.json, and gateway.json
 * per-task, scoping all three to the matched variant's effective MCP server
 * list and skill mounts.
 */
export interface IComposeOverlayWriter {
  /** Regenerate the compose overlay and MCP configs for a profile's task-scoped state. */
  write(profile: IAgentProfile, logger: Logger): void;
}

/**
 * Per-task compose overlay writer.
 *
 * At startup, {@link resolveAllProfileSetup} generates the overlay with the
 * union of all variants' skills. Before each task, this writer regenerates
 * the overlay using only the matched variant's `profile.skills`, keeping
 * agent and resource mounts unchanged.
 */
export class ComposeOverlayWriter implements IComposeOverlayWriter {
  write(profile: IAgentProfile, logger: Logger): void {
    const root = process.cwd();
    const profileDir = resolve(root, "profiles", profile.id);
    const buildDir = resolve(profileDir, ".build");
    const skillsDir = resolve(root, "shared/skills");
    const mcpServersDir = resolve(root, "shared/mcp-servers");
    const sidecarDir = resolve(root, "shared/mcp-sidecar");

    const serverNames = [...profile.mcpServers];
    const agentVolumes = generateAgentVolumeMounts(profileDir);
    const skillVolumes = generateSkillVolumeMounts(skillsDir, [...profile.skills]);

    let resourceVolumes: string[] = [];
    const profileJsonPath = resolve(profileDir, "profile.json");
    if (existsSync(profileJsonPath)) {
      try {
        const parsed: { resources?: ResourceConfig } = JSON.parse(readFileSync(profileJsonPath, "utf-8"));
        if (parsed.resources) {
          resourceVolumes = generateResourceVolumeMounts(profileDir, parsed.resources);
        }
      } catch {
        // Resources are optional — skip on parse error
      }
    }

    const extraVolumes = [...agentVolumes, ...skillVolumes, ...resourceVolumes];
    const sidecarEnv: Record<string, string> = { ...profile.mcpSidecarEnv };
    const hasPreInit = existsSync(resolve(buildDir, "pre-init.sh"));
    const overlay = generateComposeOverlay(mcpServersDir, serverNames, buildDir, sidecarDir, extraVolumes, sidecarEnv, hasPreInit);

    writeFileSync(resolve(buildDir, "docker-compose.overlay.yml"), overlay, "utf-8");

    // Regenerate mcp-config.json with the variant's effective server list
    const mcpConfig = generateMcpConfig(mcpServersDir, serverNames);
    writeFileSync(resolve(buildDir, "mcp-config.json"), JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");

    // Regenerate gateway.json so the sidecar only starts the variant's servers.
    // JitMcpConfigWriter runs after this to inject task-scoped env vars.
    const gatewayConfig = generateGatewayConfig(mcpServersDir, serverNames, process.env);
    writeFileSync(resolve(buildDir, "gateway.json"), JSON.stringify(gatewayConfig, null, 2) + "\n", "utf-8");

    logger.info(`Regenerated compose overlay, mcp-config, and gateway with ${profile.skills.length} skill mount(s), ${serverNames.length} MCP server(s)`);
  }
}
