import { readFile, writeFile, mkdir, readdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { Liquid } from "liquidjs";
import type { Logger } from "../../logger";
import { registerCustomTags } from "./liquid-tags";
import type { TemplateContext } from "./agent-includes";

/**
 * Recursively collect all `.md` file paths under `dir`.
 */
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

/**
 * Find a skill directory by name anywhere under `skillsDir`.
 *
 * Skills can be organized into arbitrary subdirectories for better
 * organization (e.g., `shared/skills/domain/ralph-build-errors/`).
 * The search looks for `<name>/SKILL.md` recursively and returns the
 * matching directory path, or `undefined` if not found.
 *
 * Skips the `.build/` output directory.
 */
async function findSkillDir(skillsDir: string, name: string): Promise<string | undefined> {
  // Fast path: check flat layout first
  const flatPath = join(skillsDir, name);
  if (existsSync(join(flatPath, "SKILL.md"))) return flatPath;

  // Recursive search for nested layout
  const entries = await readdir(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".build") continue;
    if (entry.name === name && existsSync(join(skillsDir, entry.name, "SKILL.md"))) {
      return join(skillsDir, entry.name);
    }
    // Search one level deeper
    const nested = join(skillsDir, entry.name);
    const nestedPath = join(nested, name);
    if (existsSync(join(nestedPath, "SKILL.md"))) return nestedPath;
    // Recurse further
    const found = await findSkillDir(nested, name);
    if (found) return found;
  }
  return undefined;
}

/**
 * Render skill templates to resolved files in `shared/skills/.build/<name>/`.
 *
 * For each declared skill, copies the entire skill directory to the build
 * output, then renders `.md` files through Liquid (same includes + custom
 * tags as agent templates). Non-`.md` files are copied unchanged.
 *
 * The Liquid engine is rooted at both `skillsDir` (so skills can reference
 * other skill partials) and `includesDir` (shared agent-includes partials).
 *
 * @param skillsDir Absolute path to `shared/skills/` on the host.
 * @param skillNames Skill folder names to render.
 * @param includesDir Absolute path to `shared/agent-includes/`.
 * @param context Template variables for Liquid rendering.
 * @param logger Logger for progress and error reporting.
 */
export async function resolveSkillIncludes(
  skillsDir: string,
  skillNames: string[],
  includesDir: string,
  context: Record<string, unknown>,
  logger?: Logger,
): Promise<void> {
  if (skillNames.length === 0) return;

  const buildDir = join(skillsDir, ".build");
  await mkdir(buildDir, { recursive: true });

  const engine = new Liquid({
    root: [skillsDir, includesDir],
    extname: ".md",
    globals: context,
  });
  registerCustomTags(engine);

  for (const name of skillNames) {
    const srcDir = await findSkillDir(skillsDir, name);
    if (!srcDir) {
      logger?.warn(`Skill directory not found: ${name}, skipping`);
      continue;
    }

    // Always flatten to .build/<name>/ regardless of source nesting
    const destDir = join(buildDir, name);
    // Copy the entire skill directory first (preserves non-.md files unchanged)
    await cp(srcDir, destDir, { recursive: true });

    // Render all .md files recursively through Liquid
    const mdFiles = await collectMdFiles(destDir);
    for (const filePath of mdFiles) {
      const content = await readFile(filePath, "utf-8");
      const rendered = await engine.parseAndRender(content, context);
      await writeFile(filePath, rendered, "utf-8");
      const relPath = relative(buildDir, filePath);
      logger?.info(`  → skill ${relPath}: rendered`);
    }
  }
}

/** Public contract for JIT skill template rendering. */
export interface ISkillTemplateRenderer {
  /** Render skill templates with the pre-built template context. */
  render(context: TemplateContext, logger?: Logger): Promise<void>;
}

/**
 * JIT skill template renderer.
 *
 * Renders all skill templates declared by the profile through Liquid,
 * writing output to `shared/skills/.build/<name>/`. Called before each
 * task so skills can use runtime data like `{{ taskId }}`.
 */
export class SkillTemplateRenderer implements ISkillTemplateRenderer {
  constructor() {}

  async render(context: TemplateContext, logger?: Logger): Promise<void> {
    const root = process.cwd();
    const skillsDir = resolve(root, "shared/skills");
    const includesDir = resolve(root, "shared/agent-includes");

    const skillNames = [...context.skills];

    if (!existsSync(skillsDir)) {
      logger?.warn("Skills directory not found, skipping skill rendering");
      return;
    }

    // Clean stale skills from previous variant before rendering current variant's skills
    const buildDir = join(skillsDir, ".build");
    if (existsSync(buildDir)) {
      const { rm } = await import("node:fs/promises");
      await rm(buildDir, { recursive: true });
    }

    if (skillNames.length === 0) return;

    logger?.info(`Rendering ${skillNames.length} skill template(s)`);
    await resolveSkillIncludes(skillsDir, skillNames, includesDir, context, logger);
  }
}
