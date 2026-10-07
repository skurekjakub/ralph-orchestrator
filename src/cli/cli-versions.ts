import packageJson from "../../package.json" with { type: "json" };
import { CliType } from "../config/types";

/** An exact `major.minor.patch` version: no range, tag or prerelease. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** Image build arg that carries each CLI's version into the profile Dockerfiles. */
const VERSION_BUILD_ARGS: Readonly<Record<CliType, string>> = {
  [CliType.Claude]: "CLAUDE_CODE_VERSION",
  [CliType.Copilot]: "COPILOT_CLI_VERSION",
};

/**
 * Checks the `agentCliVersions` object of the orchestrator's package.json: one exact version per CLI.
 *
 * @throws Error naming each CLI whose version is missing or not exact.
 */
export function parseAgentCliVersions(raw: Readonly<Record<string, unknown>>): Readonly<Record<CliType, string>> {
  const problems: string[] = [];
  const versions = {} as Record<CliType, string>;
  for (const cli of Object.values(CliType)) {
    const version = raw[cli];
    if (typeof version === "string" && EXACT_VERSION.test(version)) {
      versions[cli] = version;
    } else {
      problems.push(`${cli}: ${JSON.stringify(version)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`package.json agentCliVersions needs an exact x.y.z version per CLI (${problems.join(", ")})`);
  }
  return versions;
}

/** Docker build args that pin each CLI's version in the agent images. */
export function agentCliBuildArgs(versions: Readonly<Record<CliType, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.values(CliType).map((cli) => [VERSION_BUILD_ARGS[cli], versions[cli]]));
}

/** CLI versions the agent images install, pinned in the orchestrator's package.json (`agentCliVersions`). */
export const AGENT_CLI_VERSIONS = parseAgentCliVersions(packageJson.agentCliVersions);
