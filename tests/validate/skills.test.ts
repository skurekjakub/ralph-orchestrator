import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MAX_SKILL_DESCRIPTION_LENGTH, validateSkills } from "../../src/validate/skills";
import type { ValidationCollector } from "../../src/validate/types";

let skillsDir: string;

beforeEach(() => {
  skillsDir = mkdtempSync(join(tmpdir(), "validate-skills-"));
});

afterEach(() => {
  rmSync(skillsDir, { recursive: true, force: true });
});

/** Writes `<path>/SKILL.md` with `content`. */
function writeSkill(path: string, content: string): void {
  mkdirSync(join(skillsDir, path), { recursive: true });
  writeFileSync(join(skillsDir, path, "SKILL.md"), content);
}

/** Errors `validateSkills` reports. */
function validate(): string[] {
  const collector: ValidationCollector = { errors: [], warnings: [] };
  validateSkills(skillsDir, collector);
  return collector.errors;
}

describe("validateSkills", () => {
  it("passes skills whose name matches their folder", () => {
    // Arrange
    writeSkill(
      "domain/ralph-build-errors",
      "---\nname: ralph-build-errors\ndescription: 'Fix build errors'\n---\n# Body\n",
    );

    // Act & Assert
    expect(validate()).toEqual([]);
  });

  it("reports a name used by folders in two categories", () => {
    // Arrange
    writeSkill("domain/dup", "---\nname: dup\ndescription: A\n---\n");
    writeSkill("workflow/dup", "---\nname: dup\ndescription: B\n---\n");

    // Act & Assert
    expect(validate()).toEqual([
      expect.stringMatching(/^Skill name "dup" is used by shared\/skills\/domain\/dup, shared\/skills\/workflow\/dup/),
    ]);
  });

  it("reports a frontmatter name that differs from the folder name", () => {
    // Arrange
    writeSkill("x", "---\nname: y\ndescription: X\n---\n");

    // Act & Assert
    expect(validate()).toEqual(['shared/skills/x/SKILL.md: frontmatter name "y" must equal the folder name "x"']);
  });

  it("reports a missing or too long description", () => {
    // Arrange
    writeSkill("empty", "---\nname: empty\n---\n");
    writeSkill("long", `---\nname: long\ndescription: '${"d".repeat(MAX_SKILL_DESCRIPTION_LENGTH + 1)}'\n---\n`);

    // Act & Assert
    expect(validate()).toEqual([
      "shared/skills/empty/SKILL.md: frontmatter description must be a non-empty string",
      `shared/skills/long/SKILL.md: frontmatter description is ${MAX_SKILL_DESCRIPTION_LENGTH + 1} characters; the limit is ${MAX_SKILL_DESCRIPTION_LENGTH}`,
    ]);
  });

  it("reports a SKILL.md without frontmatter", () => {
    // Arrange
    writeSkill("bare", "# Just a body\n");

    // Act & Assert
    expect(validate()).toEqual([
      expect.stringMatching(/^shared\/skills\/bare\/SKILL\.md: expected a frontmatter block/),
    ]);
  });

  it("passes when there is no skills directory", () => {
    // Arrange
    rmSync(skillsDir, { recursive: true });

    // Act & Assert
    expect(validate()).toEqual([]);
  });
});
