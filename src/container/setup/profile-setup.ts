import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ICliRuntimeRegistry } from "../../cli/cli-runtime";
import type { Logger } from "../../logger";
import { readProfileFile, resolveProfileVariants } from "../../config/profile-variants";
import type { IAgentProfile } from "../../config/types";
import { toErrorMessage } from "../../util/error";
import { AgentCatalogProvider } from "./agent-catalogs";
import { profileBuildPaths } from "./build-paths";
import { writeComposeArtifacts } from "./compose-overlay-writer";
import { discoverMcpServers, loadMcpManifest } from "./mcp-manifest";

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

/** Everything startup profile setup needs. */
export interface ProfileSetupInput {
  readonly cliRuntimes: ICliRuntimeRegistry;
  readonly logger: Logger;
  /** The orchestrator checkout root; defaults to the working directory. */
  readonly rootDir?: string;
}

/**
 * One profile standing for all of its variants: the union of their MCP servers, sidecar env, skills and
 * container-stage CLIs, so startup artifacts cover whichever variant runs first.
 */
function allVariantsOf(variants: readonly IAgentProfile[]): IAgentProfile {
  const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
  return {
    ...variants[0],
    mcpServers: unique(variants.flatMap((v) => v.mcpServers)),
    mcpSidecarEnv: Object.assign({}, ...variants.map((v) => v.mcpSidecarEnv)),
    skills: unique(variants.flatMap((v) => v.skills)),
    containerClis: unique(variants.flatMap((v) => v.containerClis)),
  };
}

/**
 * Recreate every profile's build directory at startup.
 *
 * For each profile, clears `profiles/<id>/.build/` and writes the files that do not change per task (the
 * world-writable `attachments/` directory, the `.gitignore` mounted into `/workspace/.ralph/` and the MCP
 * `pre-init.sh`), then the task-scoped artifacts of {@link writeComposeArtifacts} for the union of the
 * profile's variants. Each task regenerates the task-scoped ones for its own variant before the containers
 * start. A profile whose profile.json is invalid is skipped with a warning.
 *
 * @throws Error when a profile's agent templates are invalid or a CLI's artifact inputs are missing or malformed.
 */
export async function resolveAllProfileSetup({
  cliRuntimes,
  logger,
  rootDir = process.cwd(),
}: ProfileSetupInput): Promise<void> {
  const agentCatalogs = new AgentCatalogProvider(rootDir);
  const mcpServersDir = resolve(rootDir, "shared/mcp-servers");
  const profilesDir = resolve(rootDir, "profiles");

  if (!existsSync(profilesDir)) {
    logger.warn("Profiles directory not found, skipping profile setup");
    return;
  }

  const allServerNames = discoverMcpServers(mcpServersDir);
  if (allServerNames.length > 0) {
    logger.info(`Discovered ${allServerNames.length} MCP server(s): ${allServerNames.join(", ")}`);
  }

  for (const profileId of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!profileId.isDirectory()) continue;

    const profileJsonPath = join(profilesDir, profileId.name, "profile.json");
    if (!existsSync(profileJsonPath)) continue;

    let variants: IAgentProfile[];
    try {
      variants = resolveProfileVariants(readProfileFile(profileJsonPath), profileId.name);
    } catch (err) {
      logger.warn(`Skipping profile ${profileId.name}: invalid profile.json — ${toErrorMessage(err)}`);
      continue;
    }

    const profile = allVariantsOf(variants);
    logger.info(
      `Setting up profile ${profileId.name} (${profile.mcpServers.length} MCP server` +
        `${profile.mcpServers.length === 1 ? "" : "s"})`,
    );

    const buildDir = profileBuildPaths(rootDir, profileId.name).buildDir;
    rmSync(buildDir, { recursive: true, force: true });
    mkdirSync(buildDir, { recursive: true });

    // World-writable so the vscode user inside containers can create files
    const attachDir = join(buildDir, "attachments");
    mkdirSync(attachDir);
    chmodSync(attachDir, 0o777);

    writeFileSync(join(buildDir, ".gitignore"), "*\n", "utf-8");

    const preInitScript = generatePreInitScript(mcpServersDir, [...profile.mcpServers]);
    if (preInitScript) {
      const preInitPath = join(buildDir, "pre-init.sh");
      writeFileSync(preInitPath, preInitScript, "utf-8");
      chmodSync(preInitPath, 0o755);
    }

    const agents = await agentCatalogs.load(profileId.name);
    writeComposeArtifacts({ rootDir, cliRuntimes, profile, agents, logger });
  }
}
