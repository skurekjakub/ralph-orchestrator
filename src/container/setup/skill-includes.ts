import { readFile, writeFile, readdir, cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import type { Logger } from "../../logger";
import { createTemplateEngine, type TemplateContext } from "./agent-includes";
import { syncDirectory } from "../../util/sync-dir";

/** File that marks a directory under `shared/skills/` as a skill. */
export const SKILL_FILE = "SKILL.md";

/** Dependency directories never searched for skills. */
const SKIPPED_DIRS = new Set(["node_modules"]);

/**
 * Every skill under `skillsDir`, keyed by folder name. Skills sit in arbitrary category folders
 * (`shared/skills/domain/ralph-build-errors/`); a directory holding a `SKILL.md` is a skill, and
 * nothing inside it is searched further.
 *
 * @returns Skill folder name → absolute directories using that name, sorted; more than one directory
 *   means the name is ambiguous. Empty when `skillsDir` does not exist.
 */
export function discoverSkills(skillsDir: string): Map<string, string[]> {
  const skills = new Map<string, string[]>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (existsSync(join(path, SKILL_FILE))) {
        skills.set(entry.name, [...(skills.get(entry.name) ?? []), path]);
      } else {
        walk(path);
      }
    }
  };
  if (existsSync(skillsDir)) walk(skillsDir);
  return skills;
}

/** Recursively collect all `.md` file paths under `dir`. */
async function collectMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectMdFiles(full)));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

/** Inputs of {@link renderSkills}. */
export interface RenderSkillsInput {
  /** Root of the skill sources (`shared/skills`). */
  readonly skillsDir: string;
  /** Skill folder names to render. */
  readonly skillNames: readonly string[];
  /** Root of the shared partials (`shared/agent-includes`). */
  readonly includesDir: string;
  readonly context: TemplateContext;
  /** Directory that receives one rendered folder per skill; synced in place, its own inode kept. */
  readonly outDir: string;
  /** Whether skill folders in `outDir` that are not in `skillNames` are removed. */
  readonly prune: boolean;
  readonly logger?: Logger;
}

/**
 * Renders skills into `outDir/<name>/`, flattening their category folders.
 *
 * Each skill folder is copied whole, then its `.md` files are rendered through Liquid with partials
 * from both `skillsDir` and `includesDir`; other files are copied unchanged. The output is staged
 * and synced, so `outDir` and each kept skill folder keep their inodes, and with `prune` skills not in
 * `skillNames` are removed from it. A skill that does not exist is skipped with a warning.
 *
 * @throws Error when a skill name matches more than one folder or a Liquid template fails.
 */
export async function renderSkills(input: RenderSkillsInput): Promise<void> {
  const { skillsDir, skillNames, includesDir, context, outDir, prune, logger } = input;
  const available = discoverSkills(skillsDir);
  const engine = createTemplateEngine([skillsDir, includesDir]);

  const staging = await mkdtemp(join(tmpdir(), "ralph-skills-"));
  try {
    for (const name of skillNames) {
      const dirs = available.get(name) ?? [];
      if (dirs.length === 0) {
        logger?.warn(`Skill directory not found: ${name}, skipping`);
        continue;
      }
      if (dirs.length > 1) {
        throw new Error(`Skill "${name}" is ambiguous: ${dirs.map((d) => relative(skillsDir, d)).join(", ")}`);
      }

      const destDir = join(staging, name);
      await cp(dirs[0], destDir, { recursive: true });
      for (const filePath of await collectMdFiles(destDir)) {
        const content = await readFile(filePath, "utf-8");
        await writeFile(filePath, await engine.parseAndRender(content, context, { globals: context }), "utf-8");
        logger?.info(`  → skill ${relative(staging, filePath)}: rendered`);
      }
    }
    await syncDirectory(staging, outDir, { prune });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Where one render's skills go. */
export interface SkillRenderTarget {
  /** The profile's skills build directory. */
  readonly outDir: string;
  /** Whether skill folders the render does not write are removed. */
  readonly prune: boolean;
}

/** Public contract for JIT skill template rendering. */
export interface ISkillTemplateRenderer {
  /**
   * Render `context.skills` into `target.outDir`, removing any other skill folder there when `target.prune`.
   *
   * @throws Error when rendering fails (see {@link renderSkills}).
   */
  render(context: TemplateContext, target: SkillRenderTarget, logger?: Logger): Promise<void>;
}

/**
 * JIT skill template renderer.
 *
 * Renders the skills of the current stage from `shared/skills/` (partials from
 * `shared/agent-includes/`) under the orchestrator root. Called before each task and stage so
 * skills can use runtime data like `{{ taskId }}`.
 */
export class SkillTemplateRenderer implements ISkillTemplateRenderer {
  constructor() {}

  async render(context: TemplateContext, { outDir, prune }: SkillRenderTarget, logger?: Logger): Promise<void> {
    const root = process.cwd();
    const skillsDir = resolve(root, "shared/skills");
    const includesDir = resolve(root, "shared/agent-includes");

    if (!existsSync(skillsDir)) {
      logger?.warn("Skills directory not found, skipping skill rendering");
      return;
    }

    logger?.info(`Rendering ${context.skills.length} skill template(s)`);
    await renderSkills({ skillsDir, skillNames: context.skills, includesDir, context, outDir, prune, logger });
  }
}
