import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { IAgentProfile } from "../../config/types";

/**
 * Resolves the set of Docker Compose files for a given agent profile.
 *
 * Encapsulates the three-file merge pattern:
 * 1. **Base compose** — `profiles/<id>/docker-compose.yml`
 * 2. **Security overlay** — `shared/security/docker-compose.security.yml`
 * 3. **Resources overlay** — `profiles/<id>/.build/docker-compose.overlay.yml` (if present)
 *
 * The resources overlay is written at startup by {@link resolveAllProfileSetup} and rewritten for each task
 * by `ComposeOverlayWriter`; it is only included when the file exists on disk.
 *
 * @param profile Agent profile whose compose files to resolve.
 * @param rootDir Repository root the profile's relative paths resolve against.
 */
export function resolveComposeFiles(profile: IAgentProfile, rootDir: string): string[] {
  const base = resolve(rootDir, profile.composeFile);
  const security = resolve(rootDir, "shared/security/docker-compose.security.yml");
  const overlay = resolve(rootDir, "profiles", profile.id, ".build/docker-compose.overlay.yml");

  const files = [base, security];
  if (existsSync(overlay)) files.push(overlay);
  return files;
}
