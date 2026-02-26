import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { IAgentProfile } from "../../config/types.js";

/**
 * Resolves the set of Docker Compose files for a given agent profile.
 *
 * Encapsulates the three-file merge pattern:
 * 1. **Base compose** — `profiles/<id>/docker-compose.yml`
 * 2. **Security overlay** — `shared/security/docker-compose.security.yml`
 * 3. **Resources overlay** — `profiles/<id>/.build/docker-compose.overlay.yml` (if present)
 *
 * The resources overlay is auto-generated at startup by {@link resolveAllProfileSetup}
 * and only included when the file exists on disk.
 */
export class ComposeFileResolver {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  /** Resolve compose file paths for a profile, applying the three-file merge pattern. */
  resolve(profile: IAgentProfile): string[] {
    const base = resolve(this.rootDir, profile.composeFile);
    const security = resolve(this.rootDir, "shared/security/docker-compose.security.yml");
    const overlay = resolve(this.rootDir, "profiles", profile.id, ".build/docker-compose.overlay.yml");

    const files = [base, security];
    if (existsSync(overlay)) files.push(overlay);
    return files;
  }
}
