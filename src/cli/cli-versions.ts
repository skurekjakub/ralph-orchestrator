import { join } from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { CliType } from "../config/types";

/** An exact `major.minor.patch` version: no range, tag or prerelease. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** The npm package of one agent CLI and the command it installs. */
export interface CliPackage {
  readonly name: string;
  readonly bin: string;
}

/** The npm package each CLI ships in. */
export const CLI_PACKAGES: Readonly<Record<CliType, CliPackage>> = {
  [CliType.Claude]: { name: "@anthropic-ai/claude-code", bin: "claude" },
  [CliType.Copilot]: { name: "@github/copilot", bin: "copilot" },
};

/** Image build arg that carries each CLI's version into the profile Dockerfiles. */
const VERSION_BUILD_ARGS: Readonly<Record<CliType, string>> = {
  [CliType.Claude]: "CLAUDE_CODE_VERSION",
  [CliType.Copilot]: "COPILOT_CLI_VERSION",
};

/**
 * Reads each CLI's version from the `dependencies` of the orchestrator's package.json, where each CLI package
 * is pinned to one exact version.
 *
 * @throws Error naming each CLI package that is missing or not pinned exactly.
 */
export function parseAgentCliVersions(
  dependencies: Readonly<Record<string, unknown>>,
): Readonly<Record<CliType, string>> {
  const problems: string[] = [];
  const versions = {} as Record<CliType, string>;
  for (const cli of Object.values(CliType)) {
    const { name } = CLI_PACKAGES[cli];
    const version = dependencies[name];
    if (typeof version === "string" && EXACT_VERSION.test(version)) {
      versions[cli] = version;
    } else {
      problems.push(`${name}: ${JSON.stringify(version)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `package.json dependencies need an exact x.y.z version of each agent CLI package (${problems.join(", ")})`,
    );
  }
  return versions;
}

/** Docker build args that pin each CLI's version in the agent images. */
export function agentCliBuildArgs(versions: Readonly<Record<CliType, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.values(CliType).map((cli) => [VERSION_BUILD_ARGS[cli], versions[cli]]));
}

/**
 * The CLI command the orchestrator's own `npm ci` installs, `<rootDir>/node_modules/.bin/<bin>`, at the version
 * pinned in package.json. Host stages run it by this path, never a CLI found on `PATH`.
 *
 * @param rootDir The orchestrator checkout root.
 */
export function hostCliBinary(rootDir: string, cli: CliType): string {
  return join(rootDir, "node_modules", ".bin", CLI_PACKAGES[cli].bin);
}

/**
 * CLI versions the agent images and host stages run: the exact versions of the CLI packages in the orchestrator's
 * package.json `dependencies`.
 */
export const AGENT_CLI_VERSIONS = parseAgentCliVersions(packageJson.dependencies);
