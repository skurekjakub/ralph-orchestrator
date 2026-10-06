import { VcsProvider, type IAgentProfile } from "../config/types.js";
import type { Logger } from "../logger.js";

/** Resolved source and target branch names for an existing pull request. */
export interface PullRequestBranchInfo {
  readonly sourceBranch: string;
  readonly targetBranch: string;
}

/** Facade for resolving pull-request metadata from the profile's configured VCS provider. */
export interface IVcsSourceClient {
  /**
   * Resolve source and target branches for a pull request URL.
   *
   * Returns `null` when the URL shape is unsupported, the provider is not
   * implemented, or required credentials are missing.
   */
  resolvePullRequestBranches(
    profile: IAgentProfile,
    prUrl: string,
    logger: Logger,
  ): Promise<PullRequestBranchInfo | null>;
}

interface IVcsSourceProviderClient {
  readonly provider: VcsProvider;
  resolvePullRequestBranches(
    profile: IAgentProfile,
    prUrl: string,
    pat: string,
    logger: Logger,
  ): Promise<PullRequestBranchInfo | null>;
}

type AdoPullRequestResponse = {
  readonly sourceRefName: string;
  readonly targetRefName: string;
};

type GitHubPullRequestResponse = {
  readonly head: {
    readonly ref: string;
  };
  readonly base: {
    readonly ref: string;
  };
};

const ADO_PR_URL = /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)$/i;
const GITHUB_PR_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/i;

function stripRefPrefix(refName: string): string {
  return refName.replace(/^refs\/heads\//, "");
}

function buildAuthHeaders(provider: VcsProvider, pat: string): Record<string, string> {
  switch (provider) {
    case VcsProvider.Ado:
      return {
        Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
        Accept: "application/json",
      };
    case VcsProvider.GitHub:
      return {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
      };
  }
}

class AdoVcsSourceProviderClient implements IVcsSourceProviderClient {
  readonly provider = VcsProvider.Ado;

  async resolvePullRequestBranches(
    _profile: IAgentProfile,
    prUrl: string,
    pat: string,
    logger: Logger,
  ): Promise<PullRequestBranchInfo | null> {
    const match = prUrl.match(ADO_PR_URL);
    if (!match) {
      logger.warn(`Skipping PR branch resolution — unsupported ADO PR URL format: ${prUrl}`);
      return null;
    }

    const [, organization, project, repository, pullRequestId] = match;
    const apiUrl = new URL(
      `${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repository)}/pullRequests/${pullRequestId}`,
      `https://dev.azure.com/${organization}/`,
    );
    apiUrl.searchParams.set("api-version", "7.1");

    logger.info(`Resolving PR branches from ${prUrl}...`);
    const response = await fetch(apiUrl, {
      headers: buildAuthHeaders(VcsProvider.Ado, pat),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Azure DevOps pull request metadata (${response.status} ${response.statusText})`);
    }

    const data = (await response.json()) as AdoPullRequestResponse;
    return {
      sourceBranch: stripRefPrefix(data.sourceRefName),
      targetBranch: stripRefPrefix(data.targetRefName),
    };
  }
}

class GitHubVcsSourceProviderClient implements IVcsSourceProviderClient {
  readonly provider = VcsProvider.GitHub;

  async resolvePullRequestBranches(
    _profile: IAgentProfile,
    prUrl: string,
    pat: string,
    logger: Logger,
  ): Promise<PullRequestBranchInfo | null> {
    const match = prUrl.match(GITHUB_PR_URL);
    if (!match) {
      logger.warn(`Skipping PR branch resolution — unsupported GitHub PR URL format: ${prUrl}`);
      return null;
    }

    const [, owner, repository, pullRequestId] = match;
    const apiUrl = new URL(`https://api.github.com/repos/${owner}/${repository}/pulls/${pullRequestId}`);

    logger.info(`Resolving PR branches from ${prUrl}...`);
    const response = await fetch(apiUrl, {
      headers: buildAuthHeaders(VcsProvider.GitHub, pat),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GitHub pull request metadata (${response.status} ${response.statusText})`);
    }

    const data = (await response.json()) as GitHubPullRequestResponse;
    return {
      sourceBranch: data.head.ref,
      targetBranch: data.base.ref,
    };
  }
}

/**
 * Provider-selecting facade for pull-request metadata lookup.
 *
 * The public contract stays provider-agnostic while the implementation is
 * chosen from the profile's configured {@link VcsProvider}.
 */
export class VcsSourceClient implements IVcsSourceClient {
  private readonly clients: ReadonlyMap<VcsProvider, IVcsSourceProviderClient>;

  constructor(
    clients: readonly IVcsSourceProviderClient[] = [
      new AdoVcsSourceProviderClient(),
      new GitHubVcsSourceProviderClient(),
    ],
  ) {
    this.clients = new Map(clients.map((client) => [client.provider, client]));
  }

  /** Resolve branches using the implementation registered for `profile.vcsProvider`. */
  async resolvePullRequestBranches(
    profile: IAgentProfile,
    prUrl: string,
    logger: Logger,
  ): Promise<PullRequestBranchInfo | null> {
    const client = this.clients.get(profile.vcsProvider);
    if (!client) {
      logger.warn(
        `Skipping PR branch resolution — no implementation registered for vcsProvider=${profile.vcsProvider}`,
      );
      return null;
    }

    const pat = process.env[profile.repoPat];
    if (!pat) {
      logger.warn(`Skipping PR branch resolution — ${profile.repoPat} is not set`);
      return null;
    }

    const result = await client.resolvePullRequestBranches(profile, prUrl, pat, logger);
    if (result) {
      logger.info(`PR branches resolved — source: ${result.sourceBranch}, target: ${result.targetBranch}`);
    }
    return result;
  }
}
