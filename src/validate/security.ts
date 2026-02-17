import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ValidationCollector } from "./types.js";

/**
 * Validate that the shared security infrastructure is present and that
 * profile compose files are compatible with the security overlay.
 *
 * Checks:
 * - Security overlay compose file exists
 * - Squid proxy config exists
 * - Each profile's compose file uses the ralph-internal network
 * - No profile mounts the Docker socket
 */
export function validateSecurityInfra({ errors }: ValidationCollector): void {
  const securityDir = resolve(process.cwd(), "shared/security");
  const overlayPath = join(securityDir, "docker-compose.security.yml");
  const squidConfPath = join(securityDir, "squid.conf");

  if (!existsSync(overlayPath)) {
    errors.push(
      `shared/security/docker-compose.security.yml not found\n` +
      `  The security overlay is required for network isolation (Squid proxy + internal network)`
    );
  }

  if (!existsSync(squidConfPath)) {
    errors.push(
      `shared/security/squid.conf not found\n` +
      `  The Squid proxy allowlist config is required by the security overlay`
    );
  }

  if (!existsSync(overlayPath)) return;

  const profilesDir = resolve(process.cwd(), "profiles");
  if (!existsSync(profilesDir)) return;

  let dirs: string[];
  try {
    dirs = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return;
  }

  for (const dirName of dirs) {
    const composePath = join(profilesDir, dirName, "docker-compose.yml");
    if (!existsSync(composePath)) continue;

    let content: string;
    try {
      content = readFileSync(composePath, "utf-8");
    } catch {
      continue;
    }

    const prefix = `profiles/${dirName}`;

    if (!content.includes("ralph-internal")) {
      errors.push(
        `${prefix}/docker-compose.yml: missing ralph-internal network\n` +
        `  The app service must use the ralph-internal network for security overlay compatibility`
      );
    }

    if (content.includes("docker.sock")) {
      errors.push(
        `${prefix}/docker-compose.yml: Docker socket mount detected\n` +
        `  Remove /var/run/docker.sock — the agent does not need host Docker access`
      );
    }
  }
}
