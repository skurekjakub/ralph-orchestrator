import { existsSync } from "node:fs";
import { AgentCatalog } from "../../cli/agent-catalog";
import { profileBuildPaths } from "./build-paths";

/**
 * The parsed agent templates of `profiles/<profileId>/agents` under an orchestrator checkout.
 *
 * @param rootDir The orchestrator checkout root.
 * @throws Error when the profile has no agents directory, a template is invalid or the templates do
 *   not form a valid agent graph.
 */
export async function loadAgentCatalog(rootDir: string, profileId: string): Promise<AgentCatalog> {
  const { agentsDir } = profileBuildPaths(rootDir, profileId);
  if (!existsSync(agentsDir)) {
    throw new Error(`Profile ${profileId} has no agents directory: ${agentsDir}`);
  }
  return AgentCatalog.load(agentsDir);
}
