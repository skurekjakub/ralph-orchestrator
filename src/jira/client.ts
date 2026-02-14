import type { JiraConfig } from "../config.js";
import type {
  JiraIssue,
  JiraSearchResponse,
  JiraComment,
  JiraCommentResponse,
  JiraAttachment,
} from "./types.js";

/**
 * Lightweight JIRA REST API v3 client for Atlassian Cloud.
 *
 * Uses native `fetch` with Basic auth (`email:apiToken`). No JIRA SDK dependency.
 * Cloud endpoint: `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/`.
 */
export class JiraClient {
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
    private apiToken: string
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

  /** Search issues using JQL (v3 /search/jql endpoint) */
  async searchIssues(jql: string, maxResults = 20): Promise<JiraIssue[]> {
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      fields: "*all",
    });
    const data = await this.request<JiraSearchResponse>(
      "GET",
      `/rest/api/3/search/jql?${params}`
    );
    return data.issues;
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
}
