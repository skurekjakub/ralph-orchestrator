import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mergeComposeContributions, type ICliRuntimeRegistry } from "../../cli/cli-runtime";
import { AGENT_CLI_VERSIONS, agentCliBuildArgs } from "../../cli/cli-versions";
import type { AgentGraph } from "../../cli/agent-file-writer";
import type { IAgentProfile } from "../../config/types";
import type { Logger } from "../../logger";
import type { IAgentCatalogProvider } from "./agent-catalogs";
import { profileBuildPaths } from "./build-paths";
import { generateComposeOverlay } from "./compose-overlay";
import { generateMcpConfig, generateGatewayConfig } from "./mcp-config";
import { generateResourceVolumeMounts } from "./resource-mounts";
import { generateProfileSquidConf } from "./squid-config";
import { parseSquidDomains } from "./url-restrictions";

/** What one task's container artifacts are generated for. */
export interface ComposeArtifactsInput {
  /** The orchestrator checkout root. */
  readonly rootDir: string;
  readonly cliRuntimes: ICliRuntimeRegistry;
  /** The matched variant, or a profile standing for all its variants at startup. */
  readonly profile: IAgentProfile;
  /** The profile's subagent graph. */
  readonly agents: AgentGraph;
  readonly logger: Logger;
}

/**
 * Writes a task's container artifacts into `profiles/<id>/.build/`, scoped to the variant's MCP servers,
 * skills and container-stage CLIs: `squid.conf`, each CLI's own artifacts, `docker-compose.overlay.yml`,
 * `mcp-config.json` and `gateway.json`.
 *
 * `squid.conf` is written first because Copilot's URL allowlist is derived from it. Only the credential of
 * a CLI some container stage runs reaches the agent container.
 *
 * @throws Error when the baseline `shared/security/squid.conf` is missing, a CLI's artifact inputs are missing or
 * malformed (see `ICliRuntime.writeTaskArtifacts`), or two CLIs set the same container variable.
 */
export function writeComposeArtifacts({ rootDir, cliRuntimes, profile, agents, logger }: ComposeArtifactsInput): void {
  const paths = profileBuildPaths(rootDir, profile.id);
  const runtimes = cliRuntimes.forClis(profile.containerClis);
  const input = { profile, paths, agents };
  mkdirSync(paths.buildDir, { recursive: true });

  const baselineSquidPath = resolve(rootDir, "shared/security/squid.conf");
  if (!existsSync(baselineSquidPath)) {
    throw new Error(`Baseline squid.conf not found at ${baselineSquidPath}`);
  }
  const squidConf = generateProfileSquidConf(baselineSquidPath, {
    cliDomains: runtimes.flatMap((r) => r.egressDomains),
    profileDomains: profile.allowlistDomains,
  });
  writeFileSync(join(paths.buildDir, "squid.conf"), squidConf, "utf-8");
  const domains = parseSquidDomains(squidConf);
  logger.info(`Wrote squid.conf with ${domains.length} allowed domains: ${domains.join(", ")}`);

  for (const runtime of runtimes) runtime.writeTaskArtifacts(input, logger);

  const contribution = mergeComposeContributions(runtimes.map((r) => r.composeContribution(input)));
  const resourceVolumes = profile.resources ? generateResourceVolumeMounts(paths.profileDir, profile.resources) : [];
  const mcpServersDir = resolve(rootDir, "shared/mcp-servers");
  const serverNames = [...profile.mcpServers];

  const overlay = generateComposeOverlay({
    mcpServersDir,
    serverNames,
    buildDir: paths.buildDir,
    sidecarDir: resolve(rootDir, "shared/mcp-sidecar"),
    appVolumes: [...contribution.volumes, ...resourceVolumes],
    appEnv: contribution.env,
    appBuildArgs: agentCliBuildArgs(AGENT_CLI_VERSIONS),
    sidecarEnv: profile.mcpSidecarEnv,
    hasPreInit: existsSync(join(paths.buildDir, "pre-init.sh")),
  });
  writeFileSync(join(paths.buildDir, "docker-compose.overlay.yml"), overlay, "utf-8");

  const mcpConfig = generateMcpConfig(mcpServersDir, serverNames);
  writeFileSync(join(paths.buildDir, "mcp-config.json"), JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");

  const gatewayConfig = generateGatewayConfig(mcpServersDir, serverNames, process.env);
  writeFileSync(join(paths.buildDir, "gateway.json"), JSON.stringify(gatewayConfig, null, 2) + "\n", "utf-8");

  const clis = profile.containerClis.length > 0 ? profile.containerClis.join(", ") : "none";
  logger.info(
    `Regenerated compose overlay, mcp-config and gateway: container CLIs ${clis}, ` +
      `${profile.skills.length} skill(s), ${serverNames.length} MCP server(s)`,
  );
}

/** Regenerates the compose overlay and the configs it mounts for one task's variant. */
export interface IComposeOverlayWriter {
  /**
   * Regenerate the task-scoped container artifacts in the profile's build directory.
   *
   * @throws Error when the profile's agent templates are invalid or a CLI's artifact inputs are missing or malformed.
   */
  write(profile: IAgentProfile, logger: Logger): Promise<void>;
}

/** Per-task compose overlay writer rooted at the orchestrator's working directory. */
export class ComposeOverlayWriter implements IComposeOverlayWriter {
  private readonly cliRuntimes: ICliRuntimeRegistry;
  private readonly agentCatalogs: IAgentCatalogProvider;

  constructor({
    cliRuntimes,
    agentCatalogs,
  }: {
    cliRuntimes: ICliRuntimeRegistry;
    agentCatalogs: IAgentCatalogProvider;
  }) {
    this.cliRuntimes = cliRuntimes;
    this.agentCatalogs = agentCatalogs;
  }

  async write(profile: IAgentProfile, logger: Logger): Promise<void> {
    const agents = await this.agentCatalogs.load(profile.id);
    writeComposeArtifacts({ rootDir: process.cwd(), cliRuntimes: this.cliRuntimes, profile, agents, logger });
  }
}
