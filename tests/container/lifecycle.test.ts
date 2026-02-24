import { describe, it, expect, vi, beforeEach } from "vitest";
import { RepoSyncHook } from "../../src/container/lifecycle.js";
import { makeProfile, makeTaskContext } from "../helpers/factories.js";
import { createMockContainer, createMockLogger } from "../helpers/mocks.js";

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

  it("throws when ADO_PAT is not set", async () => {
    vi.unstubAllEnvs();
    const { container } = createMockContainer();

    await expect(new RepoSyncHook().execute(container, taskCtx, createMockLogger()))
      .rejects.toThrow("ADO_PAT must be set");
  });

  it("propagates git errors", async () => {
    mockExeca.mockRejectedValueOnce(new Error("git fetch failed"));
    const { container } = createMockContainer();

    await expect(new RepoSyncHook().execute(container, taskCtx, createMockLogger()))
      .rejects.toThrow("git fetch failed");
  });
});
