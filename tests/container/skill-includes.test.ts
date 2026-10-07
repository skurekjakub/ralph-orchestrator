import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, stat, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverSkills,
  renderSkills,
  SkillTemplateRenderer,
  skillsBuildDir,
  type RenderSkillsInput,
} from "../../src/container/setup/skill-includes";
import { createMockLogger } from "../helpers/mocks";
import { makeTemplateContext } from "../helpers/factories";
import type { TemplateContext } from "../../src/container/setup/agent-includes";

let tmpDir: string;
let originalCwd: string;
let skillsDir: string;
let includesDir: string;
let outDir: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = await mkdtemp(join(tmpdir(), "skill-includes-test-"));
  process.chdir(tmpDir);
  skillsDir = join(tmpDir, "shared", "skills");
  includesDir = join(tmpDir, "shared", "agent-includes");
  outDir = join(tmpDir, "profiles", "p", ".build", "skills");
  await mkdir(skillsDir, { recursive: true });
  await mkdir(includesDir, { recursive: true });
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tmpDir, { recursive: true, force: true });
});

/** Writes `files` (paths relative to `shared/skills/`). */
async function writeSkillFiles(files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const full = join(skillsDir, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content);
  }
}

/** renderSkills input for `skillNames` with `context`. */
function input(skillNames: string[], context: Partial<TemplateContext> = {}): RenderSkillsInput {
  return { skillsDir, skillNames, includesDir, context: makeTemplateContext(context), outDir };
}

describe("renderSkills", () => {
  it("renders .md files through Liquid with context", async () => {
    // Arrange
    await writeSkillFiles({ "my-skill/SKILL.md": "Skill for {{ taskId }} in {{ taskProject }}" });

    // Act
    await renderSkills(input(["my-skill"], { taskId: "DOC-42", taskProject: "DOC" }));

    // Assert
    expect(await readFile(join(outDir, "my-skill", "SKILL.md"), "utf-8")).toBe("Skill for DOC-42 in DOC");
  });

  it("names the stage's tools through cliTools", async () => {
    // Arrange
    await writeSkillFiles({ "my-skill/SKILL.md": "Dispatch with {{ cliTools.subagent }}" });

    // Act
    await renderSkills(input(["my-skill"]));

    // Assert
    expect(await readFile(join(outDir, "my-skill", "SKILL.md"), "utf-8")).toBe("Dispatch with task");
  });

  it("copies non-.md files unchanged and keeps their mode", async () => {
    // Arrange
    await writeSkillFiles({ "my-skill/SKILL.md": "# Skill", "my-skill/helper.sh": "#!/bin/bash\necho {{ taskId }}" });
    await chmod(join(skillsDir, "my-skill", "helper.sh"), 0o755);

    // Act
    await renderSkills(input(["my-skill"]));

    // Assert
    const script = join(outDir, "my-skill", "helper.sh");
    expect(await readFile(script, "utf-8")).toBe("#!/bin/bash\necho {{ taskId }}");
    expect((await stat(script)).mode & 0o777).toBe(0o755);
  });

  it("resolves partials from agent-includes and from other skills", async () => {
    // Arrange
    await writeFile(join(includesDir, "shared-rules.md"), "Shared rules content");
    await writeSkillFiles({
      "skill-b/shared-defs.md": "Shared definitions",
      "skill-a/SKILL.md": "{% render 'shared-rules' %}\n{% render 'skill-b/shared-defs' %}",
    });

    // Act
    await renderSkills(input(["skill-a"]));

    // Assert
    expect(await readFile(join(outDir, "skill-a", "SKILL.md"), "utf-8")).toBe(
      "Shared rules content\nShared definitions",
    );
  });

  it("flattens nested skills to outDir/<name>/ and renders their reference files", async () => {
    // Arrange
    await writeSkillFiles({
      "domain/nested-skill/SKILL.md": "Nested skill for {{ taskId }}",
      "domain/nested-skill/references/guide.md": "Guide for {{ taskId }}",
    });

    // Act
    await renderSkills(input(["nested-skill"], { taskId: "DOC-99" }));

    // Assert
    expect(await readFile(join(outDir, "nested-skill", "SKILL.md"), "utf-8")).toBe("Nested skill for DOC-99");
    expect(await readFile(join(outDir, "nested-skill", "references", "guide.md"), "utf-8")).toBe("Guide for DOC-99");
  });

  it("supports custom section tags in skills", async () => {
    // Arrange
    await writeSkillFiles({ "sec-skill/SKILL.md": '{% section "rules" %}Be careful{% endsection %}' });

    // Act
    await renderSkills(input(["sec-skill"]));

    // Assert
    expect(await readFile(join(outDir, "sec-skill", "SKILL.md"), "utf-8")).toBe("<rules>\nBe careful\n</rules>");
  });

  it("removes skills of an earlier render that the stage no longer mounts, keeping the directory", async () => {
    // Arrange
    await writeSkillFiles({ "skill-a/SKILL.md": "A", "skill-b/SKILL.md": "B" });
    await renderSkills(input(["skill-a", "skill-b"]));
    const inodeBefore = (await stat(outDir)).ino;

    // Act
    await renderSkills(input(["skill-b"]));

    // Assert
    expect(await readdir(outDir)).toEqual(["skill-b"]);
    expect((await stat(outDir)).ino).toBe(inodeBefore);
  });

  it("empties outDir when the stage mounts no skills", async () => {
    // Arrange
    await writeSkillFiles({ "skill-a/SKILL.md": "A" });
    await renderSkills(input(["skill-a"]));

    // Act
    await renderSkills(input([]));

    // Assert
    expect(await readdir(outDir)).toEqual([]);
  });

  it("skips a missing skill with a warning", async () => {
    // Arrange
    const logger = createMockLogger();

    // Act
    await renderSkills({ ...input(["nonexistent"]), logger });

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("nonexistent"));
    expect(await readdir(outDir)).toEqual([]);
  });

  it("throws when a skill name matches folders in two categories", async () => {
    // Arrange
    await writeSkillFiles({ "a/dup/SKILL.md": "one", "b/dup/SKILL.md": "two" });

    // Act & Assert
    await expect(renderSkills(input(["dup"]))).rejects.toThrow(/Skill "dup" is ambiguous: a\/dup, b\/dup/);
  });

  it("logs each rendered file", async () => {
    // Arrange
    await writeSkillFiles({ "my-skill/SKILL.md": "Content" });
    const logger = createMockLogger();

    // Act
    await renderSkills({ ...input(["my-skill"]), logger });

    // Assert
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("my-skill/SKILL.md"));
  });
});

describe("discoverSkills", () => {
  it("finds skills at any depth, skipping .build and not searching inside a skill", async () => {
    // Arrange
    await writeSkillFiles({
      "flat/SKILL.md": "",
      "domain/deep/nested/SKILL.md": "",
      "flat/inner/SKILL.md": "",
      ".build/flat/SKILL.md": "",
    });

    // Act
    const skills = discoverSkills(skillsDir);

    // Assert
    expect(skills).toEqual(
      new Map([
        ["nested", [join(skillsDir, "domain", "deep", "nested")]],
        ["flat", [join(skillsDir, "flat")]],
      ]),
    );
  });

  it("lists every folder that uses an ambiguous name", async () => {
    // Arrange
    await writeSkillFiles({ "a/dup/SKILL.md": "", "b/dup/SKILL.md": "" });

    // Act
    const skills = discoverSkills(skillsDir);

    // Assert
    expect(skills.get("dup")).toEqual([join(skillsDir, "a", "dup"), join(skillsDir, "b", "dup")]);
  });

  it("returns no skills when the directory does not exist", () => {
    // Act & Assert
    expect(discoverSkills(join(tmpDir, "missing")).size).toBe(0);
  });
});

describe("SkillTemplateRenderer", () => {
  it("renders the context's skills from shared/skills into the given directory", async () => {
    // Arrange
    await writeSkillFiles({ "test-skill/SKILL.md": "Skill for {{ taskId }}" });

    // Act
    await new SkillTemplateRenderer().render(makeTemplateContext({ taskId: "DOC-55", skills: ["test-skill"] }), outDir);

    // Assert
    expect(await readFile(join(outDir, "test-skill", "SKILL.md"), "utf-8")).toBe("Skill for DOC-55");
  });

  it("warns and skips when shared/skills is missing", async () => {
    // Arrange
    await rm(skillsDir, { recursive: true });
    const logger = createMockLogger();

    // Act
    await new SkillTemplateRenderer().render(makeTemplateContext({ skills: ["any"] }), outDir, logger);

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("logs how many skills it renders", async () => {
    // Arrange
    await writeSkillFiles({ "test-skill/SKILL.md": "Content" });
    const logger = createMockLogger();

    // Act
    await new SkillTemplateRenderer().render(makeTemplateContext({ skills: ["test-skill"] }), outDir, logger);

    // Assert
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("1 skill template"));
  });
});

describe("skillsBuildDir", () => {
  it("is the profile's .build/skills directory under the orchestrator root", () => {
    // Act & Assert
    expect(skillsBuildDir("ralph-docs")).toBe(join(process.cwd(), "profiles", "ralph-docs", ".build", "skills"));
  });
});
