import { describe, it, expect, vi, beforeEach } from "vitest";
import { RepoSyncHook, ensureGitExclude } from "../../src/container/lifecycle.js";
import { makeProfile, makeTaskContext, makeWorkItem } from "../helpers/factories.js";
import { createMockContainer, createMockLogger } from "../helpers/mocks.js";
import { VcsProvider } from "../../src/config/types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { slugifyBranchName } from "../../src/util/branch.js";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn().mockResolvedValue({ exitCode: 0 }) };
});

vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(""),
    writeFileSync: vi.fn(),
  };
});

import { execa } from "execa";
const mockExeca = vi.mocked(execa);

const mockMkdirSync = vi.mocked(mkdirSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe("RepoSyncHook", () => {
  const profile = makeProfile({ id: "ralph-docs" });
  const workItem = makeWorkItem("DF-100");
  const taskCtx = makeTaskContext({ profile, workItem });
  const expectedBranch = slugifyBranchName(workItem.id, workItem.title);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADO_PAT", "test-pat");
  });

  it("has the name 'repo-sync'", () => {
    expect(new RepoSyncHook().name).toBe("repo-sync");
  });

  it("runs fetch, checkout, reset --hard, then creates task branch", async () => {
    const { container } = createMockContainer();
    const logger = createMockLogger();

    await new RepoSyncHook().execute(container, taskCtx, logger);

    const calls = mockExeca.mock.calls.map((c) => c[1]);
    expect(calls[0]).toEqual(["-C", profile.repoPath, "-c", expect.stringContaining("http.extraHeader=Authorization: Basic"), "fetch", "origin", "main"]);
    expect(calls[1]).toEqual(["-C", profile.repoPath, "checkout", "main"]);
    expect(calls[2]).toEqual(["-C", profile.repoPath, "reset", "--hard", "origin/main"]);
    expect(calls[3]).toEqual(["-C", profile.repoPath, "checkout", "-b", expectedBranch]);
  });

  it("uses ADO auth header format by default", async () => {
    const { container } = createMockContainer();
    const expectedHeader = `Basic ${Buffer.from(":test-pat").toString("base64")}`;

    await new RepoSyncHook().execute(container, taskCtx, createMockLogger());

    const fetchArgs = mockExeca.mock.calls[0][1]!;
    expect(fetchArgs).toContain(`http.extraHeader=Authorization: ${expectedHeader}`);
  });

  it("uses GitHub auth header format when vcsProvider is github", async () => {
    const ghProfile = makeProfile({ id: "ralph-gh", vcsProvider: VcsProvider.GitHub, repoPat: "GH_TOKEN" });
    const ghCtx = makeTaskContext({ profile: ghProfile });
    vi.stubEnv("GH_TOKEN", "gh-test-pat");
    const { container } = createMockContainer();
    const expectedHeader = `Basic ${Buffer.from("x-access-token:gh-test-pat").toString("base64")}`;

    await new RepoSyncHook().execute(container, ghCtx, createMockLogger());

    const fetchArgs = mockExeca.mock.calls[0][1]!;
    expect(fetchArgs).toContain(`http.extraHeader=Authorization: ${expectedHeader}`);
  });

  it("reads credential from profile.repoPat env var name", async () => {
    const customProfile = makeProfile({ id: "custom", repoPat: "MY_CUSTOM_PAT" });
    const customCtx = makeTaskContext({ profile: customProfile });
    vi.stubEnv("MY_CUSTOM_PAT", "custom-secret");
    const { container } = createMockContainer();

    await new RepoSyncHook().execute(container, customCtx, createMockLogger());

    const fetchArgs = mockExeca.mock.calls[0][1] as string[];
    const headerArg = fetchArgs.find((a) => a.startsWith("http.extraHeader"));
    expect(headerArg).toContain(Buffer.from(":custom-secret").toString("base64"));
  });

  it("uses custom branch from trigger params", async () => {
    const { container } = createMockContainer();
    const ctx = makeTaskContext({ profile, workItem, triggerParams: { source_branch: "develop" } });

    await new RepoSyncHook().execute(container, ctx, createMockLogger());

    const calls = mockExeca.mock.calls.map((c) => c[1]);
    expect(calls[0]).toContain("develop");
    expect(calls[2]).toContain("origin/develop");
    // Task branch still created from the custom source branch
    expect(calls[3]).toEqual(["-C", profile.repoPath, "checkout", "-b", expectedBranch]);
  });

  it("creates .ralph/tasks/<key>/ directory on the host", async () => {
    const { container } = createMockContainer();

    await new RepoSyncHook().execute(container, taskCtx, createMockLogger());

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(`.ralph/tasks/${workItem.id}`),
      { recursive: true },
    );
  });

  it("throws when repoPat env var is not set", async () => {
    vi.unstubAllEnvs();
    const { container } = createMockContainer();

    await expect(new RepoSyncHook().execute(container, taskCtx, createMockLogger()))
      .rejects.toThrow('ADO_PAT must be set for repo-sync hook (profile "ralph-docs")');
  });

  it("propagates git errors", async () => {
    mockExeca.mockRejectedValueOnce(new Error("git fetch failed"));
    const { container } = createMockContainer();

    await expect(new RepoSyncHook().execute(container, taskCtx, createMockLogger()))
      .rejects.toThrow("git fetch failed");
  });

  it("switches to existing branch on revision without creating a new one", async () => {
    const { container } = createMockContainer();
    const revisionCtx = makeTaskContext({ profile, workItem, isRevision: true });

    await new RepoSyncHook().execute(container, revisionCtx, createMockLogger());

    const allArgs = mockExeca.mock.calls.map((c) => c[1]).flat();
    expect(allArgs).toContain(expectedBranch);
    expect(allArgs).not.toContain("-b");
  });

  it("populates .git/info/exclude with bind-mount artifact patterns during repo sync", async () => {
    const { container } = createMockContainer();

    await new RepoSyncHook().execute(container, taskCtx, createMockLogger());

    const excludeWrite = mockWriteFileSync.mock.calls.find(
      (call) => String(call[0]).includes(".git/info/exclude"),
    );
    expect(excludeWrite).toBeDefined();
    const content = excludeWrite![1] as string;
    expect(content).toContain(".ralph/");
    expect(content).toContain(".github/skills/");
    expect(content).toContain(".github/agents/");
  });
});

describe("ensureGitExclude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("");
  });

  it("writes orchestrator exclusion patterns inside managed marker block", () => {
    ensureGitExclude("/repo");

    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(written).toContain(".ralph/");
    expect(written).toContain(".github/skills/");
    expect(written).toContain(".github/agents/");
    expect(written).toContain("# >>>ralph-orchestrator");
    expect(written).toContain("# <<<ralph-orchestrator");
  });

  it("preserves existing content outside the managed block", () => {
    mockReadFileSync.mockReturnValue("*.log\nbuild/\n");

    ensureGitExclude("/repo");

    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(written).toContain("*.log\nbuild/\n");
    expect(written).toContain(".ralph/");
  });

  it("replaces the managed block on subsequent runs", () => {
    const existingContent = [
      "*.log",
      "# >>>ralph-orchestrator (managed — do not edit)",
      ".ralph/",
      "# <<<ralph-orchestrator",
      "build/",
    ].join("\n");
    mockReadFileSync.mockReturnValue(existingContent);

    ensureGitExclude("/repo");

    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    // Should contain the updated patterns
    expect(written).toContain(".github/skills/");
    expect(written).toContain(".github/agents/");
    // Should preserve content outside markers
    expect(written).toContain("*.log");
    expect(written).toContain("build/");
    // Should have exactly one managed block (no duplicates)
    const startCount = (written.match(/>>>ralph-orchestrator/g) ?? []).length;
    expect(startCount).toBe(1);
  });

  it("creates .git/info/ directory if absent", () => {
    mockExistsSync.mockImplementation((p) => {
      const path = String(p);
      if (path.endsWith(".git/info")) return false;
      if (path.endsWith("exclude")) return false;
      return true;
    });

    ensureGitExclude("/repo");

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining(".git/info"),
      { recursive: true },
    );
  });

  it("handles empty exclude file gracefully", () => {
    mockReadFileSync.mockReturnValue("");

    ensureGitExclude("/repo");

    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(written).toContain(".ralph/");
    expect(written).toMatch(/^# >>>ralph-orchestrator/);
  });

  it("strips orphaned start marker before appending fresh block", () => {
    const corrupted = [
      "*.log",
      "# >>>ralph-orchestrator (managed — do not edit)",
      ".ralph/",
      "build/",
    ].join("\n");
    mockReadFileSync.mockReturnValue(corrupted);

    ensureGitExclude("/repo");

    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    const startCount = (written.match(/>>>ralph-orchestrator/g) ?? []).length;
    expect(startCount).toBe(1);
    expect(written).toContain("*.log");
    expect(written).toContain(".github/skills/");
  });

  it("strips orphaned end marker before appending fresh block", () => {
    const corrupted = "*.log\n# <<<ralph-orchestrator\nbuild/\n";
    mockReadFileSync.mockReturnValue(corrupted);

    ensureGitExclude("/repo");

    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    const endCount = (written.match(/<<<ralph-orchestrator/g) ?? []).length;
    expect(endCount).toBe(1);
    expect(written).toContain("*.log");
    expect(written).toContain("build/");
  });

  it("does not produce duplicate newlines when replacing block with trailing newline", () => {
    const existing = "*.log\n# >>>ralph-orchestrator (managed — do not edit)\n.ralph/\n# <<<ralph-orchestrator\nbuild/\n";
    mockReadFileSync.mockReturnValue(existing);

    ensureGitExclude("/repo");

    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(written).not.toContain("\n\n\n");
  });
});
