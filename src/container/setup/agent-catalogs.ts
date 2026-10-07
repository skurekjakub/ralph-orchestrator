import { existsSync } from "node:fs";
import { AgentCatalog } from "../../cli/agent-catalog";
import { profileBuildPaths } from "./build-paths";

/** Loads the agent catalog of a profile. */
export interface IAgentCatalogProvider {
  /**
   * The parsed agent templates of `profiles/<profileId>/agents`.
   *
   * @throws Error when the profile has no agents directory, a template is invalid or the templates do
   *   not form a valid agent graph.
   */
  load(profileId: string): Promise<AgentCatalog>;
}

/** Reads agent catalogs from the profiles under one orchestrator root. */
export class AgentCatalogProvider implements IAgentCatalogProvider {
  private readonly rootDir: string;

  /** @param deps.rootDir The orchestrator checkout root. */
  constructor({ rootDir }: { rootDir: string }) {
    this.rootDir = rootDir;
  }

  async load(profileId: string): Promise<AgentCatalog> {
    const { agentsDir } = profileBuildPaths(this.rootDir, profileId);
    if (!existsSync(agentsDir)) {
      throw new Error(`Profile ${profileId} has no agents directory: ${agentsDir}`);
    }
    return AgentCatalog.load(agentsDir);
  }
}
