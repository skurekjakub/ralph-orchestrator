import { readFile, writeFile, mkdir, readdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Liquid } from "liquidjs";
import type { Logger } from "../../logger.js";
import { registerCustomTags } from "./liquid-tags.js";
import type { TemplateContext } from "./agent-includes.js";

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
    const srcDir = join(skillsDir, name);
    if (!existsSync(srcDir)) {
      logger?.warn(`Skill directory not found: ${name}, skipping`);
      continue;
    }

    const destDir = join(buildDir, name);
    // Copy the entire skill directory first (preserves non-.md files unchanged)
    await cp(srcDir, destDir, { recursive: true });

    // Then render all .md files in-place through Liquid
    const files = await readdir(destDir);
    for (const file of files.filter((f) => f.endsWith(".md"))) {
      const filePath = join(destDir, file);
      const content = await readFile(filePath, "utf-8");
      const rendered = await engine.parseAndRender(content, context);
      await writeFile(filePath, rendered, "utf-8");
      logger?.info(`  → skill ${name}/${file}: rendered`);
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
 * task so skills can use runtime data like `{{ issueKey }}`.
 */
export class SkillTemplateRenderer implements ISkillTemplateRenderer {
  constructor() {}

  async render(context: TemplateContext, logger?: Logger): Promise<void> {
    const root = process.cwd();
    const skillsDir = resolve(root, "shared/skills");
    const includesDir = resolve(root, "shared/agent-includes");

    const skillNames = [...context.skills];
    if (skillNames.length === 0) return;

    if (!existsSync(skillsDir)) {
      logger?.warn("Skills directory not found, skipping skill rendering");
      return;
    }

    logger?.info(`Rendering ${skillNames.length} skill template(s)`);
    await resolveSkillIncludes(skillsDir, skillNames, includesDir, context, logger);
  }
}
