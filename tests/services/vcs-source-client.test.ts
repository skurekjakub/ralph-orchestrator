import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VcsProvider } from "../../src/config/types";
import { VcsSourceClient } from "../../src/services/vcs-source-client";
import { makeProfile } from "../helpers/factories";
import { createMockLogger } from "../helpers/mocks";

describe("VcsSourceClient", () => {
  const client = new VcsSourceClient();

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv("ADO_PAT", "test-pat");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("resolves source and target branches from an Azure DevOps PR URL", async () => {
    const profile = makeProfile({ vcsProvider: VcsProvider.Ado, repoPat: "ADO_PAT" });
    const logger = createMockLogger();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sourceRefName: "refs/heads/feature/revision-fix",
        targetRefName: "refs/heads/main",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const branches = await client.resolvePullRequestBranches(
      profile,
      "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
      logger,
    );

    expect(branches).toEqual({
      sourceBranch: "feature/revision-fix",
      targetBranch: "main",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns null for unsupported Azure DevOps PR URL shapes", async () => {
    const profile = makeProfile({ vcsProvider: VcsProvider.Ado, repoPat: "ADO_PAT" });
    const logger = createMockLogger();

    const branches = await client.resolvePullRequestBranches(
      profile,
      "https://dev.azure.com/org/project/_build/results?buildId=1",
      logger,
    );

    expect(branches).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("unsupported ADO PR URL format"));
  });

  it("returns null when the configured PAT env var is missing", async () => {
    vi.unstubAllEnvs();
    const profile = makeProfile({ vcsProvider: VcsProvider.Ado, repoPat: "ADO_PAT" });
    const logger = createMockLogger();

    const branches = await client.resolvePullRequestBranches(
      profile,
      "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
      logger,
    );

    expect(branches).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("ADO_PAT is not set"));
  });

  it("resolves source and target branches from a GitHub PR URL", async () => {
    vi.stubEnv("GH_TOKEN", "gh-test");
    const profile = makeProfile({ vcsProvider: VcsProvider.GitHub, repoPat: "GH_TOKEN" });
    const logger = createMockLogger();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        head: { ref: "feature/from-github" },
        base: { ref: "main" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const branches = await client.resolvePullRequestBranches(profile, "https://github.com/org/repo/pull/42", logger);

    expect(branches).toEqual({
      sourceBranch: "feature/from-github",
      targetBranch: "main",
    });
  });

  it("returns null for unsupported GitHub PR URL shapes", async () => {
    vi.stubEnv("GH_TOKEN", "gh-test");
    const profile = makeProfile({ vcsProvider: VcsProvider.GitHub, repoPat: "GH_TOKEN" });
    const logger = createMockLogger();

    const branches = await client.resolvePullRequestBranches(profile, "https://github.com/org/repo/issues/42", logger);

    expect(branches).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("unsupported GitHub PR URL format"));
  });

  it("returns null when no implementation is registered for the configured vcsProvider", async () => {
    const clientWithoutImplementations = new VcsSourceClient([]);
    const profile = makeProfile({ vcsProvider: VcsProvider.Ado, repoPat: "ADO_PAT" });
    const logger = createMockLogger();

    const branches = await clientWithoutImplementations.resolvePullRequestBranches(
      profile,
      "https://dev.azure.com/org/project/_git/repo/pullrequest/42",
      logger,
    );

    expect(branches).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("no implementation registered"));
  });
});
