import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COPILOT_CONTAINER_LAYOUT } from "../../cli/copilot/copilot-layout.js";

/**
 * Discover agent `.agent.md` templates and generate Docker Compose volume mounts.
 *
 * Agent templates are rendered to `.build/` at task time. This function generates
 * the mount lines pointing from `.build/<name>.agent.md` to
 * `/workspace/.github/agents/<name>.agent.md:ro` inside the container.
 *
 * @param profileDir Absolute path to the profile directory (e.g. `profiles/ralph-docs`).
 * @returns Array of volume mount strings (YAML-ready, indented for `services.app.volumes`).
 */
export function generateAgentVolumeMounts(profileDir: string): string[] {
  const agentsDir = join(profileDir, "agents");
  if (!existsSync(agentsDir)) return [];

  const agentFiles = readdirSync(agentsDir)
    .filter((f) => f.endsWith(".agent.md"))
    .sort();
  const buildDir = join(profileDir, ".build");

  return agentFiles.map((file) => `      - ${join(buildDir, file)}:${COPILOT_CONTAINER_LAYOUT.agentsDir}/${file}:ro`);
}

/**
 * Generate Docker Compose volume mounts for skill folders.
 *
 * Skills are rendered to `shared/skills/.build/<name>/` at task time (Liquid templates).
 * This function generates mount lines pointing from the skills build directory
 * to `/workspace/.github/skills/<name>/` inside the container.
 *
 * @param skillsDir Absolute path to `shared/skills/` on the host.
 * @param skillNames List of skill names declared by the profile.
 * @returns Array of volume mount strings (YAML-ready, indented for `services.app.volumes`).
 */
export function generateSkillVolumeMounts(skillsDir: string, skillNames: string[]): string[] {
  const buildDir = join(skillsDir, ".build");
  return skillNames.map((name) => `      - ${join(buildDir, name)}:${COPILOT_CONTAINER_LAYOUT.skillsDir}/${name}:ro`);
}
