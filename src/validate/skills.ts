import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { discoverSkills, SKILL_FILE } from "../container/setup/skill-includes";
import { FrontmatterError, parseFrontmatter, splitFrontmatter } from "../util/frontmatter";
import type { ValidationCollector } from "./types";

/** Longest skill description the Agent Skills format allows. */
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

/** Every problem with one skill's `SKILL.md` frontmatter. */
function skillFrontmatterProblems(name: string, dir: string): string[] {
  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseFrontmatter(splitFrontmatter(readFileSync(join(dir, SKILL_FILE), "utf-8")).frontmatter);
  } catch (err) {
    if (err instanceof FrontmatterError) return [err.message];
    throw err;
  }

  const problems: string[] = [];
  if (frontmatter.name !== name) {
    problems.push(`frontmatter name ${JSON.stringify(frontmatter.name)} must equal the folder name "${name}"`);
  }
  const { description } = frontmatter;
  if (typeof description !== "string" || description.trim() === "") {
    problems.push("frontmatter description must be a non-empty string");
  } else if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    problems.push(
      `frontmatter description is ${description.length} characters; the limit is ${MAX_SKILL_DESCRIPTION_LENGTH}`,
    );
  }
  return problems;
}

/**
 * Validate the runtime skills under `skillsDir`: each folder name is used once across all
 * categories (skills are rendered flat, one folder per name), and each `SKILL.md` has frontmatter
 * whose `name` equals its folder name and whose `description` is non-empty and within the Agent
 * Skills length limit.
 *
 * @param skillsDir The skill sources root (`shared/skills`); a missing directory has no skills.
 */
export function validateSkills(skillsDir: string, { errors }: ValidationCollector): void {
  for (const [name, dirs] of discoverSkills(skillsDir)) {
    const locations = dirs.map((dir) => `shared/skills/${relative(skillsDir, dir)}`);
    if (dirs.length > 1) {
      errors.push(`Skill name "${name}" is used by ${locations.join(", ")}\n  Each skill folder name must be unique`);
    }
    dirs.forEach((dir, i) => {
      for (const problem of skillFrontmatterProblems(name, dir)) {
        errors.push(`${locations[i]}/${SKILL_FILE}: ${problem}`);
      }
    });
  }
}
