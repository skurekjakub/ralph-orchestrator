import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Write profile `profileId` into the fixture orchestrator checkout `rootDir`: its agent templates, and the `squid.conf`
 * profile setup writes, without which a task scope's `squidConfPath` throws.
 *
 * @param agents Each agent template's source, keyed by its file id (`ralph.scientist` → `ralph.scientist.agent.md`).
 */
export function writeFixtureProfile(
  rootDir: string,
  profileId: string,
  agents: Readonly<Record<string, string>>,
): void {
  const profileDir = join(rootDir, "profiles", profileId);
  mkdirSync(join(profileDir, ".build"), { recursive: true });
  writeFileSync(join(profileDir, ".build", "squid.conf"), "");
  mkdirSync(join(profileDir, "agents"), { recursive: true });
  for (const [fileId, source] of Object.entries(agents)) {
    writeFileSync(join(profileDir, "agents", `${fileId}.agent.md`), source);
  }
}
