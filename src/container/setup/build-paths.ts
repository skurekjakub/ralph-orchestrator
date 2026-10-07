import { join, resolve } from "node:path";
import type { CliType } from "../../config/types";

/** Host paths of a profile's sources and of the artifacts generated from them, which are mounted into the containers. */
export interface ProfileBuildPaths {
  /** `profiles/<id>`: profile.json, Dockerfile and resources. */
  readonly profileDir: string;
  /** `profiles/<id>/agents`: the canonical agent templates. */
  readonly agentsDir: string;
  /** `profiles/<id>/.build`: artifacts generated per task. */
  readonly buildDir: string;
  /** `profiles/<id>/.build/skills`: the current stage's rendered skills, one folder per skill. */
  readonly skillsBuildDir: string;
  /** `shared/hooks`: audit hook scripts, mounted read-only at `/workspace/.ralph/hooks`. */
  readonly hooksDir: string;
}

/**
 * `shared/hooks` of an orchestrator checkout: the audit hook scripts, the result gate and the redactor.
 *
 * @param rootDir The orchestrator checkout root.
 */
export function sharedHooksDir(rootDir: string): string {
  return resolve(rootDir, "shared/hooks");
}

/**
 * The build paths of one profile.
 *
 * @param rootDir The orchestrator checkout root.
 * @param profileId The profile's directory name under `profiles/`.
 */
export function profileBuildPaths(rootDir: string, profileId: string): ProfileBuildPaths {
  const profileDir = resolve(rootDir, "profiles", profileId);
  const buildDir = join(profileDir, ".build");
  return {
    profileDir,
    agentsDir: join(profileDir, "agents"),
    buildDir,
    skillsBuildDir: join(buildDir, "skills"),
    hooksDir: sharedHooksDir(rootDir),
  };
}

/** `profiles/<id>/.build/<cli>/agents`: the current stage's agents rendered for `cli`. */
export function agentsBuildDir(paths: ProfileBuildPaths, cli: CliType): string {
  return join(paths.buildDir, cli, "agents");
}
