import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSkillIncludes, SkillTemplateRenderer } from "../../src/container/setup/skill-includes";
import { createMockLogger } from "../helpers/mocks";
import { makeTemplateContext } from "../helpers/factories";

let tmpDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tmpDir = await mkdtemp(join(tmpdir(), "skill-includes-test-"));
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tmpDir, { recursive: true, force: true });
});

describe("resolveSkillIncludes", () => {
  it("renders .md files through Liquid with context", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "my-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(skillsDir, "my-skill", "SKILL.md"), "Skill for {{ taskId }} in {{ taskProject }}");

    await resolveSkillIncludes(skillsDir, ["my-skill"], includesDir, {
      taskId: "DOC-42",
      taskProject: "DOC",
    });

    const output = await readFile(join(skillsDir, ".build", "my-skill", "SKILL.md"), "utf-8");
    expect(output).toBe("Skill for DOC-42 in DOC");
  });

  it("copies non-.md files unchanged", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "my-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(skillsDir, "my-skill", "SKILL.md"), "# Skill");
    await writeFile(join(skillsDir, "my-skill", "helper.sh"), "#!/bin/bash\necho {{ taskId }}");

    await resolveSkillIncludes(skillsDir, ["my-skill"], includesDir, {});

    const script = await readFile(join(skillsDir, ".build", "my-skill", "helper.sh"), "utf-8");
    // Non-.md files are copied as-is, NOT rendered through Liquid
    expect(script).toBe("#!/bin/bash\necho {{ taskId }}");
  });

  it("resolves Liquid includes from agent-includes partials", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "my-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(includesDir, "shared-rules.md"), "Shared rules content");
    await writeFile(join(skillsDir, "my-skill", "SKILL.md"), "# Skill\n\n{% render 'shared-rules' %}\n\nEnd.");

    await resolveSkillIncludes(skillsDir, ["my-skill"], includesDir, {});

    const output = await readFile(join(skillsDir, ".build", "my-skill", "SKILL.md"), "utf-8");
    expect(output).toContain("Shared rules content");
    expect(output).not.toContain("{% render");
  });

  it("resolves Liquid includes from other skill partials via skills root", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "skill-a"), { recursive: true });
    await mkdir(join(skillsDir, "skill-b"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    // Skill B has a partial that skill A references
    await writeFile(join(skillsDir, "skill-b", "shared-defs.md"), "Shared definitions");
    await writeFile(join(skillsDir, "skill-a", "SKILL.md"), "# Skill A\n\n{% render 'skill-b/shared-defs' %}\n\nEnd.");

    await resolveSkillIncludes(skillsDir, ["skill-a"], includesDir, {});

    const output = await readFile(join(skillsDir, ".build", "skill-a", "SKILL.md"), "utf-8");
    expect(output).toContain("Shared definitions");
    expect(output).not.toContain("{% render");
  });

  it("handles multiple skills", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "skill-a"), { recursive: true });
    await mkdir(join(skillsDir, "skill-b"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(skillsDir, "skill-a", "SKILL.md"), "Skill A: {{ taskId }}");
    await writeFile(join(skillsDir, "skill-b", "SKILL.md"), "Skill B: {{ taskId }}");

    await resolveSkillIncludes(skillsDir, ["skill-a", "skill-b"], includesDir, {
      taskId: "DF-10",
    });

    const a = await readFile(join(skillsDir, ".build", "skill-a", "SKILL.md"), "utf-8");
    const b = await readFile(join(skillsDir, ".build", "skill-b", "SKILL.md"), "utf-8");
    expect(a).toBe("Skill A: DF-10");
    expect(b).toBe("Skill B: DF-10");
  });

  it("skips missing skill directories with warning", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(skillsDir, { recursive: true });
    await mkdir(includesDir, { recursive: true });

    const logger = createMockLogger();
    await resolveSkillIncludes(skillsDir, ["nonexistent"], includesDir, {}, logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("nonexistent"));
  });

  it("does nothing when skill list is empty", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await resolveSkillIncludes(skillsDir, [], includesDir, {});

    expect(existsSync(join(skillsDir, ".build"))).toBe(false);
  });

  it("supports custom section tags in skills", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "sec-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(skillsDir, "sec-skill", "SKILL.md"), '{% section "rules" %}Be careful{% endsection %}');

    await resolveSkillIncludes(skillsDir, ["sec-skill"], includesDir, {});

    const output = await readFile(join(skillsDir, ".build", "sec-skill", "SKILL.md"), "utf-8");
    expect(output).toBe("<rules>\nBe careful\n</rules>");
  });

  it("logs rendered files when logger provided", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "my-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });
    await writeFile(join(skillsDir, "my-skill", "SKILL.md"), "Content");

    const logger = createMockLogger();
    await resolveSkillIncludes(skillsDir, ["my-skill"], includesDir, {}, logger);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("my-skill/SKILL.md"));
  });

  it("discovers skills nested in subdirectories and flattens to .build/<name>/", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    // Skill nested under domain/ subfolder
    await mkdir(join(skillsDir, "domain", "nested-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(skillsDir, "domain", "nested-skill", "SKILL.md"), "Nested skill for {{ taskId }}");

    await resolveSkillIncludes(skillsDir, ["nested-skill"], includesDir, {
      taskId: "DOC-99",
    });

    // Output is flattened to .build/nested-skill/, not .build/domain/nested-skill/
    const output = await readFile(join(skillsDir, ".build", "nested-skill", "SKILL.md"), "utf-8");
    expect(output).toBe("Nested skill for DOC-99");
  });

  it("renders .md files in subdirectories recursively", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "ref-skill", "references"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(skillsDir, "ref-skill", "SKILL.md"), "Main skill for {{ taskId }}");
    await writeFile(join(skillsDir, "ref-skill", "references", "guide.md"), "Guide for {{ taskId }}");

    await resolveSkillIncludes(skillsDir, ["ref-skill"], includesDir, {
      taskId: "DOC-77",
    });

    const main = await readFile(join(skillsDir, ".build", "ref-skill", "SKILL.md"), "utf-8");
    const ref = await readFile(join(skillsDir, ".build", "ref-skill", "references", "guide.md"), "utf-8");
    expect(main).toBe("Main skill for DOC-77");
    expect(ref).toBe("Guide for DOC-77");
  });
});

describe("SkillTemplateRenderer", () => {
  it("renders skills into shared/skills/.build/", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "test-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });

    await writeFile(join(skillsDir, "test-skill", "SKILL.md"), "Skill for {{ taskId }}");

    const renderer = new SkillTemplateRenderer();
    await renderer.render(
      makeTemplateContext({
        taskId: "DOC-55",
        skills: ["test-skill"],
      }),
    );

    const output = await readFile(join(skillsDir, ".build", "test-skill", "SKILL.md"), "utf-8");
    expect(output).toBe("Skill for DOC-55");
  });

  it("does nothing when no skills are declared", async () => {
    const renderer = new SkillTemplateRenderer();
    // Should not throw even when shared/skills/ does not exist
    await renderer.render(makeTemplateContext({ skills: [] }));
  });

  it("warns when skills directory is missing", async () => {
    const renderer = new SkillTemplateRenderer();
    const logger = createMockLogger();

    await renderer.render(makeTemplateContext({ skills: ["nonexistent-skill"] }), logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
  });

  it("logs progress", async () => {
    const skillsDir = join(tmpDir, "shared", "skills");
    const includesDir = join(tmpDir, "shared", "agent-includes");

    await mkdir(join(skillsDir, "test-skill"), { recursive: true });
    await mkdir(includesDir, { recursive: true });
    await writeFile(join(skillsDir, "test-skill", "SKILL.md"), "Content");

    const logger = createMockLogger();
    const renderer = new SkillTemplateRenderer();
    await renderer.render(makeTemplateContext({ skills: ["test-skill"] }), logger);

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("1 skill template"));
  });
});
