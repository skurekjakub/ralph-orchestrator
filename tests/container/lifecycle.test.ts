import { describe, it, expect, vi, beforeEach } from "vitest";
import { RepoSyncHook } from "../../src/container/lifecycle.js";
import { makeProfile, makeTaskContext } from "../helpers/factories.js";
import { createMockContainer, createMockLogger } from "../helpers/mocks.js";
import { VcsProvider } from "../../src/config/types.js";

vi.mock("execa", async (importOriginal) => {
  const orig = await importOriginal<typeof import("execa")>();
  return { ...orig, execa: vi.fn().mockResolvedValue({ exitCode: 0 }) };
});

import { execa } from "execa";
const mockExeca = vi.mocked(execa);

describe("RepoSyncHook", () => {
  const profile = makeProfile({ id: "ralph-docs" });
  const taskCtx = makeTaskContext({ profile });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADO_PAT", "test-pat");
  });

  it("has the name 'repo-sync'", () => {
    expect(new RepoSyncHook().name).toBe("repo-sync");
  });

  it("runs fetch, checkout, reset --hard on the host repo path", async () => {
    const { container } = createMockContainer();
    const logger = createMockLogger();

    await new RepoSyncHook().execute(container, taskCtx, logger);

    const calls = mockExeca.mock.calls.map((c) => c[1]);
    expect(calls[0]).toEqual(["-C", profile.repoPath, "-c", expect.stringContaining("http.extraHeader=Authorization: Basic"), "fetch", "origin", "main"]);
    expect(calls[1]).toEqual(["-C", profile.repoPath, "checkout", "main"]);
    expect(calls[2]).toEqual(["-C", profile.repoPath, "reset", "--hard", "origin/main"]);
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
    const ctx = makeTaskContext({ profile, triggerParams: { source_branch: "develop" } });

    await new RepoSyncHook().execute(container, ctx, createMockLogger());

    const calls = mockExeca.mock.calls.map((c) => c[1]);
    expect(calls[0]).toContain("develop");
    expect(calls[2]).toContain("origin/develop");
  });

  it("logs sync progress", async () => {
    const { container } = createMockContainer();
    const logger = createMockLogger();

    await new RepoSyncHook().execute(container, taskCtx, logger);

    expect(logger.info).toHaveBeenCalledWith("Syncing repo to main...");
    expect(logger.info).toHaveBeenCalledWith("Repo sync complete");
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
});
