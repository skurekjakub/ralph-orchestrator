import type { JiraConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { RetryOptions } from "../retry.js";
import { withRetry } from "../retry.js";
import type {
  JiraIssue,
  JiraSearchResponse,
  JiraComment,
  JiraCommentResponse,
  JiraAttachment,
  JiraTransition,
  JiraTransitionsResponse,
} from "./types.js";

/** Public contract for the JIRA REST API client. */
export interface IJiraClient {
  searchIssues(jql: string, pageSize?: number): Promise<JiraIssue[]>;
  addComment(key: string, bodyText: string): Promise<void>;
  transitionIssue(key: string, transitionId: string): Promise<void>;
  getTransitions(key: string): Promise<JiraTransition[]>;
  findTransitionId(key: string, targetStatus: string): Promise<string | undefined>;
  getComments(key: string): Promise<JiraComment[]>;
  getAttachments(key: string): Promise<JiraAttachment[]>;
  downloadAttachment(contentUrl: string): Promise<string>;
  addAttachment(key: string, filename: string, content: string): Promise<void>;
}

/**
 * Lightweight JIRA REST API v3 client for Atlassian Cloud.
 *
 * Uses native `fetch` with Basic auth (`email:apiToken`). No JIRA SDK dependency.
 * Cloud endpoint: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`.
 */
export class JiraClient implements IJiraClient {
  private baseUrl: string;
  private authHeader: string;

  /**
   * @param config JIRA connection settings (base URL, cloud ID).
   * @param email Atlassian account email for Basic auth.
   * @param apiToken API token from id.atlassian.com.
   */
  constructor(
    config: JiraConfig,
    private email: string,
    private apiToken: string,
    private logger?: Logger,
    private retryOptions?: RetryOptions,
  ) {
    // Cloud API: https://api.atlassian.com/ex/jira/{cloudId}
    const base = config.baseUrl.replace(/\/+$/, "");
    this.baseUrl = `${base}/${config.cloudId}`;
    this.authHeader =
      "Basic " +
      Buffer.from(`${this.email}:${this.apiToken}`).toString("base64");
  }

  /**
   * Send a request to the JIRA REST API.
   * @throws Error if the response status is not 2xx.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `JIRA API ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`
      );
    }

    // Some endpoints return 204 with no body
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  /**
   * Search issues using JQL (v3 /search/jql endpoint).
   *
   * Auto-paginates using `nextPageToken` until all matching issues are fetched.
   * Uses 100 results per page to balance response size and API calls.
   */
  async searchIssues(jql: string, pageSize = 100): Promise<JiraIssue[]> {
    const allIssues: JiraIssue[] = [];
    let nextPageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        jql,
        maxResults: String(pageSize),
        fields: "*all",
      });
      if (nextPageToken) {
        params.set("nextPageToken", nextPageToken);
      }

      const data = await withRetry(
        () => this.request<JiraSearchResponse>("GET", `/rest/api/3/search/jql?${params}`),
        `JIRA search (page ${allIssues.length})`,
        this.logger,
        this.retryOptions,
      );
      allIssues.push(...data.issues);
      nextPageToken = data.isLast === false ? data.nextPageToken : undefined;
    } while (nextPageToken);

    return allIssues;
  }

  /** Add a comment to an issue */
  async addComment(key: string, bodyText: string): Promise<void> {
    await this.request("POST", `/rest/api/3/issue/${key}/comment`, {
      body: {
        version: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: bodyText }],
          },
        ],
      },
    });
  }

  /** Transition an issue to a new status */
  async transitionIssue(key: string, transitionId: string): Promise<void> {
    await this.request("POST", `/rest/api/3/issue/${key}/transitions`, {
      transition: { id: transitionId },
    });
  }

  /** Fetch available transitions for an issue in its current workflow status. */
  async getTransitions(key: string): Promise<JiraTransition[]> {
    const data = await this.request<JiraTransitionsResponse>(
      "GET",
      `/rest/api/3/issue/${key}/transitions`,
    );
    return data.transitions;
  }

  /**
   * Find the transition ID that moves the issue to the given target status.
   *
   * Matches `transition.to.name` case-insensitively against `targetStatus`.
   * Returns the first matching transition ID, or `undefined` if no match.
   */
  async findTransitionId(key: string, targetStatus: string): Promise<string | undefined> {
    const transitions = await this.getTransitions(key);
    const target = targetStatus.toLowerCase();
    return transitions.find((t) => t.to.name.toLowerCase() === target)?.id;
  }

  /** Fetch all comments on an issue, ordered by creation date (oldest first). */
  async getComments(key: string): Promise<JiraComment[]> {
    const data = await this.request<JiraCommentResponse>(
      "GET",
      `/rest/api/3/issue/${key}/comment?orderBy=created&maxResults=100`
    );
    return data.comments;
  }

  /** List attachments on an issue (from the issue's fields). */
  async getAttachments(key: string): Promise<JiraAttachment[]> {
    const data = await this.request<{ fields: { attachment: JiraAttachment[] } }>(
      "GET",
      `/rest/api/3/issue/${key}?fields=attachment`
    );
    return data.fields.attachment ?? [];
  }

  /**
   * Download an attachment's content as a UTF-8 string.
   *
   * JIRA attachment `content` URLs point to a different domain
   * (e.g. `https://<site>.atlassian.net/...`) so we use the full URL directly.
   */
  async downloadAttachment(contentUrl: string): Promise<string> {
    const res = await fetch(contentUrl, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to download attachment: ${res.status} ${res.statusText}`
      );
    }
    return res.text();
  }

  /**
   * Upload a file as an attachment to a JIRA issue.
   *
   * Uses the multipart/form-data upload endpoint.
   *
   * @param key JIRA issue key (e.g. `DF-2759`).
   * @param filename Display name for the attachment.
   * @param content File content as a string.
   */
  async addAttachment(key: string, filename: string, content: string): Promise<void> {
    const blob = new Blob([content], { type: "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, filename);

    const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${key}/attachments`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "X-Atlassian-Token": "no-check",
      },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Failed to upload attachment: ${res.status} ${res.statusText} — ${text}`
      );
    }
  }
}
