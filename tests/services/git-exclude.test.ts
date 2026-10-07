import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendGitExclude, gitExcludePatterns } from "../../src/services/git-exclude";

const HEADER = "# ralph-orchestrator: paths the agent CLIs mount into the workspace";

describe("gitExcludePatterns", () => {
  it("keeps .ralph/ first and anchors each mount target outside it to the repo root", () => {
    // Act
    const patterns = gitExcludePatterns([".ralph/claude/agents/", ".github/agents/", ".github/hooks/ralph-audit.json"]);

    // Assert
    expect(patterns).toEqual([".ralph/", "/.github/agents/", "/.github/hooks/ralph-audit.json"]);
  });

  it("lists a target two CLIs share once", () => {
    // Act & Assert
    expect(gitExcludePatterns([".github/agents/", ".github/agents/"])).toEqual([".ralph/", "/.github/agents/"]);
  });

  it("is just .ralph/ when nothing is mounted outside it", () => {
    // Act & Assert
    expect(gitExcludePatterns([])).toEqual([".ralph/"]);
  });
});

describe("appendGitExclude", () => {
  let repo: string;
  const excludePath = () => join(repo, ".git", "info", "exclude");

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "git-exclude-"));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("appends the patterns under a header after what the exclude file holds", () => {
    // Arrange
    mkdirSync(join(repo, ".git", "info"), { recursive: true });
    writeFileSync(excludePath(), "# git ls-files --others --exclude-from=.git/info/exclude\n*.log\n");

    // Act
    appendGitExclude(repo, [".ralph/", "/.github/agents/"]);

    // Assert
    expect(readFileSync(excludePath(), "utf-8")).toBe(
      `# git ls-files --others --exclude-from=.git/info/exclude\n*.log\n${HEADER}\n.ralph/\n/.github/agents/\n`,
    );
  });

  it("starts the patterns on their own line when the file lacks a final newline", () => {
    // Arrange
    mkdirSync(join(repo, ".git", "info"), { recursive: true });
    writeFileSync(excludePath(), "*.log");

    // Act
    appendGitExclude(repo, [".ralph/"]);

    // Assert
    expect(readFileSync(excludePath(), "utf-8")).toBe(`*.log\n${HEADER}\n.ralph/\n`);
  });

  it("creates .git/info/exclude when the clone has none", () => {
    // Arrange
    mkdirSync(join(repo, ".git"));

    // Act
    appendGitExclude(repo, [".ralph/"]);

    // Assert
    expect(readFileSync(excludePath(), "utf-8")).toBe(`${HEADER}\n.ralph/\n`);
  });
});
